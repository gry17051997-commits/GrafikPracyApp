import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import {Platform} from 'react-native';
import {collection, doc, getDoc, setDoc, serverTimestamp} from 'firebase/firestore';
import {db, FIREBASE_ENABLED, auth} from './firebaseConfig';

export const LOCATION_TASK_NAME = 'grafik-pracy-vehicle-location-v1';
export const LOCATION_CONFIG_KEY = 'grafik-pracy-location-config-v1';
export const LOCATION_CURRENT_KEY = 'grafik-pracy-location-current-v1';

export const normalizeVehicleId = value => String(value || 'SŁUŻBOWY').trim().toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]+/gi,'_').slice(0,40) || 'SLUZBOWY';

async function getConfig() {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}
async function getCentralVehicleAssignment() {
  if (!FIREBASE_ENABLED || !db) return {vehicleId:'',registration:'',exists:false};
  try {
    const snap=await getDoc(doc(db,'locationConfig','main'));
    if (!snap.exists()) return {vehicleId:'',registration:'',exists:false};
    const data=snap.data() || {};
    const rawVehicleId=data.vehicleId || data.registration || '';
    const vehicleId=rawVehicleId ? normalizeVehicleId(rawVehicleId) : '';
    const registration=String(data.registration || data.vehicleId || '').trim().toUpperCase();
    return {vehicleId,registration,exists:!!(vehicleId || registration)};
  } catch(error) {
    return {vehicleId:'',registration:'',exists:false,error};
  }
}

async function stopIfCentralAssignmentChanged(localConfig=null) {
  const cfg=localConfig || await getConfig();
  const central=await getCentralVehicleAssignment();
  if (!central.exists) {
    if (cfg.enabled===true) await stopVehicleLocationTracking();
    return {ok:false,reason:'central-assignment-missing'};
  }
  const localVehicleRaw=cfg.vehicleId || cfg.registration || '';
  const localVehicle=localVehicleRaw ? normalizeVehicleId(localVehicleRaw) : '';
  const localRegistration=String(cfg.registration || cfg.vehicleId || '').trim().toUpperCase();
  if (central.vehicleId && localVehicle && central.vehicleId !== localVehicle) {
    await stopVehicleLocationTracking();
    return {ok:false,reason:'central-assignment-mismatch',expected:central.vehicleId,actual:localVehicle};
  }
  if (central.registration && localRegistration && central.registration !== localRegistration) {
    await stopVehicleLocationTracking();
    return {ok:false,reason:'central-registration-mismatch',expected:central.registration,actual:localRegistration};
  }
  return {ok:true,vehicleId:central.vehicleId || localVehicle,registration:central.registration || localRegistration};
}

function distanceMeters(a,b) {
  const R=6371000;
  const p1=a.latitude*Math.PI/180, p2=b.latitude*Math.PI/180;
  const dp=(b.latitude-a.latitude)*Math.PI/180, dl=(b.longitude-a.longitude)*Math.PI/180;
  const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

async function waitForAuthenticatedUser(timeoutMs=20000) {
  if (auth?.currentUser?.uid) return auth.currentUser.uid;
  const started=Date.now();
  while (Date.now()-started < timeoutMs) {
    await new Promise(resolve=>setTimeout(resolve,500));
    if (auth?.currentUser?.uid) return auth.currentUser.uid;
  }
  return null;
}

const LOCATION_OPTIONS={
  accuracy:Location.Accuracy.High,
  timeInterval:15000,
  distanceInterval:25,
  // Nie używamy deferredUpdates w nadajniku auta. W tle Android może wtedy
  // grupować lokalizacje, co pogarsza podgląd "na żywo".
  pausesUpdatesAutomatically:false,
  showsBackgroundLocationIndicator:true,
  foregroundService:{
    notificationTitle:'Grafik Pracy • lokalizacja auta',
    notificationBody:'Udostępnianie lokalizacji służbowego telefonu jest aktywne.',
    notificationColor:'#467ff1',
    killServiceOnDestroy:false
  }
};

let locationSaveQueue = Promise.resolve();

async function saveLocationInternal(location) {
  if (!FIREBASE_ENABLED || !db || !location?.coords) return;
  const cfg=await getConfig();
  if (cfg.enabled===false) return;
  const assigned=await stopIfCentralAssignmentChanged(cfg);
  if (!assigned.ok) return;
  const vehicleId=normalizeVehicleId(assigned.vehicleId || cfg.vehicleId || cfg.registration);
  const c=location.coords;
  const now=Date.now();
  // W zadaniu tła Firebase Auth może potrzebować chwili na odtworzenie sesji
  // z AsyncStorage po zablokowaniu telefonu lub ubiciu procesu aplikacji.
  // Nie rezygnujemy z zapisu tylko dlatego, że currentUser nie jest jeszcze gotowy.
  const expectedUid=auth?.currentUser?.uid || null;
  const ownerUid=await waitForAuthenticatedUser(20000);
  if(!ownerUid) return;
  const currentConfig=await getConfig();
  if(currentConfig.enabled!==true) return;
  if(expectedUid && ownerUid!==expectedUid) return;
  if(auth?.currentUser?.uid!==ownerUid) return;
  const payload={
    vehicleId,
    ownerUid,
    registration:cfg.registration||vehicleId,
    latitude:Number(c.latitude),
    longitude:Number(c.longitude),
    accuracy:Number(c.accuracy||0),
    altitude:Number(c.altitude||0),
    speed:Number.isFinite(c.speed)?Number(c.speed):null,
    heading:Number.isFinite(c.heading)?Number(c.heading):null,
    // Server time is authoritative for freshness; clientObservedAt is only diagnostic/local fallback.
    updatedAt:serverTimestamp(),
    clientObservedAt:now
  };
  let saved=false;
  let lastError=null;
  for(let attempt=0;attempt<3 && !saved;attempt++){
    try {
      await setDoc(doc(db,'vehicleTracking',vehicleId),payload,{merge:true});
      saved=true;
    } catch(e) {
      lastError=e;
      if(attempt<2) await new Promise(resolve=>setTimeout(resolve,800*(attempt+1)));
    }
  }
  if(!saved) throw lastError || new Error('Nie udało się zapisać pozycji GPS.');

  // Bieżąca pozycja jest źródłem prawdy dla podglądu live. Awaria zapisu
  // historii nie może blokować jej lokalnego cache ani kolejnych punktów.
  let last=null;
  try {
    const raw=await AsyncStorage.getItem(LOCATION_CURRENT_KEY);
    last=raw?JSON.parse(raw):null;
  } catch(e) {}

  const moved=last?distanceMeters(last,payload):Infinity;
  const lastHistoryAt=Number(last?.historyAt||0);
  const shouldStoreHistory=!last || moved>=80 || now-lastHistoryAt>=120000;
  payload.historyAt=shouldStoreHistory?now:lastHistoryAt;

  if (shouldStoreHistory) {
    try {
      await setDoc(doc(collection(db,'vehicleTracking',vehicleId,'locations')),payload);
    } catch(e) {
      console.log('LOCATION_HISTORY_WRITE_ERROR',e);
    }
  }

  await AsyncStorage.setItem(LOCATION_CURRENT_KEY,JSON.stringify(payload));
  // Retencją 7 dni zarządza backendowy cron. Klient nie wykonuje kosztownych
  // zapytań i deleteDoc przy każdym punkcie GPS.
}

// Serializujemy zapisy GPS, aby dwa punkty przychodzące jednocześnie nie
// odczytały tego samego LOCATION_CURRENT_KEY i nie ominęły progu historii.
function saveLocation(location) {
  const run = locationSaveQueue.then(() => saveLocationInternal(location));
  locationSaveQueue = run.catch(() => {});
  return run;
}

if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({data,error}) => {
    if (error || !data?.locations?.length) return;
    try { for (const location of data.locations) await saveLocation(location); }
    catch(e) { console.log('LOCATION_TASK_ERROR',e); }
  });
}

export async function saveVehicleLocationAssignment(registration,{allowCentralChange=false}={}) {
  const reg=String(registration||'').trim().toUpperCase();
  if(!reg) throw new Error('Brak numeru rejestracyjnego.');
  const vehicle=normalizeVehicleId(reg);
  const old=await getConfig();
  const central=await getCentralVehicleAssignment();
  if (!allowCentralChange && central.exists && central.vehicleId && central.vehicleId !== vehicle) {
    throw new Error(`Pojazd nie zgadza się z centralnym przypisaniem: ${central.vehicleId}`);
  }
  if (normalizeVehicleId(old.vehicleId||old.registration) !== vehicle) {
    try { await AsyncStorage.removeItem(LOCATION_CURRENT_KEY); } catch(e) {}
  }
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...old,enabled:old.enabled===true,vehicleId:vehicle,registration:reg}));
  return {ok:true,vehicleId:vehicle,registration:reg};
}

export async function startVehicleLocationTracking({vehicleId,registration}={}) {
  if (Platform.OS==='web') return {ok:false,reason:'web'};
  if (!FIREBASE_ENABLED || !db) return {ok:false,reason:'firebase'};

  // Centralne przypisanie pojazdu jest źródłem prawdy. Lokalna konfiguracja
  // może być nieaktualna po zmianie auta przez administratora.
  let centralVehicleId='';
  let centralRegistration='';
  try {
    const snap=await getDoc(doc(db,'locationConfig','main'));
    if (snap.exists()) {
      const data=snap.data()||{};
      const rawVehicleId=data.vehicleId||data.registration||'';
      centralVehicleId=rawVehicleId ? normalizeVehicleId(rawVehicleId) : '';
      centralRegistration=String(data.registration||data.vehicleId||'').trim().toUpperCase();
    }
  } catch(e) {
    return {ok:false,reason:'central-config',errorCode:e?.code||'unknown'};
  }

  const requestedRaw=vehicleId||registration||'';
  const requestedVehicle=requestedRaw ? normalizeVehicleId(requestedRaw) : '';
  const vehicle=centralVehicleId||requestedVehicle;
  if (!vehicle) return {ok:false,reason:'vehicle-assignment'};
  if (centralVehicleId && requestedVehicle && centralVehicleId!==requestedVehicle) {
    return {ok:false,reason:'vehicle-assignment-mismatch',expected:centralVehicleId,requested:requestedVehicle};
  }

  const old=await getConfig();
  const assignedRegistration=centralRegistration||String(registration||vehicle).trim().toUpperCase();
  const fg=await Location.requestForegroundPermissionsAsync();
  if (fg.status!=='granted') return {ok:false,reason:'foreground-permission'};
  const servicesEnabled=await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) return {ok:false,reason:'location-services-disabled'};
  const ownerUid=await waitForAuthenticatedUser();
  if (!ownerUid) return {ok:false,reason:'auth'};
  const bg=await Location.requestBackgroundPermissionsAsync();
  if (bg.status!=='granted') return {ok:false,reason:'background-permission'};
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...old,enabled:true,vehicleId:vehicle,registration:assignedRegistration}));
  const guard=await stopIfCentralAssignmentChanged({...old,enabled:true,vehicleId:vehicle,registration:assignedRegistration});
  if (!guard.ok) return {ok:false,reason:guard.reason,expected:guard.expected,actual:guard.actual};

  const running=await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (!running) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME,LOCATION_OPTIONS);
  }
  try {
    const first=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
    await saveLocation(first);
  } catch(e) {
    console.log('LOCATION_INITIAL_FIX_ERROR',e);
  }
  return {ok:true,vehicleId:vehicle,registration:assignedRegistration};
}

export async function stopVehicleLocationTracking() {
  try {
    if (Platform.OS!=='web' && await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch(e) {}
  const old=await getConfig();
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...old,enabled:false}));
  try { await AsyncStorage.removeItem(LOCATION_CURRENT_KEY); } catch(e) {}
}

export async function ensureVehicleLocationTracking() {
  if (Platform.OS==='web' || !FIREBASE_ENABLED || !db) return {ok:false,reason:'unsupported'};
  const cfg=await getConfig();
  if (cfg.enabled!==true || !(cfg.vehicleId||cfg.registration)) return {ok:false,reason:'disabled'};
  const guard=await stopIfCentralAssignmentChanged(cfg);
  if (!guard.ok) return {ok:false,reason:guard.reason,expected:guard.expected,actual:guard.actual};
  if (!(auth?.currentUser?.uid)) return {ok:false,reason:'auth'};
  const fg=await Location.getForegroundPermissionsAsync();
  const bg=await Location.getBackgroundPermissionsAsync();
  if (fg.status!=='granted' || bg.status!=='granted') return {ok:false,reason:'permission'};
  const servicesEnabled=await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) return {ok:false,reason:'location-services-disabled'};
  const running=await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (!running) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME,LOCATION_OPTIONS);
    try {
      const first=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
      await saveLocation(first);
    } catch(e) {
      console.log('LOCATION_WATCHDOG_FIX_ERROR',e);
    }
    return {ok:true,restarted:true,vehicleId:normalizeVehicleId(cfg.vehicleId||cfg.registration)};
  }
  // Po powrocie aplikacji na pierwszy plan odświeżamy punkt także wtedy,
  // gdy usługa nadal działa. Dzięki temu po dłuższym uśpieniu telefonu
  // podgląd szybciej odzyskuje świeżą pozycję.
  try {
    const first=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
    await saveLocation(first);
  } catch(e) {
    console.log('LOCATION_FOREGROUND_REFRESH_ERROR',e);
  }
  return {ok:true,restarted:false,vehicleId:normalizeVehicleId(cfg.vehicleId||cfg.registration)};
}

export async function getVehicleLocationConfig() {
  return getConfig();
}
