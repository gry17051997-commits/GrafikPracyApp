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
  Dimensions
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import {captureRef} from 'react-native-view-shot';
import {FIREBASE_ENABLED, auth, db} from './firebaseConfig';
import {getReactNativePersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut} from 'firebase/auth';
import {doc, getDoc, setDoc, onSnapshot, serverTimestamp} from 'firebase/firestore';

const KEY = 'grafik-pracy-v5';
const LEGACY_KEY = 'grafik-pracy-v4';
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
  const [cloudUpdated,setCloudUpdated] = useState(false);
  const readOnly = FIREBASE_ENABLED && !!cloudUser && cloudRole !== 'admin';

  const wkKey = iso(weekStart);
  const currentWeek = weeks[wkKey] || generateWeek(rotation,warehouse);
  const personColor = k => personColors[k] || PEOPLE[k].color;

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
          setPin(data.pin || '');
          setPinEnabled(!!data.pinEnabled);
          setDark(data.dark !== false);
          setPersonColors({...{P:PEOPLE.P.color,M:PEOPLE.M.color,L:PEOPLE.L.color},...(data.personColors || {})});
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
    if (!ready) return;
    const data = {hours,rotation,warehouse,weeks,pin,pinEnabled,dark,times:{
      10: DEFAULT_TIMES[10],
      12: DEFAULT_TIMES[12],
      [hours]: times
    },personColors};
    AsyncStorage.setItem(KEY,JSON.stringify(data)).catch(()=>{});
  },[ready,hours,rotation,warehouse,weeks,pin,pinEnabled,dark,times,personColors]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !auth) return;
    const unsub = onAuthStateChanged(auth, async user => {
      setCloudUser(user || null);
      setCloudError('');
      if (!user) {
        setCloudRole('employee');
        setCloudReady(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db,'users',user.uid));
        setCloudRole(snap.exists() && snap.data().role === 'admin' ? 'admin' : 'employee');
      } catch (e) {
        setCloudRole('employee');
        setCloudError('Nie udało się odczytać uprawnień użytkownika.');
      } finally {
        setCloudReady(true);
      }
    });
    return unsub;
  },[]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !db || !cloudUser) return;
    const unsub = onSnapshot(doc(db,'schedules','main'), snap => {
      if (!snap.exists()) return;
      const data = snap.data() || {};
      cloudApplying.current = true;
      if (data.hours) setHours(data.hours);
      if (data.rotation) setRotation(data.rotation);
      if (data.warehouse) setWarehouse(data.warehouse);
      if (data.weeks) setWeeks(data.weeks);
      if (data.personColors) setPersonColors(data.personColors);
      if (data.times) setTimes(data.times[data.hours || hours] || DEFAULT_TIMES[data.hours || hours]);
      setCloudUpdated(true);
      setTimeout(() => setCloudUpdated(false), 2500);
    }, err => setCloudError('Brak dostępu do wspólnego grafiku. Sprawdź reguły Firestore.'));
    return unsub;
  },[cloudUser]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !db || !cloudUser || cloudRole !== 'admin' || !ready) return;
    if (cloudApplying.current) {
      cloudApplying.current = false;
      return;
    }
    const payload = {hours,rotation,warehouse,weeks,times:{10:DEFAULT_TIMES[10],12:DEFAULT_TIMES[12],[hours]:times},personColors,updatedAt:serverTimestamp(),updatedBy:cloudUser.uid};
    setDoc(doc(db,'schedules','main'),payload,{merge:true}).catch(()=>setCloudError('Nie udało się zapisać grafiku online.'));
  },[ready,hours,rotation,warehouse,weeks,times,personColors,cloudUser,cloudRole]);

  const cloudLogin = async () => {
    setAuthBusy(true); setCloudError('');
    try { await signInWithEmailAndPassword(auth,authEmail.trim(),authPassword); setAuthPassword(''); }
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

  const cloudLogout = async () => { try { await signOut(auth); } catch(e) {} };

  useEffect(() => {
    if (!weeks[wkKey]) {
      setWeeks(prev => ({...prev,[wkKey]:generateWeek(rotation,warehouse)}));
    }
  },[wkKey]);

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
  };

  const regenerate = () => {
    if (readOnly) return;
    Alert.alert(
      'Wygenerować grafik?',
      'Generator utworzy nowy układ. Ręcznie zmienione lub zablokowane zmiany zostaną zachowane.',
      [
        {text:'Anuluj',style:'cancel'},
        {text:'Generuj',onPress:() => {
          setWeek(old => {
            const fresh = generateWeek(rotation,warehouse);
            old.forEach((day,i) => {
              day.shifts.forEach((oldShift,j) => {
                if (oldShift.locked || oldShift.manual) {
                  fresh[i].shifts[j] = {...oldShift};
                }
              });
            });
            return fresh;
          });
        }}
      ]
    );
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

  const moveWeek = n => setWeekStart(addDays(weekStart,n*7));
  const todayWeek = () => setWeekStart(monday(new Date()));

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

  const newWeek = () => {
    const next = addDays(weekStart,7);
    setWeekStart(next);
    if (!weeks[iso(next)]) {
      setWeeks(prev => ({...prev,[iso(next)]:generateWeek(rotation,warehouse)}));
    }
  };

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
      const uri = await captureRef(exportRef, {
        format:'jpg',
        quality:0.95,
        result:'tmpfile',
        width:Math.min(Dimensions.get('window').width * 3, 1440)
      });
      await shareFile(uri, 'image/jpeg', 'Udostępnij grafik JPG');
    } catch(e) {
      console.log(e);
      Alert.alert('Błąd','Nie udało się przygotować grafiku JPG.');
    }
  };

  const escapeHtml = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');

  const exportPdf = async () => {
    try {
      const rows = currentWeek.map((d,i) => {
        const date = addDays(weekStart,i);
        const a = d.shifts[0];
        const b = d.shifts[1];
        const person = s => s?.person ? PEOPLE[s.person]?.name : 'WOLNA';
        const wh = s => s?.warehouse || d.warehouse || warehouse;
        const cell = s => {
          const bg = s?.person ? personColor(s.person) : '#e5e7eb';
          const fg = contrastText(bg);
          return `<td style=\"background:${bg};color:${fg}\"><b>${escapeHtml(person(s))}</b><br><span style=\"color:${fg};opacity:.78\">${escapeHtml(wh(s))}</span><br><span style=\"color:${fg};opacity:.78\">${escapeHtml(shiftTime(times,s?.shift || 1))}</span></td>`;
        };
        return `<tr><td><b>${DAYS[i]}</b><br><span>${shortDate(date)}</span></td>${cell(a)}${cell(b)}</tr>`;
      }).join('');
      const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@page{size:A4 landscape;margin:18px}body{font-family:Arial,sans-serif;color:#111;margin:0}h1{font-size:22px;margin:0 0 4px}p{margin:0 0 14px;color:#555;font-size:12px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #555;padding:8px;text-align:center;font-size:11px;vertical-align:middle}th{background:#222;color:#fff;font-size:12px}td:first-child{width:14%;text-align:left}td{height:55px}span{color:#666}</style></head><body><h1>GRAFIK PRACY</h1><p>${fullDate(weekStart)} – ${fullDate(addDays(weekStart,6))} · ${hours} h · ${escapeHtml(warehouse)}</p><div style="margin:0 0 12px;font-size:11px">${PERSON_KEYS.map(k=>`<span style="display:inline-block;background:${personColor(k)};color:${contrastText(personColor(k))};padding:4px 8px;margin-right:6px;border-radius:4px"><b>${escapeHtml(PEOPLE[k].name)}</b></span>`).join('')}</div><table><thead><tr><th>Dzień</th><th>Zmiana I · ${escapeHtml(shiftTime(times,1))}</th><th>Zmiana II · ${escapeHtml(shiftTime(times,2))}</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
      const {uri} = await Print.printToFileAsync({html,width:842,height:595});
      await shareFile(uri, 'application/pdf', 'Udostępnij grafik PDF');
    } catch(e) {
      console.log(e);
      Alert.alert('Błąd','Nie udało się przygotować grafiku PDF.');
    }
  };

  const compactTable = (forExport=false) => (
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
          {[0,1].map(si => { const sh=d.shifts[si]; return <TouchableOpacity key={si} disabled={forExport} onPress={()=>!readOnly && setEdit({dayIndex:i,shiftIndex:si})} style={[S.tableCell,S.tableShiftCell,S.tableShift,sh.person&&{backgroundColor:personColor(sh.person)}]}>
            <Text style={[S.tablePerson,sh.person&&{color:contrastText(personColor(sh.person))}]}>{sh.person ? PEOPLE[sh.person].name : 'WOLNA'}</Text>
            <Text style={[S.tableMeta,sh.person&&{color:contrastText(personColor(sh.person)),opacity:0.78}]}>{sh.warehouse || d.warehouse || warehouse}</Text>
            <Text style={[S.tableMeta,sh.person&&{color:contrastText(personColor(sh.person)),opacity:0.78}]}>{shiftTime(times,si+1)}</Text>
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
    <ScrollView style={S.content} contentContainerStyle={{paddingBottom:110}}>
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
                <Text style={S.dayTitle}>{DAYS[di]}</Text>
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
                    onPress={()=>!readOnly && setEdit({dayIndex:di,shiftIndex:si})}
                  >
                    <Text style={[S.personText,p&&{color:contrastText(personColor(s.person))}]}>{p ? p.name : 'WOLNA ZMIANA'}</Text>
                    <Text style={[S.personSub,p&&{color:contrastText(personColor(s.person)),opacity:0.82}]}>{s.warehouse || warehouse}</Text>
                  </TouchableOpacity>

                  <View style={S.actions}>
                    <TouchableOpacity onPress={()=>!readOnly && toggleLock(di,si)}>
                      <Text style={S.actionText}>{s.locked?'Odblokuj':'Zablokuj'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={()=>!readOnly && setEdit({dayIndex:di,shiftIndex:si})}>
                      <Text style={S.actionText}>Edytuj</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={()=>!readOnly && removeShift(di,si)}>
                      <Text style={S.delete}>Usuń</Text>
                    </TouchableOpacity>
                  </View>
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

  const settings = (
    <ScrollView style={S.content} contentContainerStyle={{paddingBottom:110}}>
      {header}
      <Text style={S.section}>Rotacja</Text>
      <View style={S.row}>
        {['P','M'].map(k=>
          <TouchableOpacity key={k} style={[S.btn,rotation===k&&S.active]} onPress={()=>setRotation(k)}>
            <Text style={S.btnText}>Start: {PEOPLE[k].name}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={S.section}>Domyślny magazyn</Text>
      {WAREHOUSES.map(w=>
        <TouchableOpacity key={w} style={[S.option,warehouse===w&&S.optionActive]} onPress={()=>!readOnly && setWarehouse(w)}>
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
      <View style={S.overlay}>
        <View style={[S.modal,{maxHeight:'94%'}]}>
          <Text style={S.modalTitle}>Udostępnij gotowy grafik</Text>
          <Text style={S.helpLine}>Wybierz format. Tabela zawiera cały tydzień, oba zakresy godzin i magazyny.</Text>
          <ScrollView style={{maxHeight:470}} contentContainerStyle={{paddingBottom:4}}>
            {compactTable(true)}
          </ScrollView>
          <View style={S.row}>
            <TouchableOpacity style={S.generate} onPress={exportJpg}><Text style={S.btnText}>🖼️ JPG</Text></TouchableOpacity>
            <TouchableOpacity style={S.btn} onPress={exportPdf}><Text style={S.btnText}>📄 PDF</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={S.closeBtn} onPress={()=>setExportModal(false)}><Text style={S.btnText}>ZAMKNIJ</Text></TouchableOpacity>
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

  if (FIREBASE_ENABLED && (!cloudUser || !cloudReady)) {
    return (
      <ImageBackground source={require('./icon-512.png')} resizeMode="cover" style={S.background}>
        <View style={S.scrim}><SafeAreaView style={S.container}><View style={S.loading}>
          <View style={S.modal}>
            <Text style={S.modalTitle}>GRAFIK PRACY ☁️</Text>
            <Text style={S.helpLine}>Zaloguj się, aby korzystać ze wspólnego grafiku.</Text>
            <TextInput value={authEmail} onChangeText={setAuthEmail} autoCapitalize="none" keyboardType="email-address" placeholder="E-mail" placeholderTextColor="#777" style={S.input}/>
            <TextInput value={authPassword} onChangeText={setAuthPassword} secureTextEntry placeholder="Hasło" placeholderTextColor="#777" style={[S.input,{marginTop:8}]}/>
            {!!cloudError && <Text style={[S.helpLine,{color:'#ff8a8a',marginTop:8}]}>{cloudError}</Text>}
            <TouchableOpacity style={S.closeBtn} disabled={authBusy} onPress={cloudLogin}><Text style={S.btnText}>{authBusy?'LOGOWANIE…':'ZALOGUJ SIĘ'}</Text></TouchableOpacity>
            <TouchableOpacity style={[S.btn,{marginTop:8}]} disabled={authBusy} onPress={cloudRegister}><Text style={S.btnText}>UTWÓRZ KONTO PRACOWNIKA</Text></TouchableOpacity>
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
          {FIREBASE_ENABLED && cloudUser && <View style={S.cloudStatus}><Text style={S.cloudStatusText}>☁️ {cloudRole==='admin'?'Administrator':'Pracownik'} · {cloudUser.email}</Text></View>}
          {tab==='grafik' ? schedule : tab==='summary' ? summary : settings}
          {editModal}
          {colorModal}
          {helpModal}
          {exportModalDialog}
          {pinDialog}
          {backupDialog}

          <View style={S.nav}>
            <TouchableOpacity style={[S.navBtn,tab==='grafik'&&S.navActive]} onPress={()=>setTab('grafik')}>
              <Text style={S.navIcon}>📅</Text>
              <Text style={S.navText}>Grafik</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[S.navBtn,tab==='summary'&&S.navActive]} onPress={()=>setTab('summary')}>
              <Text style={S.navIcon}>📊</Text>
              <Text style={S.navText}>Podsumowanie</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[S.navBtn,tab==='ustawienia'&&S.navActive]} onPress={()=>setTab('ustawienia')}>
              <Text style={S.navIcon}>⚙️</Text>
              <Text style={S.navText}>Ustawienia</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}

const S = StyleSheet.create({
  background:{flex:1,backgroundColor:'#0d1016'},
  scrim:{flex:1,backgroundColor:'rgba(7,10,15,0.82)'},
  container:{flex:1,backgroundColor:'transparent'},
  content:{flex:1,padding:14},
  loading:{flex:1,justifyContent:'center',alignItems:'center',padding:20},
  header:{backgroundColor:'rgba(25,29,38,0.94)',borderRadius:22,padding:18,marginBottom:12,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#2b3240'},
  title:{color:'#fff',fontSize:28,fontWeight:'900',letterSpacing:1},
  muted:{color:'#9299a8',fontSize:14,marginTop:4},
  help:{width:42,height:42,borderRadius:21,backgroundColor:'#303744',alignItems:'center',justifyContent:'center'},
  helpText:{color:'#fff',fontSize:23,fontWeight:'900'},
  row:{flexDirection:'row',gap:8,flexWrap:'wrap',marginBottom:9},
  btn:{backgroundColor:'#2a303b',borderRadius:12,padding:13,minHeight:45,justifyContent:'center'},
  active:{backgroundColor:'#467ff1'},
  btnText:{color:'#fff',fontWeight:'800',textAlign:'center'},
  generate:{flex:1,minWidth:125,backgroundColor:'#467ff1',borderRadius:12,padding:13,alignItems:'center',justifyContent:'center'},
  weekBtn:{flex:1,minWidth:95,backgroundColor:'#2a303b',borderRadius:12,padding:12,alignItems:'center'},
  swapBtn:{backgroundColor:'#2a303b',borderRadius:12,padding:13,alignItems:'center',marginBottom:12},
  day:{backgroundColor:'rgba(25,29,38,0.95)',borderRadius:20,padding:13,marginBottom:12,borderWidth:1,borderColor:'#292f3b'},
  between:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  dayTitle:{color:'#fff',fontSize:21,fontWeight:'900'},
  dayBadge:{color:'#b9c9ff',fontWeight:'900',backgroundColor:'#26324d',paddingHorizontal:10,paddingVertical:6,borderRadius:12},
  shift:{backgroundColor:'#222732',borderRadius:16,padding:13,marginTop:9},
  locked:{borderWidth:1,borderColor:'#667187'},
  shiftTitle:{color:'#fff',fontSize:17,fontWeight:'900'},
  time:{color:'#a1a8b6',fontSize:13,marginTop:3},
  lockText:{fontSize:16},
  person:{backgroundColor:'#303744',borderRadius:12,padding:12,marginTop:9},
  personText:{color:'#fff',textAlign:'center',fontSize:17,fontWeight:'900'},
  personSub:{color:'#a7adba',textAlign:'center',fontSize:12,marginTop:3},
  actions:{flexDirection:'row',justifyContent:'space-between',marginTop:9},
  actionText:{color:'#9db9ff',fontWeight:'800'},
  delete:{color:'#ff7777',fontWeight:'800'},
  total:{backgroundColor:'#467ff1',borderRadius:20,padding:20,marginBottom:12},
  totalSmall:{color:'#dbe6ff',fontWeight:'800'},
  totalBig:{color:'#fff',fontSize:29,fontWeight:'900',marginTop:4},
  totalInfo:{color:'#e6edff',fontSize:16,marginTop:4},
  totalMoney:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:7},
  employee:{backgroundColor:'rgba(28,32,41,0.96)',borderRadius:17,padding:17,marginBottom:9,borderWidth:1,borderColor:'#2b313d'},
  employeeName:{color:'#fff',fontSize:19,fontWeight:'900'},
  dot:{fontSize:20},
  stat:{color:'#9299a7',fontSize:15,marginTop:5},
  white:{color:'#fff',fontWeight:'800'},
  money:{color:'#68d797',fontWeight:'900'},
  section:{color:'#fff',fontSize:19,fontWeight:'900',marginTop:16,marginBottom:9},
  option:{backgroundColor:'rgba(28,32,41,0.96)',borderRadius:12,padding:14,marginBottom:7,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderWidth:1,borderColor:'#292f3a'},
  optionActive:{backgroundColor:'#303b58',borderColor:'#466aa8'},
  optionText:{color:'#fff',fontSize:15,fontWeight:'700'},
  check:{color:'#75a1ff',fontSize:20,fontWeight:'900'},
  timeBox:{backgroundColor:'rgba(28,32,41,0.96)',borderRadius:15,padding:13},
  timeRow:{flexDirection:'row',alignItems:'center',gap:7,marginBottom:8},
  input:{flex:1,backgroundColor:'#171b23',color:'#fff',borderRadius:10,padding:12,fontSize:16},
  sep:{color:'#aaa',fontSize:18},
  generateFull:{backgroundColor:'#467ff1',padding:16,borderRadius:13,alignItems:'center',marginTop:14},
  danger:{backgroundColor:'#7b3039',padding:16,borderRadius:13,alignItems:'center',marginTop:10},
  nav:{height:74,backgroundColor:'rgba(25,29,38,0.98)',borderTopWidth:1,borderTopColor:'#2a3039',flexDirection:'row',alignItems:'center'},
  navBtn:{flex:1,alignItems:'center',padding:8,marginHorizontal:4,borderRadius:13},
  navActive:{backgroundColor:'#272d38'},
  navIcon:{fontSize:18},
  navText:{color:'#9aa1ae',marginTop:2,fontSize:12,fontWeight:'700'},
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.82)',justifyContent:'center',padding:14},
  modal:{backgroundColor:'#191d26',borderRadius:21,padding:18,maxHeight:'88%',borderWidth:1,borderColor:'#303745'},
  modalTitle:{color:'#fff',fontSize:23,fontWeight:'900',marginBottom:8},
  modalOpt:{backgroundColor:'#2a303b',borderRadius:11,padding:13,marginTop:7},
  chip:{backgroundColor:'#2a303b',padding:11,borderRadius:11,marginRight:7},
  closeBtn:{backgroundColor:'#467ff1',padding:15,borderRadius:12,alignItems:'center',marginTop:10},
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
  cloudStatusText:{color:'#9fd5ff',fontSize:11,textAlign:'center',fontWeight:'800'},
  backupInput:{backgroundColor:'#11151c',color:'#fff',borderRadius:12,padding:12,fontSize:12,minHeight:260,maxHeight:420},
});
