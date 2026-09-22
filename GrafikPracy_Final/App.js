import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  ImageBackground,
  Share,
  Platform,
  Dimensions,
  Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as Notifications from 'expo-notifications';
import * as Clipboard from 'expo-clipboard';
import {captureRef} from 'react-native-view-shot';
import * as Location from 'expo-location';
import LiveLocationDashboard from './LiveLocationDashboard';
import {getVehicleLocationConfig, saveVehicleLocationAssignment, startVehicleLocationTracking, stopVehicleLocationTracking, LOCATION_CONFIG_KEY} from './LocationService';
import {FIREBASE_ENABLED, auth, db} from './firebaseConfig';
import NowDashboard from './NowDashboard';
import {onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut} from 'firebase/auth';
import {doc, setDoc, onSnapshot, serverTimestamp, collection, addDoc, query, where, updateDoc, orderBy, limit} from 'firebase/firestore';

const updateAndroidWidgets = () => {
  if (Platform.OS !== 'android') return;
  try {
    const {requestWidgetUpdate} = require('react-native-android-widget');
    const names = ['GrafikTeraz','GrafikAuto','GrafikRaport'];
    names.forEach(widgetName => requestWidgetUpdate({widgetName, renderWidget: () => null}).catch?.(() => {}));
  } catch (e) {}
};

const KEY = 'grafik-pracy-v5';
const LEGACY_KEY = 'grafik-pracy-v4';
const REPORT_PREFS_KEY = 'grafik-pracy-reports-v1';
const REPORT_NOTIFICATION_IDS_KEY = 'grafik-pracy-report-notification-ids-v1';
const REMEMBER_LOGIN_KEY = 'grafik-pracy-remember-login-v1';
const CHAT_LOCAL_KEY = 'grafik-pracy-chat-v1';
const REPORT_HISTORY_KEY = 'grafik-pracy-whatsapp-reports-v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});
const PEOPLE = {
  P: {name: 'Paweł', color: '#4f8cff'},
  M: {name: 'Mateusz', color: '#8f6cff'},
  L: {name: 'Łukasz', color: '#35c98a'}
};
const COLOR_PALETTE = [
  '#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e','#10b981','#14b8a6',
  '#06b6d4','#0ea5e9','#3b82f6','#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899',
  '#f43f5e','#fb7185','#a16207','#65a30d','#15803d','#0f766e','#0369a1','#1d4ed8',
  '#4338ca','#7e22ce','#be185d','#78716c','#64748b','#334155'
];
const PERSON_KEYS = Object.keys(PEOPLE);
const WAREHOUSES = ['PNT B','PNT C','UNICO','SP3','DC2','DC1','ECE','PNT A','GLP B','GLP C'];
const DAYS = ['Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota','Niedziela'];
const RATES = {10: 300, 12: 360};
const DEFAULT_TIMES = {
  10: {s1:'06:00',e1:'16:00',s2:'16:00',e2:'02:00'},
  12: {s1:'06:00',e1:'18:00',s2:'18:00',e2:'06:00'}
};

const monday = d => {
  const x = new Date(d);
  const n = x.getDay();
  x.setDate(x.getDate() + (n === 0 ? -6 : 1 - n));
  x.setHours(0,0,0,0);
  return x;
};
const addDays = (d,n) => {
  const x = new Date(d);
  x.setDate(x.getDate()+n);
  return x;
};
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const shortDate = d => `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`;
const fullDate = d => `${shortDate(d)}.${d.getFullYear()}`;

function emptyWeek(warehouse='PNT B') {
  return DAYS.map((_,i) => ({
    dayIndex:i,
    warehouse,
    shifts:[
      {id:`${i}-1`,shift:1,person:null,warehouse,locked:false,manual:false},
      {id:`${i}-2`,shift:2,person:null,warehouse,locked:false,manual:false}
    ]
  }));
}

function generateWeek(rotation='P', warehouse='PNT B') {
  const first = rotation === 'P' ? 'P' : 'M';
  const second = first === 'P' ? 'M' : 'P';
  const w = emptyWeek(warehouse);

  const pairs = [
    [0, first, second],
    [1, second, first],
    [2, first, second],
    [3, second, first],
    [4, first, second],
    [5, second, first]
  ];

  pairs.forEach(([day,a,b]) => {
    w[day].shifts[0].person = a;
    w[day].shifts[1].person = b;
  });

  // Łukasz jako niedzielny skoczek: obie zmiany.
  w[6].shifts[0].person = 'L';
  w[6].shifts[1].person = 'L';

  return w;
}

function cloneWeek(w) {
  return (w || []).map(d => ({
    ...d,
    shifts:(d.shifts || []).map(s => ({...s}))
  }));
}

function shiftTime(times, slot) {
  return slot === 1
    ? `${times.s1}–${times.e1}`
    : `${times.s2}–${times.e2}`;
}

function hexToRgb(hex) {
  const h = hex.replace('#','');
  const n = parseInt(h,16);
  return {r:(n>>16)&255,g:(n>>8)&255,b:n&255};
}

function contrastText(hex) {
  const {r,g,b} = hexToRgb(hex);
  const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
  return lum > 0.62 ? '#11151c' : '#ffffff';
}

export default function App() {
  const [ready,setReady] = useState(false);
  const [tab,setTab] = useState('grafik');
  const [hours,setHours] = useState(10);
  const [rotation,setRotation] = useState('P');
  const [warehouse,setWarehouse] = useState('PNT B');
  const [weekStart,setWeekStart] = useState(monday(new Date()));
  const [weekConfigs,setWeekConfigs] = useState({});
  const [weekSetup,setWeekSetup] = useState(null);
  const [weekSetupHours,setWeekSetupHours] = useState(10);
  const [weekSetupRotation,setWeekSetupRotation] = useState('P');
  const [weekSetupWarehouse,setWeekSetupWarehouse] = useState('PNT B');
  const [weeks,setWeeks] = useState({});
  const [times,setTimes] = useState(DEFAULT_TIMES[10]);
  const [edit,setEdit] = useState(null);
  const [help,setHelp] = useState(false);
  const [pinModal,setPinModal] = useState(false);
  const [pin,setPin] = useState('');
  const [pinEntry,setPinEntry] = useState('');
  const [pinEnabled,setPinEnabled] = useState(false);
  const [backupModal,setBackupModal] = useState(false);
  const [backupText,setBackupText] = useState('');
  const [dark,setDark] = useState(true);
  const [personColors,setPersonColors] = useState({P:PEOPLE.P.color,M:PEOPLE.M.color,L:PEOPLE.L.color});
  const [colorPerson,setColorPerson] = useState(null);
  const [summaryPerson,setSummaryPerson] = useState('all');
  const [viewMode,setViewMode] = useState('cards');
  const [exportModal,setExportModal] = useState(false);
  const exportRef = useRef(null);
  const cloudApplying = useRef(false);
  const [cloudUser,setCloudUser] = useState(null);
  const [cloudRole,setCloudRole] = useState('employee');
  const [cloudReady,setCloudReady] = useState(!FIREBASE_ENABLED);
  const [authEmail,setAuthEmail] = useState('');
  const [authPassword,setAuthPassword] = useState('');
  const [authBusy,setAuthBusy] = useState(false);
  const [cloudError,setCloudError] = useState('');
  const [rememberLogin,setRememberLogin] = useState(false);
  const [reportsEnabled,setReportsEnabled] = useState(true);
  const [vehicleRegistration,setVehicleRegistration] = useState('');
  const [reportGroupLink,setReportGroupLink] = useState('');
  const [reportModal,setReportModal] = useState(false);
  const [reportStatus,setReportStatus] = useState('Czekam na załadunek');
  const [reportWarehouse,setReportWarehouse] = useState('PNT B');
  const [reportFromWarehouse,setReportFromWarehouse] = useState('PNT B');
  const [reportToWarehouse,setReportToWarehouse] = useState('ECE');
  const [reportRamp,setReportRamp] = useState('');
  const [reportDuration,setReportDuration] = useState('10 min');
  const [reportLoaded,setReportLoaded] = useState('załadowany');
  const [reportBusy,setReportBusy] = useState(false);
  const [reportHistory,setReportHistory] = useState([]);
  const [warehouseGeo,setWarehouseGeo] = useState({});
  const [locationTracking,setLocationTracking] = useState(false);
  const [locationBusy,setLocationBusy] = useState(false);
  const locationConfigLoaded = useRef(false);
  const [chatMessages,setChatMessages] = useState([]);
  const [chatText,setChatText] = useState('');
  const [chatBusy,setChatBusy] = useState(false);
  const [cloudUpdated,setCloudUpdated] = useState(false);
  const [sharePerson,setSharePerson] = useState('all');
  const [shareFormat,setShareFormat] = useState('table');
  const [conditionModal,setConditionModal] = useState(false);
  const [conditions,setConditions] = useState([]);
  const [conditionPerson,setConditionPerson] = useState('P');
  const [conditionType,setConditionType] = useState('must');
  const [conditionDay,setConditionDay] = useState(0);
  const [conditionShift,setConditionShift] = useState(1);
  const [conditionValue,setConditionValue] = useState('');
  const [offModal,setOffModal] = useState(null);
  const [offMode,setOffMode] = useState('plain');
  const [offReplacement,setOffReplacement] = useState('');
  const [swapModal,setSwapModal] = useState(null);
  const [swapTarget,setSwapTarget] = useState('');
  const [swapTargetDay,setSwapTargetDay] = useState(0);
  const [swapTargetShift,setSwapTargetShift] = useState(1);
  const [proposals,setProposals] = useState([]);
  const [myPerson,setMyPerson] = useState('P');
  const [guestMode,setGuestMode] = useState(false);
  const readOnly = guestMode || (FIREBASE_ENABLED && !!cloudUser && cloudRole !== 'admin');

  const wkKey = iso(weekStart);
  const emptyWeek = wh => generateWeek(rotation,wh).map(d=>({...d,shifts:d.shifts.map(s=>({...s,person:null,manual:false,locked:false}))}));
  const clearCurrentWeek = () => {
    if (readOnly) return;
    Alert.alert('Wyczyść tydzień','Usunąć wszystkich pracowników z całego aktualnie wyświetlanego tygodnia?', [
      {text:'Anuluj',style:'cancel'},
      {text:'Wyczyść cały tydzień',style:'destructive',onPress:()=>{
        const wh=weekConfigs[wkKey]?.warehouse || warehouse;
        setWeeks(prev=>({...prev,[wkKey]:emptyWeek(wh)}));
      }}
    ]);
  };
  const currentWeek = weeks[wkKey] || emptyWeek(weekConfigs[wkKey]?.warehouse || warehouse);
  const personColor = k => personColors[k] || PEOPLE[k]?.color || '#64748b';

  useEffect(() => {
    (async() => {
      try {
        const raw = (await AsyncStorage.getItem(KEY)) || (await AsyncStorage.getItem(LEGACY_KEY));
        if (raw) {
          const data = JSON.parse(raw);
          setHours(data.hours || 10);
          setRotation(data.rotation || 'P');
          setWarehouse(data.warehouse || 'PNT B');
          setWeeks(data.weeks || {});
          setWeekConfigs(data.weekConfigs || {});
          setPin(data.pin || '');
          setPinEnabled(!!data.pinEnabled);
          setDark(data.dark !== false);
          setPersonColors({...{P:PEOPLE.P.color,M:PEOPLE.M.color,L:PEOPLE.L.color},...(data.personColors || {})});
          setConditions(data.conditions || []);
          setProposals(data.proposals || []);
          setMyPerson(data.myPerson || 'P');
          setVehicleRegistration(data.vehicleRegistration || '');
          setReportGroupLink(data.reportGroupLink || '');
          setReportsEnabled(data.reportsEnabled !== false);
          setReportHistory(data.reportHistory || []);
          setWarehouseGeo(data.warehouseGeo || {});
          setChatMessages(data.chatMessages || []);
          const h = data.hours || 10;
          setTimes(data.times?.[h] || DEFAULT_TIMES[h]);
        }
      } catch(e) {
        console.log(e);
      } finally {
        setReady(true);
      }
    })();
  },[]);

  useEffect(() => {
    if (!ready || Platform.OS !== 'android') return;
    const t = setTimeout(async () => {
      try {
        const {requestWidgetUpdate} = require('react-native-android-widget');
        const {buildWidgetData} = require('./widget-task-handler');
        const {GrafikTerazWidget,GrafikAutoWidget,GrafikRaportWidget} = require('./widgets');
        const data = await buildWidgetData();
        requestWidgetUpdate({widgetName:'GrafikTeraz',renderWidget:() => <GrafikTerazWidget data={data.now}/>});
        requestWidgetUpdate({widgetName:'GrafikAuto',renderWidget:() => <GrafikAutoWidget data={data.auto}/>});
        requestWidgetUpdate({widgetName:'GrafikRaport',renderWidget:() => <GrafikRaportWidget data={data.report}/>});
      } catch (e) {}
    }, 250);
    return () => clearTimeout(t);
  }, [ready,weeks,times,reportHistory,vehicleRegistration,warehouseGeo]);

  useEffect(() => {
    if (!ready) return;
    const data = {hours,rotation,warehouse,weeks,pin,pinEnabled,dark,vehicleRegistration,reportGroupLink,reportsEnabled,warehouseGeo,reportHistory,times:{
      10: DEFAULT_TIMES[10],
      12: DEFAULT_TIMES[12],
      [hours]: times
    },personColors,conditions,proposals,myPerson};
    AsyncStorage.setItem(KEY,JSON.stringify(data)).catch(()=>{});
  },[ready,hours,rotation,warehouse,weeks,pin,pinEnabled,dark,times,personColors,vehicleRegistration,reportGroupLink,reportsEnabled,reportHistory,myPerson,conditions,proposals,warehouseGeo]);

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    getVehicleLocationConfig().then(c => setLocationTracking(c.enabled !== false && !!c.vehicleId)).catch(() => {});
  },[ready]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !db || !cloudUser) return;
    const unsub = onSnapshot(doc(db,'locationConfig','main'), snap => {
      locationConfigLoaded.current = true;
      if (!snap.exists()) return;
      setWarehouseGeo(snap.data()?.warehouseGeo || {});
    });
    return () => unsub();
  },[cloudUser]);

  useEffect(() => {
    if (!ready || !FIREBASE_ENABLED || !db || !cloudUser || cloudRole !== 'admin' || !locationConfigLoaded.current) return;
    setDoc(doc(db,'locationConfig','main'),{warehouseGeo,updatedAt:serverTimestamp(),updatedBy:cloudUser.uid},{merge:true}).catch(() => {});
  },[warehouseGeo,ready,cloudUser]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !auth || !db) return;

    let roleUnsub = null;

    const authUnsub = onAuthStateChanged(auth, async user => {
      const remember = (await AsyncStorage.getItem(REMEMBER_LOGIN_KEY)) === '1';
      setRememberLogin(remember);
      if (user && !remember) {
        try { await signOut(auth); } catch (e) {}
        setCloudUser(null);
        setCloudRole('employee');
        setCloudReady(true);
        return;
      }

      setCloudUser(user || null);
      if (user) setGuestMode(false);
      setCloudError('');
      setCloudReady(false);

      if (roleUnsub) {
        roleUnsub();
        roleUnsub = null;
      }

      if (!user) {
        setCloudRole('employee');
        setCloudReady(true);
        return;
      }

      roleUnsub = onSnapshot(
        doc(db, 'users', user.uid),
        snap => {
          const role = snap.exists() ? snap.data()?.role : null;
          setCloudRole(role === 'admin' ? 'admin' : 'employee');
          setCloudReady(true);
        },
        error => {
          console.error('Błąd odczytu roli:', error);
          setCloudRole('employee');
          setCloudError('Nie udało się odczytać uprawnień użytkownika. Kod: ' + (error?.code || 'nieznany'));
          setCloudReady(true);
        }
      );
    });

    return () => {
      authUnsub();
      if (roleUnsub) roleUnsub();
    };
  },[]);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.getItem(REPORT_HISTORY_KEY).then(raw => { if (raw) setReportHistory(JSON.parse(raw)); }).catch(()=>{});
    AsyncStorage.getItem(CHAT_LOCAL_KEY).then(raw => { if (raw && !FIREBASE_ENABLED) setChatMessages(JSON.parse(raw)); }).catch(()=>{});
  },[ready]);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(REPORT_HISTORY_KEY,JSON.stringify(reportHistory.slice(0,100))).catch(()=>{});
    if (!FIREBASE_ENABLED) AsyncStorage.setItem(CHAT_LOCAL_KEY,JSON.stringify(chatMessages.slice(-100))).catch(()=>{});
  },[ready,reportHistory,chatMessages]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !db || !cloudUser) return;
    const q = query(collection(db,'chatMessages'), orderBy('createdAt','desc'), limit(100));
    const unsub = onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({id:d.id,...d.data()})).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
      setChatMessages(rows);
    }, err => setCloudError('Brak dostępu do czatu. Kod: ' + (err?.code || 'unknown')));
    return unsub;
  },[cloudUser,guestMode]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !db || !cloudUser) return;
    const q = cloudRole === 'admin'
      ? query(collection(db,'whatsappReports'), orderBy('createdAt','desc'), limit(100))
      : query(collection(db,'whatsappReports'), where('uid','==',cloudUser.uid), orderBy('createdAt','desc'), limit(50));
    const unsub = onSnapshot(q, snap => setReportHistory(snap.docs.map(d=>({id:d.id,...d.data()}))), err => setCloudError('Brak dostępu do raportów WhatsApp. Kod: ' + (err?.code || 'unknown')));
    return unsub;
  },[cloudUser,cloudRole]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !db || (!cloudUser && !guestMode)) return;
    const unsub = onSnapshot(doc(db,'schedules','main'), snap => {
      if (!snap.exists()) return;
      const data = snap.data() || {};
      cloudApplying.current = true;
      if (data.hours) setHours(data.hours);
      if (data.rotation) setRotation(data.rotation);
      if (data.warehouse) setWarehouse(data.warehouse);
      if (data.weeks) setWeeks(data.weeks);
      if (data.weekConfigs) setWeekConfigs(data.weekConfigs);
      if (data.personColors) setPersonColors(data.personColors);
      if (data.conditions) setConditions(data.conditions);
      if (data.times) setTimes(data.times[data.hours || hours] || DEFAULT_TIMES[data.hours || hours]);
      setCloudUpdated(true);
      setTimeout(() => setCloudUpdated(false), 2500);
    }, err => setCloudError('Brak dostępu do wspólnego grafiku. Kod: ' + (err?.code || 'nieznany')));
    return unsub;
  },[cloudUser,guestMode]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !db || !cloudUser) return;
    const q = cloudRole === 'admin'
      ? collection(db,'proposals')
      : query(collection(db,'proposals'),where('fromUid','==',cloudUser.uid));
    const unsub = onSnapshot(q, snap => {
      setProposals(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))));
    }, err => setCloudError('Brak dostępu do propozycji zamian. Kod: ' + (err?.code || 'unknown')));
    return unsub;
  },[cloudUser,cloudRole]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !db || !cloudUser) return;
    const unsub=onSnapshot(doc(db,'users',cloudUser.uid), snap => {
      const key=snap.exists()?snap.data()?.personKey:null;
      if(key && PERSON_KEYS.includes(key)) setMyPerson(key);
    });
    return unsub;
  },[cloudUser]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !db || !cloudUser || cloudRole !== 'admin' || !ready) return;
    if (cloudApplying.current) {
      cloudApplying.current = false;
      return;
    }
    const payload = {hours,rotation,warehouse,weeks,weekConfigs,times:{10:DEFAULT_TIMES[10],12:DEFAULT_TIMES[12],[hours]:times},personColors,conditions,updatedAt:serverTimestamp(),updatedBy:cloudUser.uid};
    setDoc(doc(db,'schedules','main'),payload,{merge:true}).catch(e=>setCloudError('Nie udało się zapisać grafiku online. Kod: ' + (e?.code || 'nieznany')));
  },[ready,hours,rotation,warehouse,weeks,weekConfigs,times,personColors,conditions,cloudUser,cloudRole]);

  const parseHM = value => {
    const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  };

  const compactWarehouse = value => String(value || '').replace(/\s+/g,'').toUpperCase();

  const parseReportDurationMinutes = value => {
    const text = String(value || '').toLowerCase().replace(',', '.');
    const hm = text.match(/(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*min)?/);
    if (hm) return Math.round(Number(hm[1]) * 60 + Number(hm[2] || 0));
    const mm = text.match(/(\d+)\s*min/);
    return mm ? Number(mm[1]) : 0;
  };

  const formatReportDuration = minutes => {
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    const h = Math.floor(m / 60);
    const min = m % 60;
    if (h && min) return h + ' h ' + min + ' min';
    if (h) return h + ' h';
    return min + ' min';
  };

  const getLastReportForStatus = status => {
    return (reportHistory || [])
      .filter(r => r && r.status === status && (!r.person || r.person === myPerson))
      .sort((a,b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0] || null;
  };

  const applyReportContinuity = status => {
    const last = getLastReportForStatus(status);
    if (!last) return;

    if (status !== 'W drodze') {
      if (last.warehouse) setReportWarehouse(String(last.warehouse).split('->')[0] || reportWarehouse);
      if (last.ramp) setReportRamp(last.ramp);
    } else if (last.warehouse && String(last.warehouse).includes('->')) {
      const parts = String(last.warehouse).split('->');
      if (parts[0]) setReportFromWarehouse(parts[0]);
      if (parts[1]) setReportToWarehouse(parts[1]);
      if (last.loaded) setReportLoaded(last.loaded);
    }

    const baseMinutes = Number(last.durationMinutes) || parseReportDurationMinutes(last.text);
    if (baseMinutes > 0) {
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(last.createdAt || Date.now()).getTime()) / 60000));
      setReportDuration(formatReportDuration(baseMinutes + elapsed));
    }
  };

  const applyLocationSuggestion = suggestion => {
    if (!suggestion) return;
    setReportStatus(suggestion.status || 'W drodze');
    if (suggestion.status === 'W drodze') {
      setReportFromWarehouse(suggestion.from || reportFromWarehouse);
      setReportToWarehouse(suggestion.to || reportToWarehouse);
    } else if (suggestion.warehouse) {
      setReportWarehouse(suggestion.warehouse);
    }
    setTab('ustawienia');
    setTimeout(() => setReportModal(true), 80);
  };

  const toggleVehicleTracking = async () => {
    if (locationBusy) return;
    setLocationBusy(true);
    try {
      if (locationTracking) {
        await stopVehicleLocationTracking();
        setLocationTracking(false);
        Alert.alert('Lokalizacja','Nadajnik GPS został wyłączony.');
      } else {
        const result = await startVehicleLocationTracking({vehicleId:vehicleRegistration,registration:vehicleRegistration});
        if (result.ok) {
          setLocationTracking(true);
          Alert.alert('Lokalizacja aktywna','Służbowy telefon będzie wysyłał pozycję w tle.');
        } else if (result.reason === 'background-permission') {
          Alert.alert('Lokalizacja','Android nie przyznał dostępu do lokalizacji w tle. Włącz „Zawsze zezwalaj” w ustawieniach aplikacji.');
        } else if (result.reason === 'foreground-permission') {
          Alert.alert('Lokalizacja','Brak zgody na lokalizację.');
        } else {
          Alert.alert('Lokalizacja','Do działania potrzebne jest połączenie z Firebase.');
        }
      }
    } catch(e) {
      Alert.alert('Lokalizacja','Nie udało się uruchomić nadajnika: '+(e?.message||'nieznany błąd'));
    } finally { setLocationBusy(false); }
  };

  const calibrateWarehouse = async name => {
    if (Platform.OS === 'web') {
      Alert.alert('GPS','Kalibrację wykonaj na służbowym telefonie z Androidem.');
      return;
    }
    try {
      const fg=await Location.requestForegroundPermissionsAsync();
      if (fg.status!=='granted') { Alert.alert('GPS','Brak zgody na lokalizację.'); return; }
      const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
      const accuracy=Number(pos.coords.accuracy||0);
      setWarehouseGeo(prev=>({...prev,[name]:{latitude:pos.coords.latitude,longitude:pos.coords.longitude,radius:220,accuracy,updatedAt:Date.now()}}));
      Alert.alert('Strefa ustawiona',name+' zapisany w bieżącej pozycji GPS.');
    } catch(e) { Alert.alert('GPS','Nie udało się pobrać pozycji.'); }
  };

  const openReportModal = () => {
    applyReportContinuity(reportStatus);
    setReportModal(true);
  };

  const reportText = () => {
    const reg = vehicleRegistration.trim().toUpperCase();
    if (!reg) return '';
    if (reportStatus === 'W drodze') {
      return `${reg} w drodze ${compactWarehouse(reportFromWarehouse)}->${compactWarehouse(reportToWarehouse)} ${reportLoaded}`;
    }
    if (reportStatus === 'Zaczynam pracę, jestem na miejscu') {
      return `${reg} ${compactWarehouse(reportWarehouse)} zaczynam pracę, jestem na miejscu`;
    }
    if (reportStatus === 'Koniec zmiany') {
      return `${reg} ${compactWarehouse(reportWarehouse)} koniec zmiany`;
    }
    const ramp = reportRamp.trim();
    const duration = reportDuration.trim();
    return `${reg} ${compactWarehouse(reportWarehouse)}${ramp ? ` ${ramp}` : ''} ${reportStatus.toLowerCase()}${duration ? ` ${duration}` : ''}`;
  };

  const openWhatsAppReport = async () => {
    const text = reportText();
    if (!text) {
      Alert.alert('Raport','Uzupełnij numer rejestracyjny w ustawieniach.');
      return;
    }
    setReportBusy(true);
    try {
      await Clipboard.setStringAsync(text);
      const reportEntry = {text,status:reportStatus,warehouse:reportStatus === 'W drodze' ? reportFromWarehouse + '->' + reportToWarehouse : reportWarehouse,ramp:reportRamp.trim(),loaded:reportLoaded,durationMinutes:parseReportDurationMinutes(reportDuration),createdAt:new Date().toISOString(),uid:cloudUser?.uid || null,email:cloudUser?.email || null,person:myPerson};
      if (FIREBASE_ENABLED && db && cloudUser) await addDoc(collection(db,'whatsappReports'),reportEntry);
      else setReportHistory(prev => [reportEntry,...prev].slice(0,100));
      if (reportGroupLink.trim()) await Linking.openURL(reportGroupLink.trim());
      else { try { await Linking.openURL('whatsapp://send?text=' + encodeURIComponent(text)); } catch(e) { await Linking.openURL('whatsapp://'); } }
      setReportModal(false);
      Alert.alert('Raport gotowy','Tekst raportu został skopiowany. W WhatsApp wklej go do grupy i naciśnij WYŚLIJ.');
    } catch (e) {
      Alert.alert('WhatsApp','Nie udało się otworzyć WhatsApp. Tekst raportu został skopiowany do schowka.');
    } finally {
      setReportBusy(false);
    }
  };

  const sendChatMessage = async () => {
    const body = chatText.trim();
    if (!body || chatBusy) return;
    setChatBusy(true);
    const message = {text:body,uid:cloudUser?.uid || null,email:cloudUser?.email || 'Gość',person:PEOPLE[myPerson]?.name || myPerson,createdAt:new Date().toISOString()};
    try {
      if (FIREBASE_ENABLED && db && cloudUser) await addDoc(collection(db,'chatMessages'),message);
      else setChatMessages(prev => [...prev,{...message,id:String(Date.now())}].slice(-100));
      setChatText('');
    } catch(e) { setCloudError('Nie udało się wysłać wiadomości. Kod: ' + (e?.code || 'unknown')); }
    finally { setChatBusy(false); }
  };

  const resendReport = async text => {
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
      const waUrl = reportGroupLink.trim() ? reportGroupLink.trim() : 'whatsapp://send?text=' + encodeURIComponent(text);
      await Linking.openURL(waUrl);
    } catch(e) { Alert.alert('WhatsApp','Raport skopiowano do schowka, ale nie udało się otworzyć WhatsApp.'); }
  };

  const requestReportNotifications = async () => {
    if (Platform.OS === 'web') return false;
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  };

  const cancelReportNotifications = async () => {
    try {
      const raw = await AsyncStorage.getItem(REPORT_NOTIFICATION_IDS_KEY);
      const ids = raw ? JSON.parse(raw) : [];
      await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id)));
    } catch(e) {}
    await AsyncStorage.removeItem(REPORT_NOTIFICATION_IDS_KEY);
  };

  const scheduleReportNotifications = async () => {
    if (Platform.OS === 'web' || !ready) return;
    if (!reportsEnabled || !vehicleRegistration.trim()) {
      await cancelReportNotifications();
      return;
    }
    const granted = await requestReportNotifications();
    if (!granted) return;

    await cancelReportNotifications();
    const ids = [];
    const today = new Date();
    const startDay = monday(today);

    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const date = addDays(startDay,dayOffset);
      const key = iso(date);
      const week = weeks[key] || null;
      if (!week) continue;

      for (let di = 0; di < week.length; di++) {
        const day = week[di];
        const shiftDate = addDays(startDay,dayOffset + di);
        for (let si = 0; si < (day.shifts || []).length; si++) {
          const shift = day.shifts[si];
          if (shift.person !== myPerson) continue;
          const shiftTimes = times;
          const startMin = parseHM(si === 0 ? shiftTimes.s1 : shiftTimes.s2);
          let endMin = parseHM(si === 0 ? shiftTimes.e1 : shiftTimes.e2);
          if (endMin <= startMin) endMin += 24 * 60;
          const shiftStart = new Date(shiftDate);
          shiftStart.setHours(Math.floor(startMin/60),startMin%60,0,0);
          const shiftEnd = new Date(shiftStart);
          shiftEnd.setMinutes(endMin);
          const first = new Date(shiftStart);
          first.setMinutes(40,0,0);
          if (first <= shiftStart) first.setHours(first.getHours()+1);

          for (let t = new Date(first); t < shiftEnd; t.setHours(t.getHours()+1)) {
            if (t <= new Date()) continue;
            const notification = await Notifications.scheduleNotificationAsync({
              content: {
                title: '📋 Raport godzinowy',
                body: `Za 20 min pełna godzina. ${PEOPLE[myPerson]?.name || ''}, przygotuj raport.`,
                data: {type:'work-report'}
              },
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: new Date(t)
              }
            });
            ids.push(notification);
          }
        }
      }
    }
    await AsyncStorage.setItem(REPORT_NOTIFICATION_IDS_KEY,JSON.stringify(ids));
  };

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      if (response.notification.request.content.data?.type === 'work-report') {
        setReportModal(true);
      }
    });
    return () => sub.remove();
  },[ready]);

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    const timer = setTimeout(() => { scheduleReportNotifications().catch(()=>{}); }, 800);
    return () => clearTimeout(timer);
  },[ready,reportsEnabled,myPerson,weeks,times,vehicleRegistration]);

  const cloudLogin = async () => {
    setAuthBusy(true); setCloudError('');
    try {
      await AsyncStorage.setItem(REMEMBER_LOGIN_KEY, rememberLogin ? '1' : '0');
      await signInWithEmailAndPassword(auth,authEmail.trim(),authPassword);
      setAuthPassword('');
    }
    catch(e) { setCloudError(e?.code === 'auth/invalid-credential' ? 'Nieprawidłowy e-mail lub hasło.' : 'Nie udało się zalogować.'); }
    finally { setAuthBusy(false); }
  };

  const cloudRegister = async () => {
    setAuthBusy(true); setCloudError('');
    try {
      const email = authEmail.trim();
      if (!email) { setCloudError('Wpisz adres e-mail.'); return; }
      if (authPassword.length < 6) { setCloudError('Hasło musi mieć co najmniej 6 znaków.'); return; }
      const cred = await createUserWithEmailAndPassword(auth,email,authPassword);
      await setDoc(doc(db,'users',cred.user.uid),{email:cred.user.email,role:'employee',createdAt:serverTimestamp()});
      setAuthPassword('');
    } catch(e) {
      const code = e?.code || '';
      if (code === 'auth/email-already-in-use') setCloudError('Ten e-mail jest już zarejestrowany. Zamiast tworzyć konto, użyj ZALOGUJ SIĘ.');
      else if (code === 'auth/invalid-email') setCloudError('Nieprawidłowy adres e-mail.');
      else if (code === 'auth/weak-password') setCloudError('Hasło jest za słabe. Użyj co najmniej 6 znaków.');
      else if (code === 'auth/operation-not-allowed') setCloudError('Logowanie e-mailem jest wyłączone w Firebase. Trzeba włączyć dostawcę E-mail/hasło w Authentication.');
      else if (code === 'auth/network-request-failed') setCloudError('Brak połączenia z internetem.');
      else setCloudError('Nie udało się utworzyć konta. Kod: ' + (code || 'nieznany błąd'));
    } finally { setAuthBusy(false); }
  };

  const cloudLogout = async () => {
    try {
      await AsyncStorage.setItem(REMEMBER_LOGIN_KEY,'0');
      setRememberLogin(false);
      await signOut(auth);
    } catch(e) {}
  };

  useEffect(() => {
    if (!ready) return;
    if (!weeks[wkKey] && !weekConfigs[wkKey] && !weekSetup) {
      setWeekSetup(weekStart);
      setWeekSetupHours(hours);
      setWeekSetupRotation(rotation);
      setWeekSetupWarehouse(warehouse);
    }
  },[ready,wkKey,weeks,weekConfigs]);

  const setWeek = updater => {
    setWeeks(prev => ({
      ...prev,
      [wkKey]: typeof updater === 'function' ? updater(cloneWeek(prev[wkKey] || currentWeek)) : updater
    }));
  };

  const changeHours = h => {
    if (readOnly) return;
    setHours(h);
    setTimes(DEFAULT_TIMES[h]);
    setWeekConfigs(prev=>({...prev,[wkKey]:{...(prev[wkKey]||{}),hours:h,times:DEFAULT_TIMES[h],rotation:prev[wkKey]?.rotation||rotation,warehouse:prev[wkKey]?.warehouse||warehouse}}));
  };

  const dayHasPassed = dayIndex => {
    const date = addDays(weekStart, dayIndex);
    const now = new Date();
    const today = new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const d = new Date(date.getFullYear(),date.getMonth(),date.getDate());
    return d < today;
  };

  const conditionApplies = (c, person, dayIndex, shiftIndex) => {
    if (c.person && c.person !== person) return false;
    if (c.dayIndex !== undefined && c.dayIndex !== null && Number(c.dayIndex) !== dayIndex) return false;
    if (c.shift && Number(c.shift) !== shiftIndex+1) return false;
    return true;
  };

  const generateAdvancedWeek = () => {
    const base = cloneWeek(currentWeek);
    const result = cloneWeek(currentWeek);
    // Preserve completed days and explicit manual/locked assignments.
    result.forEach((d,di)=>d.shifts.forEach((s,si)=>{
      if (dayHasPassed(di) || s.locked) return;
      s.person = null;
    }));

    const slots=[];
    result.forEach((d,di)=>d.shifts.forEach((s,si)=>{
      if (dayHasPassed(di) || s.locked) return;
      const forcedOff = conditions.some(c=>c.type==='off' && conditionApplies(c,'',di,si));
      if (!forcedOff) slots.push({di,si});
    }));

    const counts={P:0,M:0,L:0};
    result.forEach((d,di)=>d.shifts.forEach((s,si)=>{ if(s.person) counts[s.person]++; }));
    const targets={P:null,M:null,L:null};
    conditions.filter(c=>c.type==='count').forEach(c=>{targets[c.person]=Number(c.value)||0;});
    const recoverNeeds={P:0,M:0,L:0};
    result.forEach(d=>d.shifts.forEach(s=>{if(s.offMode==='recover' && s.recoverPerson) recoverNeeds[s.recoverPerson]++;}));
    PERSON_KEYS.forEach(p=>{if(recoverNeeds[p]) targets[p]=Math.max(targets[p]===null?counts[p]:targets[p],counts[p]+recoverNeeds[p]);});

    // Apply hard MUST assignments first where possible.
    conditions.filter(c=>c.type==='must').forEach(c=>{
      if(!c.person || c.dayIndex===undefined || !c.shift) return;
      const si=Number(c.shift)-1, di=Number(c.dayIndex), s=result[di]?.shifts?.[si];
      if(!s || dayHasPassed(di) || s.locked || s.manual) return;
      s.person=c.person; counts[c.person]++;
    });

    // Fill remaining slots using target counts, respecting hard prohibitions.
    for (const slot of slots) {
      const s=result[slot.di].shifts[slot.si];
      if (s.person) continue;
      const candidates=PERSON_KEYS.filter(person=>{
        if(conditions.some(c=>c.type==='off' && conditionApplies(c,person,slot.di,slot.si))) return false;
        if(conditions.some(c=>c.type==='forbid' && conditionApplies(c,person,slot.di,slot.si))) return false;
        if(targets[person]!==null && counts[person]>=targets[person]) return false;
        // Don't put the same person twice in a day unless explicitly forced.
        if(result[slot.di].shifts.some(x=>x.person===person)) return false;
        return true;
      });
      candidates.sort((a,b)=>{
        const ta=targets[a]===null?999:targets[a], tb=targets[b]===null?999:targets[b];
        const pa=conditions.some(c=>c.type==='prefer' && conditionApplies(c,a,slot.di,slot.si))?1:0;
        const pb=conditions.some(c=>c.type==='prefer' && conditionApplies(c,b,slot.di,slot.si))?1:0;
        return (pb-pa) || ((counts[a]/Math.max(1,ta))-(counts[b]/Math.max(1,tb)));
      });
      if(candidates.length){s.person=candidates[0];counts[candidates[0]]++;}
    }
    const unmet=[];
    Object.entries(targets).forEach(([p,target])=>{if(target!==null && counts[p]!==target) unmet.push(`${PEOPLE[p].name}: ${counts[p]}/${target} zmian`);});
    const forbiddenBroken=[];
    result.forEach((d,di)=>d.shifts.forEach((s,si)=>{
      if(s.person && conditions.some(c=>c.type==='forbid' && conditionApplies(c,s.person,di,si))) forbiddenBroken.push(`${PEOPLE[s.person].name}: ${DAYS[di]} ${si+1}`);
    }));
    if(unmet.length || forbiddenBroken.length){
      Alert.alert('Nie udało się spełnić wszystkich warunków', [...unmet,...forbiddenBroken].join('\n') || 'Spróbuj zmienić warunki.');
      return null;
    }
    // Apply requested replacement for days off.
    result.forEach((d,di)=>d.shifts.forEach((s,si)=>{
      if(s.person===null) s.manual=false;
    }));
    return result;
  };

  const regenerate = () => {
    if (readOnly) return;
    Alert.alert('Wygenerować grafik?', 'Generator uwzględni blokady, dni wolne oraz ustawione warunki.', [
      {text:'Anuluj',style:'cancel'},
      {text:'Generuj',onPress:()=>{
        const generated=generateAdvancedWeek();
        if(generated) setWeek(generated);
      }}
    ]);
  };

  const updateShift = (dayIndex,shiftIndex,patch) => {
    if (readOnly) return;
    setWeek(w => {
      w[dayIndex].shifts[shiftIndex] = {
        ...w[dayIndex].shifts[shiftIndex],
        ...patch,
        manual:true
      };
      return w;
    });
  };

  const removeShift = (dayIndex,shiftIndex) => {
    if (readOnly) return;
    updateShift(dayIndex,shiftIndex,{person:null});
  };

  const toggleLock = (dayIndex,shiftIndex) => {
    if (readOnly) return;
    setWeek(w => {
      const s = w[dayIndex].shifts[shiftIndex];
      s.locked = !s.locked;
      return w;
    });
  };

  const openOff = (dayIndex,shiftIndex) => {
    if(readOnly || dayHasPassed(dayIndex)) return;
    const sh=currentWeek[dayIndex]?.shifts?.[shiftIndex];
    setOffMode('plain'); setOffReplacement(''); setOffModal({dayIndex,shiftIndex,person:sh?.person||null});
  };

  const saveOff = () => {
    if(!offModal) return;
    const {dayIndex,shiftIndex}=offModal;
    setWeek(w=>{
      const sh=w[dayIndex].shifts[shiftIndex];
      const originalPerson=sh.person;
      sh.person=offReplacement || null;
      sh.off=true; sh.offMode=offMode; sh.replacement=offReplacement||null; sh.recoverPerson=offMode==='recover'?originalPerson:null; sh.manual=true;
      return w;
    });
    if(offReplacement){
      Alert.alert('Zastępstwo zapisane', `${PEOPLE[offReplacement].name} zastępuje na tej zmianie.`);
    }
    setOffModal(null);
  };

  const submitSwap = async () => {
    if(!swapModal || !swapTarget || !cloudUser) return;
    const targetShift=currentWeek[swapTargetDay]?.shifts?.[swapTargetShift-1];
    if(!targetShift || targetShift.person!==swapTarget){
      Alert.alert('Nieprawidłowa zamiana','Wybierz zmianę, na której wybrany pracownik faktycznie pracuje.');
      return;
    }
    if(dayHasPassed(swapModal.dayIndex) || dayHasPassed(swapTargetDay)){
      Alert.alert('Nie można','Nie można proponować zamiany z dniem, który już minął.');
      return;
    }
    const proposal={
      fromUid:cloudUser.uid,
      fromEmail:cloudUser.email || '',
      fromPerson:swapModal.person || null,
      fromDay:swapModal.dayIndex,
      fromShift:swapModal.shiftIndex+1,
      toPerson:swapTarget,
      toDay:swapTargetDay,
      toShift:swapTargetShift,
      status:'pending',
      createdAt:new Date().toISOString()
    };
    try {
      if(FIREBASE_ENABLED && db) await addDoc(collection(db,'proposals'),proposal);
      else setProposals(p=>[{id:`${Date.now()}`,...proposal},...p]);
      setSwapModal(null); setSwapTarget('');
      Alert.alert('Wysłano','Propozycja zamiany czeka na zatwierdzenie administratora.');
    } catch(e){ setCloudError('Nie udało się wysłać propozycji. Kod: ' + (e?.code || 'unknown')); }
  };

  const approveProposal = async proposal => {
    if(readOnly || proposal.status !== 'pending') return;
    const a=currentWeek[proposal.fromDay]?.shifts?.[proposal.fromShift-1];
    const b=currentWeek[proposal.toDay]?.shifts?.[proposal.toShift-1];
    if(!a || !b || dayHasPassed(proposal.fromDay) || dayHasPassed(proposal.toDay)){Alert.alert('Nie można','Jedna ze zmian jest już zakończona.');return;}
    setWeek(w=>{
      const x=w[proposal.fromDay].shifts[proposal.fromShift-1], y=w[proposal.toDay].shifts[proposal.toShift-1];
      const xp=x.person; x.person=y.person; y.person=xp; x.manual=true; y.manual=true; return w;
    });
    try {
      if(FIREBASE_ENABLED && db) await updateDoc(doc(db,'proposals',proposal.id),{status:'approved',approvedAt:new Date().toISOString(),approvedBy:cloudUser?.uid||null});
      else setProposals(p=>p.map(x=>x.id===proposal.id?{...x,status:'approved'}:x));
    } catch(e){setCloudError('Nie udało się zatwierdzić zamiany. Kod: ' + (e?.code || 'unknown'));}
  };

  const rejectProposal = async id => {
    try {
      if(FIREBASE_ENABLED && db) await updateDoc(doc(db,'proposals',id),{status:'rejected',rejectedAt:new Date().toISOString(),rejectedBy:cloudUser?.uid||null});
      else setProposals(p=>p.map(x=>x.id===id?{...x,status:'rejected'}:x));
    } catch(e){setCloudError('Nie udało się odrzucić propozycji. Kod: ' + (e?.code || 'unknown'));}
  };

  const changeRotation = k => {
    if (readOnly) return;
    setRotation(k);
    setWeekConfigs(prev=>({...prev,[wkKey]:{...(prev[wkKey]||{}),hours:prev[wkKey]?.hours||hours,times:prev[wkKey]?.times||times,rotation:k,warehouse:prev[wkKey]?.warehouse||warehouse}}));
    setWeeks(prev => {
      const existing = prev[wkKey];
      if (!existing) return {...prev,[wkKey]:generateWeek(k,warehouse)};
      const next = cloneWeek(existing);
      next.forEach(d => d.shifts.forEach(s => {
        if (s.manual || s.locked || s.person === 'L') return;
        if (s.person === 'P') s.person = 'M';
        else if (s.person === 'M') s.person = 'P';
      }));
      return {...prev,[wkKey]:next};
    });
  };

  const openWeekSetup = next => {
    setWeekSetup(next);
    const key=iso(next), cfg=weekConfigs[key];
    setWeekSetupHours(cfg?.hours || 10);
    setWeekSetupRotation(cfg?.rotation || rotation);
    setWeekSetupWarehouse(cfg?.warehouse || warehouse);
  };
  const confirmWeekSetup = () => {
    if(!weekSetup || readOnly) return;
    const setupDate = weekSetup instanceof Date ? weekSetup : new Date(weekSetup?.weekStart || weekSetup);
    if (Number.isNaN(setupDate.getTime())) return;
    const key=iso(setupDate);
    const cfg={hours:weekSetupHours,rotation:weekSetupRotation,warehouse:weekSetupWarehouse,times:DEFAULT_TIMES[weekSetupHours]};
    setWeekConfigs(prev=>({...prev,[key]:cfg}));
    setHours(weekSetupHours);
    setRotation(weekSetupRotation);
    setWarehouse(weekSetupWarehouse);
    setTimes(DEFAULT_TIMES[weekSetupHours]);
    setWeeks(prev=>({...prev,[key]:prev[key]||generateWeek(weekSetupRotation,weekSetupWarehouse)}));
    setWeekStart(weekSetup);
    setWeekSetup(null);
  };
  const moveWeek = n => { const next=addDays(weekStart,n*7); if(weeks[iso(next)]||weekConfigs[iso(next)]) setWeekStart(next); else openWeekSetup(next); };
  const todayWeek = () => { const next=monday(new Date()); if(weeks[iso(next)]||weekConfigs[iso(next)]) setWeekStart(next); else openWeekSetup(next); };

  const totals = useMemo(() => {
    const result = {
      all:{shifts:0,hours:0,money:0},
      P:{shifts:0,hours:0,money:0},
      M:{shifts:0,hours:0,money:0},
      L:{shifts:0,hours:0,money:0}
    };
    currentWeek.forEach(d => d.shifts.forEach(s => {
      if (!s.person) return;
      result.all.shifts++;
      result.all.hours += hours;
      result.all.money += RATES[hours];
      result[s.person].shifts++;
      result[s.person].hours += hours;
      result[s.person].money += RATES[hours];
    }));
    return result;
  },[currentWeek,hours]);

  const conflicts = useMemo(() => {
    const arr = [];
    currentWeek.forEach((d,di) => {
      const people = d.shifts.filter(s=>s.person).map(s=>s.person);
      if (people.length === 2 && people[0] === people[1]) {
        // 24 h is allowed, so this is informational only.
      }
      d.shifts.forEach((s,si) => {
        if (s.person) {
          currentWeek.forEach((other,odi) => {
            other.shifts.forEach((os,osi) => {
              if (di===odi && si===osi) return;
              if (os.person === s.person && odi===di && osi!==si) return;
            });
          });
        }
      });
    });
    return arr;
  },[currentWeek]);

  const newWeek = () => moveWeek(1);

  const resetAll = () => {
    if (readOnly) return;
    Alert.alert('Wyczyścić dane?','Usunie zapisane grafiki i ustawienia tej aplikacji.',[
      {text:'Anuluj',style:'cancel'},
      {text:'Wyczyść',style:'destructive',onPress:async()=>{
        await AsyncStorage.removeItem(KEY);
        setWeeks({});
        setPin('');
        setPinEnabled(false);
        setHours(10);
        setRotation('P');
        setWarehouse('PNT B');
        setTimes(DEFAULT_TIMES[10]);
        setPersonColors({P:PEOPLE.P.color,M:PEOPLE.M.color,L:PEOPLE.L.color});
        setConditions([]);
      }}
    ]);
  };

  const createBackup = () => {
    const payload = {
      app:'Grafik Pracy',
      version:4,
      exportedAt:new Date().toISOString(),
      hours,rotation,warehouse,weeks,pin,pinEnabled,dark,times,personColors
    };
    setBackupText(JSON.stringify(payload,null,2));
    setBackupModal(true);
  };

  const shareBackup = async () => {
    try {
      const payload = {
        app:'Grafik Pracy',
        version:4,
        exportedAt:new Date().toISOString(),
        hours,rotation,warehouse,weeks,pin,pinEnabled,dark,times,personColors
      };
      await Share.share({message:JSON.stringify(payload)});
    } catch(e) {
      Alert.alert('Błąd','Nie udało się udostępnić kopii.');
    }
  };

  const restoreBackup = () => {
    try {
      const data = JSON.parse(backupText);
      if (!data || data.app !== 'Grafik Pracy') throw new Error('bad');
      setHours(data.hours || 10);
      setRotation(data.rotation || 'P');
      setWarehouse(data.warehouse || 'PNT B');
      setWeeks(data.weeks || {});
      setPin(data.pin || '');
      setPinEnabled(!!data.pinEnabled);
      setDark(data.dark !== false);
      setPersonColors({...{P:PEOPLE.P.color,M:PEOPLE.M.color,L:PEOPLE.L.color},...(data.personColors || {})});
          setConditions(data.conditions || []);
          setProposals(data.proposals || []);
          setMyPerson(data.myPerson || 'P');
      setTimes(data.times?.[data.hours || 10] || DEFAULT_TIMES[data.hours || 10]);
      setBackupModal(false);
      Alert.alert('Gotowe','Kopia została przywrócona.');
    } catch(e) {
      Alert.alert('Nieprawidłowa kopia','Wklej pełny plik JSON wyeksportowany z aplikacji.');
    }
  };

  const shareFile = async (uri, mimeType, title) => {
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Udostępnianie niedostępne','Na tym urządzeniu nie można otworzyć menu udostępniania.');
        return;
      }
      await Sharing.shareAsync(uri, {mimeType, dialogTitle:title});
    } catch(e) {
      Alert.alert('Błąd','Nie udało się udostępnić pliku.');
    }
  };

  const exportJpg = async () => {
    try {
      if (!exportRef.current) return;
      const uri = await captureRef(exportRef, {format:'jpg',quality:0.95,result:'tmpfile',width:Math.min(Dimensions.get('window').width * 3, 1440)});
      await shareFile(uri, 'image/jpeg', 'Udostępnij grafik JPG');
    } catch(e) { console.log(e); Alert.alert('Błąd','Nie udało się przygotować grafiku JPG.'); }
  };

  const escapeHtml = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');

  const exportPdf = async () => {
    try {
      const selectedKeys=sharePerson==='all'?PERSON_KEYS:[sharePerson];
      const personLabel=sharePerson==='all'?'CAŁY GRAFIK':selectedKeys.map(k=>PEOPLE[k].name).join(', ');
      const rows=currentWeek.map((d,i)=>{
        const date=addDays(weekStart,i);
        const cells=d.shifts.map((s,si)=>{
          const visible=s.person && (sharePerson==='all'||s.person===sharePerson);
          const name=visible?PEOPLE[s.person].name:'WOLNA';
          const wh=visible?(s.warehouse||d.warehouse||warehouse):'';
          return `<td><b>${escapeHtml(name)}</b><br><span>${escapeHtml(wh)}</span><br><span>${visible?escapeHtml(shiftTime(times,si+1)):''}</span></td>`;
        }).join('');
        return `<tr><td><b>${DAYS[i]}</b><br><span>${shortDate(date)}</span></td>${cells}</tr>`;
      }).join('');
      let body;
      if(shareFormat==='list'){
        body=currentWeek.map((d,i)=>{
          const date=addDays(weekStart,i);
          const items=d.shifts.filter(s=>s.person && (sharePerson==='all'||s.person===sharePerson)).map(s=>`${PEOPLE[s.person].name} · ${shiftTime(times,s.shift)} · ${s.warehouse||d.warehouse||warehouse}`);
          return `<div style="border-bottom:1px solid #ccc;padding:7px 0"><b>${DAYS[i]} ${shortDate(date)}</b><br>${items.length?items.map(escapeHtml).join('<br>'):'WOLNE'}</div>`;
        }).join('');
        body=`<div style="font-size:12px">${body}</div>`;
      } else {
        body=`<table><thead><tr><th>Dzień</th><th>I · ${escapeHtml(times.s1)}–${escapeHtml(times.e1)}</th><th>II · ${escapeHtml(times.s2)}–${escapeHtml(times.e2)}</th></tr></thead><tbody>${rows}</tbody></table>`;
      }
      const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@page{size:A4 landscape;margin:18px}body{font-family:Arial,sans-serif;color:#111;margin:0}h1{font-size:22px;margin:0 0 4px}p{margin:0 0 14px;color:#555;font-size:12px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #555;padding:8px;text-align:center;font-size:11px;vertical-align:middle}th{background:#222;color:#fff}td:first-child{width:14%;text-align:left}td{height:55px}span{color:#666}</style></head><body><h1>GRAFIK PRACY</h1><p>${fullDate(weekStart)} – ${fullDate(addDays(weekStart,6))} · ${hours} h · ${escapeHtml(personLabel)}</p>${body}</body></html>`;
      const {uri}=await Print.printToFileAsync({html,width:842,height:595});
      await shareFile(uri,'application/pdf','Udostępnij grafik PDF');
    } catch(e){console.log(e);Alert.alert('Błąd','Nie udało się przygotować grafiku PDF.');}
  };

  const listExport = (forExport=false) => (
    <View ref={forExport ? exportRef : undefined} collapsable={false} style={[S.tableCard,forExport&&S.exportCard]}>
      <Text style={S.tableTitle}>GRAFIK — {sharePerson==='all'?'WSZYSCY':PEOPLE[sharePerson]?.name}</Text>
      <Text style={S.tableSubtitle}>{fullDate(weekStart)} – {fullDate(addDays(weekStart,6))} · {hours} h</Text>
      {currentWeek.map((d,i)=>{
        const date=addDays(weekStart,i);
        const items=d.shifts.filter(s=>s.person && (sharePerson==='all'||s.person===sharePerson));
        return <View key={d.dayIndex} style={S.listExportRow}><Text style={S.listExportDay}>{DAYS[i]} · {shortDate(date)}</Text>{items.length?items.map(s=><Text key={s.id} style={S.listExportItem}>{PEOPLE[s.person].name} · {shiftTime(times,s.shift)} · {s.warehouse||d.warehouse||warehouse}</Text>):<Text style={S.listExportItem}>WOLNE</Text>}</View>;
      })}
    </View>
  );

  const compactTable = (forExport=false, personFilter='all') => (
    <View ref={forExport ? exportRef : undefined} collapsable={false} style={[S.tableCard,forExport&&S.exportCard]}>
      <View style={S.tableTitleRow}>
        <View style={{flex:1}}><Text style={S.tableTitle}>GRAFIK PRACY</Text><Text style={S.tableSubtitle}>{fullDate(weekStart)} – {fullDate(addDays(weekStart,6))} · {hours} h</Text></View>
        <Text style={S.tableWarehouse}>{warehouse}</Text>
      </View>
      <View style={S.tableHeader}>
        <Text style={[S.tableCell,S.tableDayCell,S.tableHead]}>Dzień</Text>
        <Text style={[S.tableCell,S.tableShiftCell,S.tableHead]}>I</Text>
        <Text style={[S.tableCell,S.tableShiftCell,S.tableHead]}>II</Text>
      </View>
      {currentWeek.map((d,i) => {
        const date = addDays(weekStart,i);
        return <View key={d.dayIndex} style={S.tableRow}>
          <Text style={[S.tableCell,S.tableDayCell,S.tableDay]}>{DAYS[i]}\n{shortDate(date)}</Text>
          {[0,1].map(si => { const sh=d.shifts[si]; const p=sh.person ? PEOPLE[sh.person] : null; return <TouchableOpacity key={si} disabled={forExport || dayHasPassed(i)} onPress={()=>!readOnly && !dayHasPassed(i) && setEdit({dayIndex:i,shiftIndex:si})} style={[S.tableCell,S.tableShiftCell,S.tableShift,sh.person===personFilter||personFilter==='all'?{backgroundColor:personColor(sh.person)}:{}]}>
            <Text style={[S.tablePerson,p&&{color:contrastText(personColor(sh.person))}]}>{p ? p.name : 'WOLNA'}</Text>
            <Text style={[S.tableMeta,p&&{color:contrastText(personColor(sh.person)),opacity:0.78}]}>{p ? (sh.warehouse || d.warehouse || warehouse) : ''}</Text>
            <Text style={[S.tableMeta,p&&{color:contrastText(personColor(sh.person)),opacity:0.78}]}>{p ? shiftTime(times,si+1) : ''}</Text>
          </TouchableOpacity>; })}
        </View>;
      })}
    </View>
  );

  const savePin = () => {
    if (pinEnabled && pinEntry.length !== 4) {
      Alert.alert('PIN','PIN musi mieć dokładnie 4 cyfry.');
      return;
    }
    if (!pinEnabled) {
      setPin('');
      setPinEnabled(false);
      setPinEntry('');
      setPinModal(false);
      return;
    }
    setPin(pinEntry);
    setPinEntry('');
    setPinModal(false);
  };

  const header = (
    <View style={S.header}>
      <View style={{flex:1}}>
        <Text style={S.title}>GRAFIK PRACY</Text>
        <Text style={S.muted}>{fullDate(weekStart)} – {fullDate(addDays(weekStart,6))}</Text>
      </View>
      <TouchableOpacity style={S.help} onPress={()=>setHelp(true)}>
        <Text style={S.helpText}>?</Text>
      </TouchableOpacity>
    </View>
  );

  const schedule = (
    <ScrollView style={S.content} contentContainerStyle={{paddingBottom:130}}>
      {header}
      <View style={S.row}>
        {[10,12].map(h=>
          <TouchableOpacity key={h} style={[S.btn,hours===h&&S.active]} onPress={()=>changeHours(h)}>
            <Text style={S.btnText}>{h} H</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={S.generate} onPress={regenerate}>
          <Text style={S.btnText}>⚡ GENERUJ</Text>
        </TouchableOpacity>
      </View>

      <View style={S.row}>
        <TouchableOpacity style={[S.btn,viewMode==='table'&&S.active]} onPress={()=>setViewMode('table')}><Text style={S.btnText}>▦ TABELA</Text></TouchableOpacity>
        <TouchableOpacity style={[S.btn,viewMode==='cards'&&S.active]} onPress={()=>setViewMode('cards')}><Text style={S.btnText}>☰ KARTY</Text></TouchableOpacity>
        <TouchableOpacity style={S.generate} onPress={()=>setExportModal(true)}><Text style={S.btnText}>📤 UDOSTĘPNIJ GRAFIK</Text></TouchableOpacity>
      </View>

      <View style={S.row}>
        <TouchableOpacity style={S.weekBtn} onPress={()=>moveWeek(-1)}><Text style={S.btnText}>‹ Poprzedni</Text></TouchableOpacity>
        <TouchableOpacity style={S.weekBtn} onPress={todayWeek}><Text style={S.btnText}>Dziś</Text></TouchableOpacity>
        <TouchableOpacity style={S.weekBtn} onPress={()=>moveWeek(1)}><Text style={S.btnText}>Następny ›</Text></TouchableOpacity>
      </View>

      <TouchableOpacity style={S.swapBtn} onPress={()=>setTab('ustawienia')}>
        <Text style={S.btnText}>🔄 Zamiana i edycja zmian</Text>
      </TouchableOpacity>

      {viewMode==='table' ? compactTable(false) : currentWeek.map((d,di) => {
        const dateObj = addDays(weekStart,di);
        return (
          <View style={S.day} key={d.dayIndex}>
            <View style={S.between}>
              <View>
                <Text style={S.dayTitle}>{DAYS[di]} {dayHasPassed(di)?'🔒':'🔓'}</Text>
                <Text style={S.muted}>{shortDate(dateObj)} · {d.warehouse || warehouse}</Text>
              </View>
              <Text style={S.dayBadge}>{d.shifts.filter(s=>s.person).length}/2</Text>
            </View>

            {d.shifts.map((s,si) => {
              const p = s.person ? PEOPLE[s.person] : null;
              return (
                <View key={s.id} style={[S.shift,s.locked&&S.locked]}>
                  <View style={S.between}>
                    <View>
                      <Text style={S.shiftTitle}>Zmiana {s.shift}</Text>
                      <Text style={S.time}>{shiftTime(times,s.shift)}</Text>
                    </View>
                    <Text style={S.lockText}>{s.locked?'🔒':' '}</Text>
                  </View>

                  <TouchableOpacity
                    style={[S.person,p&&{backgroundColor:personColor(s.person),borderLeftColor:personColor(s.person),borderLeftWidth:4}]}
                    onPress={()=>!readOnly && !dayHasPassed(di) && setEdit({dayIndex:di,shiftIndex:si})}
                  >
                    <Text style={[S.personText,p&&{color:contrastText(personColor(s.person))}]}>{p ? p.name : 'WOLNA ZMIANA'}</Text>
                    <Text style={[S.personSub,p&&{color:contrastText(personColor(s.person)),opacity:0.82}]}>{s.warehouse || warehouse}</Text>
                  </TouchableOpacity>

                  <View style={S.actions}>
                    <TouchableOpacity onPress={()=>!readOnly && !dayHasPassed(di) && toggleLock(di,si)}>
                      <Text style={S.actionText}>{s.locked?'Odblokuj':'Zablokuj'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={()=>!readOnly && !dayHasPassed(di) && setEdit({dayIndex:di,shiftIndex:si})}>
                      <Text style={S.actionText}>Edytuj</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={()=>!readOnly && !dayHasPassed(di) && removeShift(di,si)}>
                      <Text style={S.delete}>Usuń</Text>
                    </TouchableOpacity>
                  </View>
                  {!dayHasPassed(di) && s.person && cloudUser && <TouchableOpacity style={S.swapMini} onPress={()=>setSwapModal({dayIndex:di,shiftIndex:si,person:s.person})}><Text style={S.actionText}>🔄 Zaproponuj zamianę</Text></TouchableOpacity>}
                  {!dayHasPassed(di) && !readOnly && <TouchableOpacity style={S.swapMini} onPress={()=>openOff(di,si)}><Text style={S.actionText}>🏖️ Ustaw wolne</Text></TouchableOpacity>}
                </View>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );

  const selectedSummaryKeys = summaryPerson === 'all' ? PERSON_KEYS : [summaryPerson];
  const selectedWorkDays = summaryPerson === 'all' ? [] : currentWeek.map((d,i) => {
    const shifts = d.shifts.filter(s => s.person === summaryPerson);
    return shifts.length ? {day:DAYS[i],date:shortDate(addDays(weekStart,i)),shifts} : null;
  }).filter(Boolean);

  const chat = (
    <ScrollView style={S.content} contentContainerStyle={{paddingBottom:130}}>
      {header}
      <View style={S.chatHeader}>
        <View style={{flex:1}}>
          <Text style={S.section}>💬 Czat pracowników</Text>
          <Text style={S.helpLine}>Wiadomości są wspólne dla zalogowanych pracowników i administratora.</Text>
        </View>
        <Text style={S.chatBadge}>{chatMessages.length}</Text>
      </View>
      <View style={S.chatBox}>
        {chatMessages.length ? chatMessages.slice(-80).map(m => {
          const mine = !!cloudUser && m.uid === cloudUser.uid;
          return (
            <View key={m.id || (m.createdAt + '-' + m.uid)} style={[S.chatMessage,mine&&S.chatMine]}>
              <View style={S.between}>
                <Text style={S.chatAuthor}>{m.person || m.email || 'Użytkownik'}</Text>
                <Text style={S.chatTime}>{m.createdAt ? new Date(m.createdAt).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''}</Text>
              </View>
              <Text style={S.chatText}>{m.text}</Text>
            </View>
          );
        }) : <Text style={S.helpLine}>Brak wiadomości. Napisz pierwszą wiadomość 👋</Text>}
      </View>
      {FIREBASE_ENABLED && !cloudUser ? <View style={S.option}><Text style={S.optionText}>Zaloguj się, aby pisać na wspólnym czacie.</Text></View> : (
        <View style={S.chatComposer}>
          <TextInput value={chatText} onChangeText={setChatText} multiline maxLength={500} placeholder="Napisz wiadomość…" placeholderTextColor="#777" style={S.chatInput}/>
          <TouchableOpacity disabled={chatBusy || !chatText.trim()} style={[S.generate,S.chatSend]} onPress={sendChatMessage}><Text style={S.btnText}>{chatBusy?'…':'WYŚLIJ'}</Text></TouchableOpacity>
        </View>
      )}
      <Text style={S.section}>📱 Ostatnie raporty WhatsApp</Text>
      <Text style={S.helpLine}>Każdy raport jest zapisywany w historii. Ponowne wysłanie kopiuje tekst i otwiera WhatsApp lub ustawioną grupę.</Text>
      {reportHistory.slice(0,30).map((r,i) => (
        <View key={r.id || (r.createdAt + '-' + i)} style={S.reportCard}>
          <Text style={S.optionText}>{r.text}</Text>
          <Text style={S.muted}>{r.createdAt ? new Date(r.createdAt).toLocaleString('pl-PL') : ''} · {r.person || ''}</Text>
          <TouchableOpacity style={S.swapMini} onPress={()=>resendReport(r.text)}><Text style={S.actionText}>📱 KOPIUJ I OTWÓRZ WHATSAPP</Text></TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );

  const summary = (
    <ScrollView style={S.content} contentContainerStyle={{paddingBottom:110}}>
      {header}
      <Text style={S.section}>Podsumowanie dla</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10}}>
        <TouchableOpacity style={[S.chip,summaryPerson==='all'&&S.active]} onPress={()=>setSummaryPerson('all')}>
          <Text style={S.btnText}>Wszyscy</Text>
        </TouchableOpacity>
        {PERSON_KEYS.map(k => (
          <TouchableOpacity key={k} style={[S.chip,summaryPerson===k&&{backgroundColor:personColor(k)}]} onPress={()=>setSummaryPerson(k)}>
            <Text style={[S.btnText,{color:summaryPerson===k?contrastText(personColor(k)):'#fff'}]}>{PEOPLE[k].name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {summaryPerson === 'all' ? (
        <>
          <View style={S.total}>
            <Text style={S.totalSmall}>PODSUMOWANIE TYGODNIA</Text>
            <Text style={S.totalBig}>{totals.all.shifts} zmian</Text>
            <Text style={S.totalInfo}>{totals.all.hours} godzin</Text>
            <Text style={S.totalMoney}>{totals.all.money} zł</Text>
          </View>
          {selectedSummaryKeys.map(k => (
            <View style={[S.employee,{borderLeftColor:personColor(k),borderLeftWidth:5}]} key={k}>
              <View style={S.between}>
                <Text style={S.employeeName}>{PEOPLE[k].name}</Text>
                <Text style={[S.dot,{color:personColor(k)}]}>●</Text>
              </View>
              <Text style={S.stat}>Zmiany: <Text style={S.white}>{totals[k].shifts}</Text></Text>
              <Text style={S.stat}>Godziny: <Text style={S.white}>{totals[k].hours} h</Text></Text>
              <Text style={S.stat}>Zarobek: <Text style={S.money}>{totals[k].money} zł</Text></Text>
            </View>
          ))}
        </>
      ) : (
        <>
          <View style={[S.total,{backgroundColor:personColor(summaryPerson)}]}>
            <Text style={[S.totalSmall,{color:contrastText(personColor(summaryPerson))}]}>PODSUMOWANIE: {PEOPLE[summaryPerson].name.toUpperCase()}</Text>
            <Text style={[S.totalBig,{color:contrastText(personColor(summaryPerson))}]}>{totals[summaryPerson].shifts} zmian</Text>
            <Text style={[S.totalInfo,{color:contrastText(personColor(summaryPerson))}]}>{totals[summaryPerson].hours} godzin</Text>
            <Text style={[S.totalMoney,{color:contrastText(personColor(summaryPerson))}]}>{totals[summaryPerson].money} zł</Text>
          </View>
          <Text style={S.section}>Dni pracujące</Text>
          {selectedWorkDays.length ? selectedWorkDays.map(item => (
            <View style={[S.employee,{borderLeftColor:personColor(summaryPerson),borderLeftWidth:5}]} key={item.date}>
              <View style={S.between}>
                <Text style={S.employeeName}>{item.day}</Text>
                <Text style={[S.dot,{color:personColor(summaryPerson)}]}>●</Text>
              </View>
              <Text style={S.stat}>{item.date} · {item.shifts.length} {item.shifts.length === 1 ? 'zmiana' : 'zmiany'}</Text>
              {item.shifts.map(s => <Text key={s.id} style={S.stat}>Zmiana {s.shift}: <Text style={S.white}>{shiftTime(times,s.shift)}</Text> · {s.warehouse || warehouse}</Text>)}
            </View>
          )) : (
            <View style={S.employee}><Text style={S.stat}>Brak dni pracujących w tym tygodniu.</Text></View>
          )}
        </>
      )}

      <Text style={S.section}>Stawka tygodnia</Text>
      <View style={S.option}>
        <Text style={S.optionText}>{hours} h</Text>
        <Text style={S.money}>{RATES[hours]} zł / zmiana</Text>
      </View>
    </ScrollView>
  );

  const weekSetupDialog = (
    <Modal visible={!!weekSetup} transparent animationType='fade' onRequestClose={()=>{}}><View style={S.overlay}><View style={S.modal}>
      <Text style={S.modalTitle}>⚙️ Ustawienia nowego tygodnia</Text>
      <Text style={S.helpLine}>Przed rozpoczęciem tygodnia określ jego parametry. Nie będą one automatycznie przenoszone na następne tygodnie.</Text>
      <Text style={S.section}>Godziny pracy</Text><View style={S.row}>{[10,12].map(h=><TouchableOpacity key={h} style={[S.btn,weekSetupHours===h&&S.active]} onPress={()=>setWeekSetupHours(h)}><Text style={S.btnText}>{h} H</Text></TouchableOpacity>)}</View>
      <Text style={S.section}>Start rotacji</Text><View style={S.row}>{['P','M'].map(k=><TouchableOpacity key={k} style={[S.btn,weekSetupRotation===k&&S.active]} onPress={()=>setWeekSetupRotation(k)}><Text style={S.btnText}>{PEOPLE[k].name}</Text></TouchableOpacity>)}</View>
      <Text style={S.section}>Magazyn</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{WAREHOUSES.map(w=><TouchableOpacity key={w} style={[S.chip,weekSetupWarehouse===w&&S.active]} onPress={()=>setWeekSetupWarehouse(w)}><Text style={S.btnText}>{w}</Text></TouchableOpacity>)}</ScrollView>
      <TouchableOpacity style={S.generateFull} onPress={confirmWeekSetup}><Text style={S.btnText}>▶️ UTWÓRZ TEN TYDZIEŃ</Text></TouchableOpacity>
      <TouchableOpacity style={[S.btn,{marginTop:10,borderWidth:1,borderColor:'#ef4444'}]} onPress={clearCurrentWeek}><Text style={S.btnText}>🗑️ WYCZYŚĆ CAŁY TYDZIEŃ</Text></TouchableOpacity>
    </View></View></Modal>
  );

  const settings = (
    <ScrollView style={S.content} contentContainerStyle={{paddingBottom:110}}>
      {header}

      <Text style={S.section}>📍 Nadajnik GPS telefonu służbowego</Text>
      <Text style={S.helpLine}>Najpierw przypisz ten telefon do konkretnego auta. Samo przypisanie nie wymaga jeszcze uruchomienia GPS. Dopiero potem włącz nadajnik lokalizacji.</Text>
      <TextInput value={vehicleRegistration} onChangeText={v=>setVehicleRegistration(v.toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ -]/gi,''))} autoCapitalize="characters" placeholder="NUMER REJESTRACYJNY, np. PZ387WR" placeholderTextColor="#777" style={[S.input,{marginBottom:8}]} editable={!locationTracking && !locationBusy}/>
      <TouchableOpacity disabled={locationBusy || !vehicleRegistration.trim() || locationTracking} style={[S.generateFull,{marginTop:0,opacity:(!vehicleRegistration.trim()||locationBusy||locationTracking)?0.45:1}]} onPress={async()=>{
        const reg=vehicleRegistration.trim();
        if(!reg) return;
        setLocationBusy(true);
        try {
          await saveVehicleLocationAssignment(reg);
          setVehicleRegistration(reg);
          Alert.alert('Pojazd przypisany','Ten telefon został przypisany do auta '+reg+'. Teraz możesz osobno włączyć nadajnik GPS.');
        } catch(e) {
          Alert.alert('Pojazd','Nie udało się zapisać przypisania auta: '+(e?.message||'nieznany błąd'));
        } finally { setLocationBusy(false); }
      }}><Text style={S.btnText}>{locationBusy?'ZAPISUJĘ…':'ZAPISZ POJAZD'}</Text></TouchableOpacity>
      <View style={S.option}>
        <View style={{flex:1}}><Text style={S.optionText}>Telefon służbowy</Text><Text style={S.muted}>{vehicleRegistration.trim()?'🚚 przypisany do '+vehicleRegistration.trim():'⚠️ brak przypisanego auta'}</Text><Text style={S.muted}>{locationTracking?'🟢 nadajnik aktywny w tle':'🔴 nadajnik wyłączony'}</Text></View>
        <TouchableOpacity disabled={locationBusy || !vehicleRegistration.trim()} style={[S.btn,locationTracking&&S.active,(!vehicleRegistration.trim()||locationBusy)&&{opacity:0.45}]} onPress={toggleVehicleTracking}><Text style={S.btnText}>{locationBusy?'…':locationTracking?'WYŁĄCZ':'AKTYWUJ GPS'}</Text></TouchableOpacity>
      </View>
      <Text style={S.helpLine}>Po aktywacji Android poprosi o dokładną lokalizację oraz lokalizację w tle. Wybierz „Zawsze zezwalaj”, jeśli system pokaże taką opcję. Jeśli zgoda zostanie odrzucona, przypisanie auta pozostanie zapisane.</Text>
      <Text style={S.section}>🏭 Kalibracja stref magazynów</Text>
      {WAREHOUSES.map(w=><View key={w} style={S.option}>
        <View style={{flex:1}}><Text style={S.optionText}>{w}</Text><Text style={S.muted}>{warehouseGeo[w]?'📍 '+Number(warehouseGeo[w].latitude).toFixed(5)+', '+Number(warehouseGeo[w].longitude).toFixed(5):'brak punktu GPS'}</Text></View>
        <TouchableOpacity style={S.btn} onPress={()=>calibrateWarehouse(w)}><Text style={S.btnText}>USTAW GPS</Text></TouchableOpacity>
      </View>)}

      <Text style={S.section}>📋 Raporty godzinowe</Text>
      <Text style={S.helpLine}>Powiadomienie przychodzi 20 minut przed pełną godziną, ale tylko podczas Twojej zaplanowanej zmiany.</Text>
      <View style={S.option}>
        <Text style={S.optionText}>Raporty automatyczne</Text>
        <TouchableOpacity style={[S.btn,reportsEnabled&&S.active]} onPress={()=>setReportsEnabled(v=>!v)}>
          <Text style={S.btnText}>{reportsEnabled?'WŁĄCZONE':'WYŁĄCZONE'}</Text>
        </TouchableOpacity>
      </View>
      <TextInput value={reportGroupLink} onChangeText={setReportGroupLink} autoCapitalize="none" placeholder="Link do grupy WhatsApp (opcjonalnie)" placeholderTextColor="#777" style={S.input}/>
      <TouchableOpacity style={S.generateFull} onPress={()=>setReportModal(true)}>
        <Text style={S.btnText}>📝 TEST / UTWÓRZ RAPORT</Text>
      </TouchableOpacity>

      <Text style={S.section}>Rotacja</Text>
      <View style={S.row}>
        {['P','M'].map(k=>
          <TouchableOpacity key={k} style={[S.btn,rotation===k&&S.active]} onPress={()=>changeRotation(k)}>
            <Text style={S.btnText}>Start: {PEOPLE[k].name}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={S.section}>Domyślny magazyn</Text>
      {WAREHOUSES.map(w=>
        <TouchableOpacity key={w} style={[S.option,warehouse===w&&S.optionActive]} onPress={()=>{if(readOnly)return; const wh=w; setWarehouse(wh); setWeekConfigs(prev=>({...prev,[wkKey]:{...(prev[wkKey]||{}),hours,rotation:prev[wkKey]?.rotation||rotation,warehouse:wh,times}})); setWeek(prev=>prev.map(d=>({...d,warehouse:wh,shifts:d.shifts.map(s=>s.locked?s:{...s,warehouse:wh})})));}}>
          <Text style={S.optionText}>{w}</Text>
          {warehouse===w&&<Text style={S.check}>✓</Text>}
        </TouchableOpacity>
      )}

      <Text style={S.section}>Godziny zmian: {hours} h</Text>
      <View style={S.timeBox}>
        <View style={S.timeRow}>
          <Text style={S.white}>I</Text>
          <TextInput value={times.s1} onChangeText={v=>setTimes(t=>({...t,s1:v}))} style={S.input} placeholder="06:00" placeholderTextColor="#777"/>
          <Text style={S.sep}>→</Text>
          <TextInput value={times.e1} onChangeText={v=>setTimes(t=>({...t,e1:v}))} style={S.input} placeholder="16:00" placeholderTextColor="#777"/>
        </View>
        <View style={S.timeRow}>
          <Text style={S.white}>II</Text>
          <TextInput value={times.s2} onChangeText={v=>setTimes(t=>({...t,s2:v}))} style={S.input} placeholder="16:00" placeholderTextColor="#777"/>
          <Text style={S.sep}>→</Text>
          <TextInput value={times.e2} onChangeText={v=>setTimes(t=>({...t,e2:v}))} style={S.input} placeholder="02:00" placeholderTextColor="#777"/>
        </View>
      </View>

      <TouchableOpacity style={S.generateFull} onPress={regenerate}>
        <Text style={S.btnText}>⚡ ZASTOSUJ I PRZELICZ GRAFIK</Text>
      </TouchableOpacity>

      <Text style={S.section}>Mój profil</Text>
      <Text style={S.helpLine}>Wybierz osobę przypisaną do tego konta. Dzięki temu pracownik może składać propozycje zamian ze swojej zmiany.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10}}>
        {PERSON_KEYS.map(k=><TouchableOpacity key={k} style={[S.chip,myPerson===k&&{backgroundColor:personColor(k)}]} onPress={async()=>{setMyPerson(k); if(FIREBASE_ENABLED&&db&&cloudUser){try{await updateDoc(doc(db,'users',cloudUser.uid),{personKey:k})}catch(e){setCloudError('Nie udało się zapisać profilu.')}}}}><Text style={S.btnText}>{PEOPLE[k].name}</Text></TouchableOpacity>)}
      </ScrollView>

      <Text style={S.section}>⚡ Warunki generatora</Text>
      <Text style={S.helpLine}>Ustaw reguły MUSI, NIE MOŻE, PREFERUJE oraz liczbę zmian dla pracownika.</Text>
      <TouchableOpacity disabled={readOnly} style={[S.generateFull,readOnly&&{opacity:0.45}]} onPress={()=>setConditionModal(true)}><Text style={S.btnText}>⚙️ ZARZĄDZAJ WARUNKAMI ({conditions.length})</Text></TouchableOpacity>

      {FIREBASE_ENABLED && cloudRole==='admin' && <>
        <Text style={S.section}>🔔 Propozycje zamian {proposals.filter(p=>p.status==='pending').length ? `(${proposals.filter(p=>p.status==='pending').length})` : ''}</Text>
        {proposals.filter(p=>p.status==='pending').slice(0,10).map(p=><View key={p.id} style={S.proposalCard}>
          <Text style={S.optionText}>{PEOPLE[p.fromPerson]?.name || p.fromEmail} ↔ {PEOPLE[p.toPerson]?.name || 'pracownik'}</Text>
          <Text style={S.helpLine}>{DAYS[p.fromDay]} · zm. {p.fromShift} → {DAYS[p.toDay]} · zm. {p.toShift}</Text>
          <View style={S.row}><TouchableOpacity style={S.generate} onPress={()=>approveProposal(p)}><Text style={S.btnText}>✅ ZATWIERDŹ</Text></TouchableOpacity><TouchableOpacity style={S.btn} onPress={()=>rejectProposal(p.id)}><Text style={S.btnText}>❌ ODRZUĆ</Text></TouchableOpacity></View>
        </View>)}
      </>}

      {FIREBASE_ENABLED && cloudRole!=='admin' && <>
        <Text style={S.section}>🔄 Moje propozycje zamian</Text>
        {proposals.slice(0,8).map(p=><View key={p.id} style={S.proposalCard}>
          <Text style={S.optionText}>{p.status==='pending'?'🟡 Oczekuje':p.status==='approved'?'🟢 Zatwierdzona':'🔴 Odrzucona'}</Text>
          <Text style={S.helpLine}>{DAYS[p.fromDay]} · zm. {p.fromShift} ↔ {DAYS[p.toDay]} · zm. {p.toShift} · {PEOPLE[p.toPerson]?.name || ''}</Text>
        </View>)}
      </>}

      <Text style={S.section}>Kolory pracowników</Text>
      <Text style={S.helpLine}>Wybierz kolor, którym pracownik będzie oznaczany w grafiku, tabeli oraz udostępnianym JPG/PDF.</Text>
      {PERSON_KEYS.map(k => (
        <TouchableOpacity key={k} style={[S.option,{borderLeftColor:personColor(k),borderLeftWidth:6}]} onPress={()=>!readOnly && setColorPerson(k)}>
          <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
            <View style={[S.colorPreview,{backgroundColor:personColor(k)}]} />
            <Text style={S.optionText}>{PEOPLE[k].name}</Text>
          </View>
          <Text style={S.muted}>{personColor(k)}</Text>
        </TouchableOpacity>
      ))}

      {FIREBASE_ENABLED && cloudUser && <>
        <Text style={S.section}>Wspólny grafik online</Text>
        <View style={S.option}><Text style={S.optionText}>☁️ Status</Text><Text style={S.muted}>{cloudRole==='admin'?'Administrator':'Tylko odczyt'}</Text></View>
        <TouchableOpacity style={S.option} onPress={cloudLogout}><Text style={S.optionText}>🚪 Wyloguj</Text><Text style={S.muted}>{cloudUser.email}</Text></TouchableOpacity>
      </>}

      <Text style={S.section}>Bezpieczeństwo i dane</Text>
      <TouchableOpacity style={S.option} onPress={()=>{setPinEntry('');setPinModal(true)}}>
        <Text style={S.optionText}>🔐 PIN aplikacji</Text>
        <Text style={S.muted}>{pinEnabled?'włączony':'wyłączony'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={S.option} onPress={createBackup}>
        <Text style={S.optionText}>💾 Kopia zapasowa JSON</Text>
        <Text style={S.muted}>podgląd / eksport</Text>
      </TouchableOpacity>

      <TouchableOpacity style={S.option} onPress={shareBackup}>
        <Text style={S.optionText}>📤 Udostępnij backup</Text>
        <Text style={S.muted}>telefon / plik / komunikator</Text>
      </TouchableOpacity>

      <TouchableOpacity style={S.option} onPress={()=>!readOnly && setDark(v=>!v)}>
        <Text style={S.optionText}>🌙 Tryb ciemny</Text>
        <Text style={S.muted}>{dark?'włączony':'wyłączony'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={S.danger} onPress={resetAll}>
        <Text style={S.btnText}>WYCZYŚĆ DANE APLIKACJI</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const conditionModalDialog = (
    <Modal visible={conditionModal} transparent animationType="slide" onRequestClose={()=>setConditionModal(false)}>
      <View style={S.overlay}><View style={[S.modal,{maxHeight:'94%'}]}>
        <Text style={S.modalTitle}>Warunki generatora</Text>
        <ScrollView style={{maxHeight:430}}>
          {conditions.map((c,i)=><View key={i} style={S.proposalCard}>
            <Text style={S.optionText}>{c.type==='count'?'🔢 LICZBA':c.type==='must'?'🔴 MUSI':c.type==='forbid'?'⛔ NIE MOŻE':'🟡 PREFERUJE'} · {PEOPLE[c.person]?.name}</Text>
            <Text style={S.helpLine}>{c.type==='count'?`${c.value} zmian`: `${DAYS[c.dayIndex]} · zmiana ${c.shift}`}</Text>
            <TouchableOpacity onPress={()=>setConditions(x=>x.filter((_,j)=>j!==i))}><Text style={S.delete}>Usuń warunek</Text></TouchableOpacity>
          </View>)}
          <Text style={S.section}>Dodaj warunek</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}>{PERSON_KEYS.map(k=><TouchableOpacity key={k} style={[S.chip,conditionPerson===k&&{backgroundColor:personColor(k)}]} onPress={()=>setConditionPerson(k)}><Text style={S.btnText}>{PEOPLE[k].name}</Text></TouchableOpacity>)}</ScrollView>
          <View style={S.row}>{['count','must','forbid','prefer'].map(t=><TouchableOpacity key={t} style={[S.chip,conditionType===t&&S.active]} onPress={()=>setConditionType(t)}><Text style={S.btnText}>{t==='count'?'Liczba':t==='must'?'Musi':t==='forbid'?'Nie może':'Preferuje'}</Text></TouchableOpacity>)}</View>
          {conditionType==='count' ? <TextInput value={conditionValue} onChangeText={setConditionValue} keyboardType="number-pad" placeholder="Liczba zmian, np. 6" placeholderTextColor="#777" style={S.input}/> : <>
            <Text style={S.section}>Dzień</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}>{DAYS.map((d,i)=><TouchableOpacity key={d} style={[S.chip,conditionDay===i&&S.active]} onPress={()=>setConditionDay(i)}><Text style={S.btnText}>{d.slice(0,3)}</Text></TouchableOpacity>)}</ScrollView>
            <Text style={S.section}>Zmiana</Text><View style={S.row}>{[1,2].map(x=><TouchableOpacity key={x} style={[S.btn,conditionShift===x&&S.active]} onPress={()=>setConditionShift(x)}><Text style={S.btnText}>{x}</Text></TouchableOpacity>)}</View>
          </>}
          <TouchableOpacity style={S.generateFull} onPress={()=>{if(conditionType==='count'&&!conditionValue)return; setConditions(x=>[...x,{type:conditionType,person:conditionPerson,dayIndex:conditionDay,shift:conditionShift,value:conditionValue}]);setConditionValue('')}}><Text style={S.btnText}>➕ DODAJ WARUNEK</Text></TouchableOpacity>
        </ScrollView>
        <TouchableOpacity style={S.closeBtn} onPress={()=>setConditionModal(false)}><Text style={S.btnText}>GOTOWE</Text></TouchableOpacity>
      </View></View>
    </Modal>
  );

  const offModalDialog = (
    <Modal visible={!!offModal} transparent animationType="slide" onRequestClose={()=>setOffModal(null)}>
      <View style={S.overlay}><View style={S.modal}>
        <Text style={S.modalTitle}>🏖️ Ustaw wolne</Text>
        <Text style={S.helpLine}>{offModal ? `${DAYS[offModal.dayIndex]} · zmiana ${offModal.shiftIndex+1} · ${offModal.person ? PEOPLE[offModal.person].name : 'wolna'}` : ''}</Text>
        <Text style={S.section}>Co zrobić z tą zmianą?</Text>
        <TouchableOpacity style={[S.option,offMode==='plain'&&S.optionActive]} onPress={()=>setOffMode('plain')}><Text style={S.optionText}>Wolne — bez odrabiania</Text></TouchableOpacity>
        <TouchableOpacity style={[S.option,offMode==='recover'&&S.optionActive]} onPress={()=>setOffMode('recover')}><Text style={S.optionText}>Wolne — generator ma uzupełnić inną zmianą</Text></TouchableOpacity>
        <Text style={S.section}>Zastępstwo</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>{PERSON_KEYS.map(k=><TouchableOpacity key={k} style={[S.chip,offReplacement===k&&{backgroundColor:personColor(k)}]} onPress={()=>setOffReplacement(k)}><Text style={S.btnText}>{PEOPLE[k].name}</Text></TouchableOpacity>)}</ScrollView>
        <TouchableOpacity style={S.generateFull} onPress={saveOff}><Text style={S.btnText}>ZAPISZ WOLNE</Text></TouchableOpacity>
        <TouchableOpacity style={S.closeBtn} onPress={()=>setOffModal(null)}><Text style={S.btnText}>ANULUJ</Text></TouchableOpacity>
      </View></View>
    </Modal>
  );

  const swapModalDialog = (
    <Modal visible={!!swapModal} transparent animationType="slide" onRequestClose={()=>setSwapModal(null)}>
      <View style={S.overlay}><View style={[S.modal,{maxHeight:'90%'}]}>
        <Text style={S.modalTitle}>🔄 Zaproponuj zamianę</Text>
        <Text style={S.helpLine}>{swapModal ? `${DAYS[swapModal.dayIndex]} · zmiana ${swapModal.shiftIndex+1}` : ''}</Text>
        <Text style={S.section}>Z kim?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>{PERSON_KEYS.filter(k=>k!==swapModal?.person).map(k=><TouchableOpacity key={k} style={[S.chip,swapTarget===k&&{backgroundColor:personColor(k)}]} onPress={()=>setSwapTarget(k)}><Text style={S.btnText}>{PEOPLE[k].name}</Text></TouchableOpacity>)}</ScrollView>
        <Text style={S.section}>Na którą zmianę tej osoby?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}>{DAYS.map((d,i)=><TouchableOpacity key={d} style={[S.chip,swapTargetDay===i&&S.active]} onPress={()=>setSwapTargetDay(i)}><Text style={S.btnText}>{d.slice(0,3)}</Text></TouchableOpacity>)}</ScrollView>
        <View style={S.row}>{[1,2].map(x=><TouchableOpacity key={x} style={[S.btn,swapTargetShift===x&&S.active]} onPress={()=>setSwapTargetShift(x)}><Text style={S.btnText}>Zmiana {x}</Text></TouchableOpacity>)}</View>
        <TouchableOpacity style={S.generateFull} onPress={submitSwap}><Text style={S.btnText}>📨 WYŚLIJ PROPOZYCJĘ</Text></TouchableOpacity>
        <TouchableOpacity style={S.closeBtn} onPress={()=>setSwapModal(null)}><Text style={S.btnText}>ANULUJ</Text></TouchableOpacity>
      </View></View>
    </Modal>
  );

  const colorModal = (
    <Modal visible={!!colorPerson} transparent animationType="slide" onRequestClose={()=>setColorPerson(null)}>
      <View style={S.overlay}>
        <View style={[S.modal,{maxHeight:'86%'}]}>
          <Text style={S.modalTitle}>Kolor: {colorPerson ? PEOPLE[colorPerson].name : ''}</Text>
          <Text style={S.helpLine}>Wybierz jeden z kolorów. Zmiana zostanie zapisana automatycznie.</Text>
          <ScrollView contentContainerStyle={S.palette}>
            {COLOR_PALETTE.map(c => (
              <TouchableOpacity key={c} onPress={()=>{if(readOnly)return;setPersonColors(prev=>({...prev,[colorPerson]:c}));setColorPerson(null)}} style={[S.colorSwatch,{backgroundColor:c},colorPerson && personColor(colorPerson)===c&&S.colorSelected]}>
                {colorPerson && personColor(colorPerson)===c ? <Text style={[S.colorCheck,{color:contrastText(c)}]}>✓</Text> : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={S.closeBtn} onPress={()=>setColorPerson(null)}><Text style={S.btnText}>ZAMKNIJ</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const editModal = (
    <Modal visible={!!edit} transparent animationType="fade" onRequestClose={()=>setEdit(null)}>
      <View style={S.overlay}>
        <View style={S.modal}>
          <Text style={S.modalTitle}>Edycja zmiany</Text>
          <Text style={S.muted}>{edit ? `${DAYS[edit.dayIndex]} · Zmiana ${edit.shiftIndex+1}` : ''}</Text>

          <Text style={S.section}>Pracownik</Text>
          {PERSON_KEYS.map(k=>
            <TouchableOpacity
              key={k}
              style={[S.modalOpt,currentWeek[edit?.dayIndex]?.shifts[edit?.shiftIndex]?.person===k&&S.optionActive]}
              onPress={()=>{
                updateShift(edit.dayIndex,edit.shiftIndex,{person:k});
                setEdit(null);
              }}
            >
              <Text style={S.optionText}>{PEOPLE[k].name}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={S.modalOpt} onPress={()=>{removeShift(edit.dayIndex,edit.shiftIndex);setEdit(null)}}>
            <Text style={S.delete}>WOLNA ZMIANA</Text>
          </TouchableOpacity>

          <Text style={S.section}>Magazyn</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10}}>
            {WAREHOUSES.map(w=>
              <TouchableOpacity key={w} style={S.chip} onPress={()=>updateShift(edit.dayIndex,edit.shiftIndex,{warehouse:w})}>
                <Text style={S.btnText}>{w}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <TouchableOpacity style={S.closeBtn} onPress={()=>setEdit(null)}>
            <Text style={S.btnText}>ZAMKNIJ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const helpModal = (
    <Modal visible={help} transparent animationType="fade" onRequestClose={()=>setHelp(false)}>
      <View style={S.overlay}>
        <View style={S.modal}>
          <Text style={S.modalTitle}>Jak działa Grafik Pracy?</Text>
          <Text style={S.helpLine}>• Grafik ma 7 dni i 2 zmiany dziennie.</Text>
          <Text style={S.helpLine}>• System tygodnia: 10 h albo 12 h.</Text>
          <Text style={S.helpLine}>• Stawka: 300 zł przy 10 h i 360 zł przy 12 h.</Text>
          <Text style={S.helpLine}>• Edycja zmiany pozwala zmienić osobę i magazyn.</Text>
          <Text style={S.helpLine}>• Minione dni są automatycznie blokowane przed edycją.</Text>
          <Text style={S.helpLine}>• Pracownik może zaproponować zamianę, ale zmianę zatwierdza administrator.</Text>
          <Text style={S.helpLine}>• Generator może uwzględniać warunki MUSI / NIE MOŻE / PREFERUJE.</Text>
          <Text style={S.helpLine}>• Zablokowane i ręcznie zmienione zmiany są zachowywane przy ponownym generowaniu.</Text>
          <Text style={S.helpLine}>• Dane są zapisywane lokalnie na telefonie.</Text>
          <Text style={S.helpLine}>• Backup JSON służy do przenoszenia grafiku między telefonami.</Text>
          <TouchableOpacity style={S.closeBtn} onPress={()=>setHelp(false)}>
            <Text style={S.btnText}>ROZUMIEM</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const exportModalDialog = (
    <Modal visible={exportModal} transparent animationType="slide" onRequestClose={()=>setExportModal(false)}>
      <View style={S.overlay}><View style={[S.modal,{maxHeight:'94%'}]}>
        <Text style={S.modalTitle}>Udostępnij gotowy grafik</Text>
        <Text style={S.helpLine}>Cały grafik jest domyślną opcją. Możesz też udostępnić tylko jedną osobę.</Text>
        <Text style={S.section}>Zakres</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}>
          <TouchableOpacity style={[S.chip,sharePerson==='all'&&S.active]} onPress={()=>setSharePerson('all')}><Text style={S.btnText}>👥 Cały grafik</Text></TouchableOpacity>
          {PERSON_KEYS.map(k=><TouchableOpacity key={k} style={[S.chip,sharePerson===k&&{backgroundColor:personColor(k)}]} onPress={()=>setSharePerson(k)}><Text style={S.btnText}>👤 {PEOPLE[k].name}</Text></TouchableOpacity>)}
        </ScrollView>
        <Text style={S.section}>Forma</Text>
        <View style={S.row}><TouchableOpacity style={[S.btn,shareFormat==='table'&&S.active]} onPress={()=>setShareFormat('table')}><Text style={S.btnText}>📊 Tabela</Text></TouchableOpacity><TouchableOpacity style={[S.btn,shareFormat==='list'&&S.active]} onPress={()=>setShareFormat('list')}><Text style={S.btnText}>📋 Lista</Text></TouchableOpacity></View>
        <ScrollView style={{maxHeight:400}} contentContainerStyle={{paddingBottom:4}}>
          {shareFormat==='table'?compactTable(true,sharePerson):listExport(true)}
        </ScrollView>
        <View style={S.row}><TouchableOpacity style={S.generate} onPress={exportJpg}><Text style={S.btnText}>🖼️ JPG</Text></TouchableOpacity><TouchableOpacity style={S.btn} onPress={exportPdf}><Text style={S.btnText}>📄 PDF</Text></TouchableOpacity></View>
        <TouchableOpacity style={S.closeBtn} onPress={()=>setExportModal(false)}><Text style={S.btnText}>ZAMKNIJ</Text></TouchableOpacity>
      </View></View>
    </Modal>
  );

  const reportModalDialog = (
    <Modal visible={reportModal} transparent animationType="slide" onRequestClose={()=>setReportModal(false)}>
      <View style={S.reportOverlay}>
        <View style={S.reportSheet}>
          <View style={S.sheetHandle}/>
          <View style={S.sheetHeader}>
            <View style={{flex:1}}>
              <Text style={S.modalTitle}>📋 Raport godzinowy</Text>
              <Text style={S.sheetSub}>Szybki wybór → gotowy tekst → WhatsApp</Text>
            </View>
            <TouchableOpacity style={S.sheetClose} onPress={()=>setReportModal(false)}><Text style={S.sheetCloseText}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:18}}>
            <Text style={S.section}>1. Status</Text>
            <View style={S.statusGrid}>
              {['Zaczynam pracę, jestem na miejscu','Czekam na załadunek','Czekam na rozładunek','W drodze','Czekam na przydzielenie rampy','Koniec zmiany'].map(status => (
                <TouchableOpacity key={status} style={[S.statusTile,reportStatus===status&&S.statusTileActive]} onPress={()=>{setReportStatus(status);applyReportContinuity(status)}}>
                  <Text style={[S.statusTileText,reportStatus===status&&S.statusTileTextActive]}>{status}</Text>
                  {reportStatus===status&&<Text style={S.statusCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
            {reportStatus==='W drodze' ? <>
              <Text style={S.section}>2. Trasa</Text>
              <Text style={S.fieldLabel}>Z</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chipRow}>{WAREHOUSES.map(w=><TouchableOpacity key={'from'+w} style={[S.chip,reportFromWarehouse===w&&S.active]} onPress={()=>setReportFromWarehouse(w)}><Text style={S.btnText}>{w}</Text></TouchableOpacity>)}</ScrollView>
              <Text style={S.fieldLabel}>Do</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chipRow}>{WAREHOUSES.map(w=><TouchableOpacity key={'to'+w} style={[S.chip,reportToWarehouse===w&&S.active]} onPress={()=>setReportToWarehouse(w)}><Text style={S.btnText}>{w}</Text></TouchableOpacity>)}</ScrollView>
              <View style={S.row}><TouchableOpacity style={[S.chip,reportLoaded==='załadowany'&&S.active]} onPress={()=>setReportLoaded('załadowany')}><Text style={S.btnText}>Załadowany</Text></TouchableOpacity><TouchableOpacity style={[S.chip,reportLoaded==='na pusto'&&S.active]} onPress={()=>setReportLoaded('na pusto')}><Text style={S.btnText}>Na pusto</Text></TouchableOpacity></View>
            </> : <>
              <Text style={S.section}>2. Magazyn</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chipRow}>{WAREHOUSES.map(w=><TouchableOpacity key={w} style={[S.chip,reportWarehouse===w&&S.active]} onPress={()=>setReportWarehouse(w)}><Text style={S.btnText}>{w}</Text></TouchableOpacity>)}</ScrollView>
              {reportStatus!=='Zaczynam pracę, jestem na miejscu' && reportStatus!=='Koniec zmiany' && <>
                <Text style={S.section}>3. Szczegóły</Text>
                <Text style={S.fieldLabel}>Rampa</Text>
                <TextInput value={reportRamp} onChangeText={setReportRamp} placeholder="np. R39" placeholderTextColor="#777" style={S.reportInput}/>
                <Text style={S.fieldLabel}>Czas trwania</Text>
                <View style={S.durationGrid}>{['5 min','10 min','15 min','20 min','30 min','45 min','1 h'].map(v=><TouchableOpacity key={v} style={[S.durationTile,reportDuration===v&&S.active]} onPress={()=>setReportDuration(v)}><Text style={S.btnText}>{v}</Text></TouchableOpacity>)}</View>\n                {getLastReportForStatus(reportStatus) && parseReportDurationMinutes(reportDuration) > 0 && <Text style={S.continuityHint}>🔄 Kontynuacja poprzedniego raportu: czas jest automatycznie naliczany od ostatniego wysłania.</Text>}
              </>}
            </>}
            <Text style={S.section}>Gotowy tekst</Text>
            <View style={S.reportPreview}><Text style={S.reportPreviewText}>{reportText() || 'Ustaw numer rejestracyjny w Ustawieniach.'}</Text></View>
          </ScrollView>
          <View style={S.reportFooter}>
            <TouchableOpacity style={S.generateFull} disabled={reportBusy} onPress={openWhatsAppReport}><Text style={S.btnText}>{reportBusy?'OTWIERANIE…':'📱 KOPIUJ I OTWÓRZ WHATSAPP'}</Text></TouchableOpacity>
            <TouchableOpacity style={S.sheetCancel} onPress={()=>setReportModal(false)}><Text style={S.sheetCancelText}>ZAMKNIJ</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const pinDialog = (
    <Modal visible={pinModal} transparent animationType="fade" onRequestClose={()=>setPinModal(false)}>
      <View style={S.overlay}>
        <View style={S.modal}>
          <Text style={S.modalTitle}>PIN aplikacji</Text>
          <Text style={S.helpLine}>Wpisz 4 cyfry. Zaznaczenie wyłączone wyłączy PIN.</Text>
          <TextInput
            value={pinEntry}
            onChangeText={v=>setPinEntry(v.replace(/\D/g,'').slice(0,4))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            style={S.pinInput}
            placeholder="••••"
            placeholderTextColor="#666"
          />
          <View style={S.row}>
            <TouchableOpacity style={[S.btn,pinEnabled&&S.active]} onPress={()=>setPinEnabled(true)}>
              <Text style={S.btnText}>Włącz PIN</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.btn} onPress={()=>{setPinEnabled(false);setPinEntry('')}}>
              <Text style={S.btnText}>Wyłącz PIN</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={S.closeBtn} onPress={savePin}>
            <Text style={S.btnText}>ZAPISZ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const backupDialog = (
    <Modal visible={backupModal} transparent animationType="slide" onRequestClose={()=>setBackupModal(false)}>
      <View style={S.overlay}>
        <View style={[S.modal,{maxHeight:'94%'}]}>
          <Text style={S.modalTitle}>Backup JSON</Text>
          <Text style={S.helpLine}>Możesz skopiować ten tekst i zachować go jako kopię grafiku.</Text>
          <TextInput
            value={backupText}
            onChangeText={setBackupText}
            multiline
            style={S.backupInput}
            textAlignVertical="top"
          />
          <View style={S.row}>
            <TouchableOpacity style={S.generate} onPress={shareBackup}>
              <Text style={S.btnText}>📤 UDOSTĘPNIJ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.btn} onPress={restoreBackup}>
              <Text style={S.btnText}>PRZYWRÓĆ</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={S.closeBtn} onPress={()=>setBackupModal(false)}>
            <Text style={S.btnText}>ZAMKNIJ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  if (FIREBASE_ENABLED && (!cloudUser || !cloudReady) && !guestMode) {
    return (
      <ImageBackground source={require('./icon-512.png')} resizeMode="cover" style={S.background}>
        <View style={S.scrim}><SafeAreaView style={S.container}><View style={S.loading}>
          <View style={S.modal}>
            <Text style={S.modalTitle}>GRAFIK PRACY ☁️</Text>
            <Text style={S.helpLine}>Zaloguj się, aby korzystać ze wspólnego grafiku.</Text>
            <TextInput value={authEmail} onChangeText={setAuthEmail} autoCapitalize="none" keyboardType="email-address" placeholder="E-mail" placeholderTextColor="#777" style={S.input}/>
            <TextInput value={authPassword} onChangeText={setAuthPassword} secureTextEntry placeholder="Hasło" placeholderTextColor="#777" style={[S.input,{marginTop:8}]}/>
            <TouchableOpacity style={S.rememberRow} onPress={()=>setRememberLogin(v=>!v)}>
              <View style={[S.rememberBox,rememberLogin&&S.rememberBoxActive]}>{rememberLogin&&<Text style={S.rememberCheck}>✓</Text>}</View>
              <Text style={S.optionText}>Zapamiętaj mnie na tym urządzeniu</Text>
            </TouchableOpacity>
            {!!cloudError && <Text style={[S.helpLine,{color:'#ff8a8a',marginTop:8}]}>{cloudError}</Text>}
            <TouchableOpacity style={S.closeBtn} disabled={authBusy} onPress={cloudLogin}><Text style={S.btnText}>{authBusy?'LOGOWANIE…':'ZALOGUJ SIĘ'}</Text></TouchableOpacity>
            <TouchableOpacity style={[S.btn,{marginTop:8}]} disabled={authBusy} onPress={cloudRegister}><Text style={S.btnText}>UTWÓRZ KONTO PRACOWNIKA</Text></TouchableOpacity><TouchableOpacity style={[S.btn,{marginTop:8}]} onPress={()=>{setGuestMode(true);setTab('teraz')}}><Text style={S.btnText}>👻 KONTYNUUJ JAKO GOŚĆ</Text></TouchableOpacity>
          </View>
        </View></SafeAreaView></View>
      </ImageBackground>
    );
  }

  if (!ready) {
    return (
      <SafeAreaView style={S.container}>
        <View style={S.loading}>
          <Text style={S.title}>GRAFIK PRACY</Text>
          <Text style={S.muted}>Ładowanie danych…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ImageBackground source={require('./icon-512.png')} resizeMode="cover" style={S.background}>
      <View style={S.scrim}>
        <SafeAreaView style={S.container}>
          {cloudUpdated && <View style={S.cloudBanner}><Text style={S.cloudBannerText}>☁️ Grafik został zaktualizowany</Text></View>}
          {FIREBASE_ENABLED && cloudUser && <View style={S.cloudStatus}>
            <Text style={S.cloudStatusText}>☁️ {cloudRole==='admin'?'Administrator':'Pracownik'} · {cloudUser.email}</Text>
            {cloudError ? <Text style={S.cloudStatusText}>⚠️ {cloudError}</Text> : null}
          </View>}
          {tab==='grafik' ? schedule : tab==='teraz' ? <NowDashboard weeks={weeks} rotation={rotation} warehouse={warehouse} times={times} personColors={personColors} weekConfigs={weekConfigs}/> : tab==='auto' ? <LiveLocationDashboard vehicleRegistration={vehicleRegistration} warehouseGeo={warehouseGeo} reportHistory={reportHistory} onApplySuggestion={applyLocationSuggestion}/> : tab==='summary' ? summary : tab==='chat' ? chat : settings}
          {editModal}
          {colorModal}
          {helpModal}
          {exportModalDialog}
          {conditionModalDialog}
          {offModalDialog}
          {swapModalDialog}
          {pinDialog}
          {backupDialog}
          {reportModalDialog}
          {weekSetupDialog}

          <View style={S.nav}>
            <TouchableOpacity style={[S.navBtn,tab==='teraz'&&S.navActive]} onPress={()=>setTab('teraz')}><Text style={S.navIcon}>🟢</Text><Text style={S.navText}>Teraz</Text></TouchableOpacity><TouchableOpacity style={[S.navBtn,tab==='grafik'&&S.navActive]} onPress={()=>setTab('grafik')}><Text style={S.navIcon}>📅</Text><Text style={S.navText}>Grafik</Text></TouchableOpacity>
            <TouchableOpacity style={[S.navBtn,tab==='auto'&&S.navActive]} onPress={()=>setTab('auto')}><Text style={S.navIcon}>📍</Text><Text style={S.navText}>Auto</Text></TouchableOpacity>
            <TouchableOpacity style={[S.navBtn,tab==='summary'&&S.navActive]} onPress={()=>setTab('summary')}><Text style={S.navIcon}>📊</Text><Text style={S.navText}>Podsumowanie</Text></TouchableOpacity>
            <TouchableOpacity style={[S.navBtn,tab==='chat'&&S.navActive]} onPress={()=>setTab('chat')}><Text style={S.navIcon}>💬</Text><Text style={S.navText}>Czat</Text></TouchableOpacity>
            <TouchableOpacity style={[S.navBtn,tab==='ustawienia'&&S.navActive]} onPress={()=>setTab('ustawienia')}><Text style={S.navIcon}>⚙️</Text><Text style={S.navText}>Ustawienia</Text></TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}

const S = StyleSheet.create({
  background:{flex:1,backgroundColor:'#090c12'},
  scrim:{flex:1,backgroundColor:'rgba(6,9,14,0.88)'},
  container:{flex:1,backgroundColor:'transparent'},
  content:{flex:1,width:'100%',maxWidth:760,alignSelf:'center',paddingHorizontal:12,paddingTop:10,paddingBottom:12},
  loading:{flex:1,justifyContent:'center',alignItems:'center',padding:20},
  header:{backgroundColor:'rgba(20,25,34,0.97)',borderRadius:20,padding:18,marginBottom:12,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#344054',shadowColor:'#000',shadowOpacity:0.22,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:4},
  title:{color:'#f8fafc',fontSize:28,fontWeight:'900',letterSpacing:0.6},
  muted:{color:'#9299a8',fontSize:14,marginTop:4},
  help:{width:42,height:42,borderRadius:21,backgroundColor:'#303744',alignItems:'center',justifyContent:'center'},
  helpText:{color:'#fff',fontSize:23,fontWeight:'900'},
  row:{flexDirection:'row',gap:8,flexWrap:'wrap',marginBottom:9},
  btn:{backgroundColor:'#202733',borderRadius:13,padding:13,minHeight:45,justifyContent:'center',borderWidth:1,borderColor:'#303a4a'},
  active:{backgroundColor:'#3f78ed',borderColor:'#5d8ff5'},
  btnText:{color:'#fff',fontWeight:'800',textAlign:'center'},
  generate:{flex:1,minWidth:125,backgroundColor:'#3f78ed',borderRadius:13,padding:13,alignItems:'center',justifyContent:'center',shadowColor:'#3f78ed',shadowOpacity:0.22,shadowRadius:8,elevation:3},
  weekBtn:{flex:1,minWidth:95,backgroundColor:'#2a303b',borderRadius:12,padding:12,alignItems:'center'},
  swapBtn:{backgroundColor:'#2a303b',borderRadius:12,padding:13,alignItems:'center',marginBottom:12},
  day:{backgroundColor:'rgba(20,25,34,0.97)',borderRadius:18,padding:13,marginBottom:12,borderWidth:1,borderColor:'#303a4a'},
  between:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  dayTitle:{color:'#fff',fontSize:21,fontWeight:'900'},
  dayBadge:{color:'#b9c9ff',fontWeight:'900',backgroundColor:'#26324d',paddingHorizontal:10,paddingVertical:6,borderRadius:12},
  shift:{backgroundColor:'#1b222d',borderRadius:15,padding:13,marginTop:9,borderWidth:1,borderColor:'#293343'},
  locked:{borderWidth:1,borderColor:'#667187'},
  shiftTitle:{color:'#fff',fontSize:17,fontWeight:'900'},
  time:{color:'#a1a8b6',fontSize:13,marginTop:3},
  lockText:{fontSize:16},
  person:{backgroundColor:'#273140',borderRadius:12,padding:12,marginTop:9,borderWidth:1,borderColor:'#354155'},
  personText:{color:'#fff',textAlign:'center',fontSize:17,fontWeight:'900'},
  personSub:{color:'#a7adba',textAlign:'center',fontSize:12,marginTop:3},
  actions:{flexDirection:'row',justifyContent:'space-between',marginTop:9},
  actionText:{color:'#9db9ff',fontWeight:'800'},
  delete:{color:'#ff7777',fontWeight:'800'},
  total:{backgroundColor:'#315fb8',borderRadius:20,padding:20,marginBottom:12,borderWidth:1,borderColor:'#5480d0',shadowColor:'#000',shadowOpacity:0.2,shadowRadius:10,elevation:4},
  totalSmall:{color:'#dbe6ff',fontWeight:'800'},
  totalBig:{color:'#fff',fontSize:29,fontWeight:'900',marginTop:4},
  totalInfo:{color:'#e6edff',fontSize:16,marginTop:4},
  totalMoney:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:7},
  employee:{backgroundColor:'rgba(20,25,34,0.97)',borderRadius:17,padding:17,marginBottom:9,borderWidth:1,borderColor:'#303a4a'},
  employeeName:{color:'#fff',fontSize:19,fontWeight:'900'},
  dot:{fontSize:20},
  stat:{color:'#9299a7',fontSize:15,marginTop:5},
  white:{color:'#fff',fontWeight:'800'},
  money:{color:'#68d797',fontWeight:'900'},
  section:{color:'#f8fafc',fontSize:19,fontWeight:'900',marginTop:18,marginBottom:10,letterSpacing:0.2},
  option:{backgroundColor:'rgba(20,25,34,0.97)',borderRadius:13,padding:14,marginBottom:7,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderWidth:1,borderColor:'#303a4a'},
  optionActive:{backgroundColor:'#263858',borderColor:'#4e79bd'},
  optionText:{color:'#fff',fontSize:15,fontWeight:'700'},
  check:{color:'#75a1ff',fontSize:20,fontWeight:'900'},
  timeBox:{backgroundColor:'rgba(28,32,41,0.96)',borderRadius:15,padding:13},
  timeRow:{flexDirection:'row',alignItems:'center',gap:7,marginBottom:8},
  input:{flex:1,backgroundColor:'#111722',color:'#fff',borderRadius:11,padding:12,fontSize:16,borderWidth:1,borderColor:'#2e394b'},
  sep:{color:'#aaa',fontSize:18},
  generateFull:{backgroundColor:'#467ff1',padding:16,borderRadius:13,alignItems:'center',marginTop:14},
  danger:{backgroundColor:'#7b3039',padding:16,borderRadius:13,alignItems:'center',marginTop:10},
  nav:{height:78,width:'94%',maxWidth:760,alignSelf:'center',backgroundColor:'rgba(14,18,26,0.99)',borderWidth:1,borderColor:'#3b4659',borderRadius:24,flexDirection:'row',alignItems:'center',paddingHorizontal:5,paddingTop:4,paddingBottom:Platform.OS==='android'?14:8,marginBottom:Platform.OS==='android'?18:10,shadowColor:'#000',shadowOpacity:0.35,shadowRadius:12,shadowOffset:{width:0,height:5},elevation:10},
  navBtn:{flex:1,alignItems:'center',justifyContent:'center',paddingVertical:7,paddingHorizontal:2,marginHorizontal:2,borderRadius:16,minHeight:60},
  navActive:{backgroundColor:'#293c62',borderWidth:1,borderColor:'#5b82c4',shadowColor:'#467ff1',shadowOpacity:0.12,shadowRadius:6,elevation:2},
  navIcon:{fontSize:19},
  navText:{color:'#aab3c2',marginTop:3,fontSize:10,fontWeight:'800'},
  chatHeader:{flexDirection:'row',alignItems:'center',backgroundColor:'rgba(20,25,34,0.97)',borderRadius:16,padding:12,marginBottom:8,borderWidth:1,borderColor:'#303a4a'},
  chatBadge:{color:'#fff',backgroundColor:'#467ff1',fontWeight:'900',paddingHorizontal:10,paddingVertical:6,borderRadius:12},
  chatBox:{backgroundColor:'rgba(13,18,27,0.98)',borderRadius:16,padding:10,borderWidth:1,borderColor:'#303a4a',minHeight:280,maxHeight:520},
  chatMessage:{backgroundColor:'#252b35',borderRadius:13,padding:10,marginBottom:8,maxWidth:'92%'},
  chatMine:{alignSelf:'flex-end',backgroundColor:'#30466f'},
  chatAuthor:{color:'#fff',fontWeight:'900',fontSize:12},
  chatTime:{color:'#8992a2',fontSize:10},
  chatText:{color:'#fff',fontSize:15,lineHeight:20,marginTop:4},
  chatComposer:{flexDirection:'row',gap:8,alignItems:'flex-end',marginTop:9,marginBottom:10},
  chatInput:{flex:1,backgroundColor:'#171b23',color:'#fff',borderRadius:12,padding:12,fontSize:15,minHeight:48,maxHeight:110},
  chatSend:{flex:0,minWidth:88},
  reportCard:{backgroundColor:'rgba(25,29,38,0.94)',borderRadius:14,padding:12,marginBottom:8,borderWidth:1,borderColor:'#2b3240'},
  reportOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.78)',justifyContent:'flex-end'},
  reportSheet:{backgroundColor:'#191d26',borderTopLeftRadius:26,borderTopRightRadius:26,maxHeight:'94%',paddingTop:8,borderWidth:1,borderColor:'#303745'},
  sheetHandle:{width:42,height:4,borderRadius:2,backgroundColor:'#596273',alignSelf:'center',marginBottom:8},
  sheetHeader:{flexDirection:'row',alignItems:'center',paddingHorizontal:18,paddingBottom:8},
  sheetSub:{color:'#8f98a8',fontSize:12,marginTop:-3},
  sheetClose:{width:38,height:38,borderRadius:19,backgroundColor:'#2a303b',alignItems:'center',justifyContent:'center'},
  sheetCloseText:{color:'#fff',fontSize:18,fontWeight:'900'},
  statusGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,paddingHorizontal:18},
  statusTile:{width:'48%',minHeight:58,backgroundColor:'#222732',borderRadius:13,padding:11,justifyContent:'center',borderWidth:1,borderColor:'#2e3542'},
  statusTileActive:{backgroundColor:'#303b58',borderColor:'#467ff1'},
  statusTileText:{color:'#d4d9e2',fontSize:12,fontWeight:'800',paddingRight:16},
  statusTileTextActive:{color:'#fff'},
  statusCheck:{position:'absolute',right:9,top:8,color:'#79a3ff',fontSize:18,fontWeight:'900'},
  fieldLabel:{color:'#8f98a8',fontSize:12,fontWeight:'800',marginHorizontal:18,marginBottom:5},
  chipRow:{paddingHorizontal:18,paddingBottom:2},
  durationGrid:{flexDirection:'row',flexWrap:'wrap',gap:7,paddingHorizontal:18},
  durationTile:{backgroundColor:'#2a303b',borderRadius:10,paddingVertical:11,paddingHorizontal:12},
  continuityHint:{color:'#9db9ff',fontSize:12,lineHeight:17,marginHorizontal:18,marginTop:7,marginBottom:4,fontWeight:'700'},
  reportInput:{marginHorizontal:18,backgroundColor:'#11151c',color:'#fff',borderRadius:11,padding:12,fontSize:15,marginBottom:10},
  reportPreview:{marginHorizontal:18,backgroundColor:'#11151c',borderRadius:14,padding:14,borderWidth:1,borderColor:'#303745'},
  reportPreviewText:{color:'#fff',fontSize:15,lineHeight:21,fontWeight:'700'},
  reportFooter:{paddingHorizontal:18,paddingTop:8,paddingBottom:12,borderTopWidth:1,borderTopColor:'#2b313d',backgroundColor:'#191d26'},
  sheetCancel:{alignItems:'center',padding:10},
  sheetCancelText:{color:'#9ca5b5',fontWeight:'800'},
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.82)',justifyContent:'center',padding:14},
  modal:{backgroundColor:'#171d27',borderRadius:22,padding:18,maxHeight:'88%',borderWidth:1,borderColor:'#374254',shadowColor:'#000',shadowOpacity:0.35,shadowRadius:18,elevation:12},
  modalTitle:{color:'#fff',fontSize:23,fontWeight:'900',marginBottom:8},
  modalOpt:{backgroundColor:'#2a303b',borderRadius:11,padding:13,marginTop:7},
  chip:{backgroundColor:'#2a303b',padding:11,borderRadius:11,marginRight:7},
  closeBtn:{backgroundColor:'#3f78ed',padding:15,borderRadius:13,alignItems:'center',marginTop:10,shadowColor:'#3f78ed',shadowOpacity:0.18,shadowRadius:7,elevation:3},
  helpLine:{color:'#c7ccd6',fontSize:15,lineHeight:22,marginBottom:7},
  pinInput:{backgroundColor:'#11151c',color:'#fff',borderRadius:12,padding:15,fontSize:25,textAlign:'center',letterSpacing:10,marginVertical:12},
  tableCard:{backgroundColor:'rgba(25,29,38,0.97)',borderRadius:16,borderWidth:1,borderColor:'#303745',overflow:'hidden',marginBottom:12},
  exportCard:{backgroundColor:'#151922',borderRadius:10,borderColor:'#394252',margin:0},
  tableTitleRow:{flexDirection:'row',alignItems:'center',padding:12,borderBottomWidth:1,borderBottomColor:'#303745'},
   legendRow:{flexDirection:'row',flexWrap:'wrap',gap:6,padding:8,borderBottomWidth:1,borderBottomColor:'#303745'},
   legendItem:{paddingHorizontal:9,paddingVertical:5,borderRadius:8},
   legendText:{fontSize:10,fontWeight:'900'},
  tableTitle:{color:'#fff',fontSize:18,fontWeight:'900'},
  tableSubtitle:{color:'#9da5b4',fontSize:11,marginTop:3},
  tableWarehouse:{color:'#b9c9ff',fontWeight:'900',fontSize:12},
  tableHeader:{flexDirection:'row',backgroundColor:'#303744'},
  tableRow:{flexDirection:'row',borderTopWidth:1,borderTopColor:'#303745'},
  tableCell:{padding:8,justifyContent:'center'},
  tableDayCell:{width:'24%'},
  tableShiftCell:{width:'38%'},
  tableHead:{color:'#fff',fontWeight:'900',fontSize:12,textAlign:'center'},
  tableDay:{color:'#fff',fontWeight:'800',fontSize:11},
  tableShift:{minHeight:68,borderLeftWidth:1,borderLeftColor:'#303745'},
  tablePerson:{color:'#fff',fontSize:12,fontWeight:'900',textAlign:'center'},
  tableMeta:{color:'#9da5b4',fontSize:9,textAlign:'center',marginTop:2},
  colorPreview:{width:22,height:22,borderRadius:11,borderWidth:1,borderColor:'rgba(255,255,255,0.35)'},
  palette:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',paddingVertical:8},
  colorSwatch:{width:44,height:44,borderRadius:22,margin:7,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'transparent'},
  colorSelected:{borderColor:'#fff',transform:[{scale:1.12}]},
  colorCheck:{fontSize:24,fontWeight:'900'},
  cloudBanner:{backgroundColor:'#1d6b45',padding:9,marginHorizontal:14,borderRadius:10,marginBottom:7},
  cloudBannerText:{color:'#fff',fontWeight:'900',textAlign:'center'},
  cloudStatus:{backgroundColor:'rgba(25,29,38,0.94)',padding:7,marginHorizontal:14,borderRadius:9,marginBottom:7,borderWidth:1,borderColor:'#2b3240'},
  swapMini:{marginTop:6,paddingVertical:4},
  listExportRow:{paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#2b3240'},
  listExportDay:{color:'#fff',fontWeight:'900',fontSize:13},
  listExportItem:{color:'#cbd5e1',fontSize:12,marginTop:3},
  proposalCard:{backgroundColor:'rgba(25,29,38,0.94)',borderRadius:14,padding:12,marginBottom:8,borderWidth:1,borderColor:'#2b3240'},
  cloudStatusText:{color:'#9fd5ff',fontSize:11,textAlign:'center',fontWeight:'800'},
  backupInput:{backgroundColor:'#11151c',color:'#fff',borderRadius:12,padding:12,fontSize:12,minHeight:260,maxHeight:420},
  rememberRow:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:12},
  rememberBox:{width:24,height:24,borderRadius:6,borderWidth:2,borderColor:'#667085',alignItems:'center',justifyContent:'center'},
  rememberBoxActive:{backgroundColor:'#467ff1',borderColor:'#467ff1'},
  rememberCheck:{color:'#fff',fontSize:18,fontWeight:'900'},
});