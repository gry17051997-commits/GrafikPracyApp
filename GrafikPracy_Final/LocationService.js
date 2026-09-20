import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import {Platform} from 'react-native';
import {collection, deleteDoc, doc, getDocs, limit, query, where, setDoc} from 'firebase/firestore';
import {db, FIREBASE_ENABLED} from './firebaseConfig';

export const LOCATION_TASK_NAME = 'grafik-pracy-vehicle-location-v1';
export const LOCATION_CONFIG_KEY = 'grafik-pracy-location-config-v1';
export const LOCATION_CURRENT_KEY = 'grafik-pracy-location-current-v1';

const safeVehicleId = value => String(value || 'SŁUŻBOWY').trim().toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]+/gi,'_').slice(0,40) || 'SLUZBOWY';

async function getConfig() {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function distanceMeters(a,b) {
  const R=6371000;
  const p1=a.latitude*Math.PI/180, p2=b.latitude*Math.PI/180;
  const dp=(b.latitude-a.latitude)*Math.PI/180, dl=(b.longitude-a.longitude)*Math.PI/180;
  const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

async function saveLocation(location) {
  if (!FIREBASE_ENABLED || !db || !location?.coords) return;
  const cfg=await getConfig();
  if (cfg.enabled===false) return;
  const vehicleId=safeVehicleId(cfg.vehicleId||cfg.registration);
  const c=location.coords;
  const now=Date.now();
  const payload={
    vehicleId,
    registration:cfg.registration||vehicleId,
    latitude:Number(c.latitude),
    longitude:Number(c.longitude),
    accuracy:Number(c.accuracy||0),
    altitude:Number(c.altitude||0),
    speed:Number.isFinite(c.speed)?Number(c.speed):null,
    heading:Number.isFinite(c.heading)?Number(c.heading):null,
    updatedAt:now
  };
  await setDoc(doc(db,'vehicleTracking',vehicleId),payload,{merge:true});
  let last=null;
  try {
    const raw=await AsyncStorage.getItem(LOCATION_CURRENT_KEY);
    last=raw?JSON.parse(raw):null;
  } catch(e) {}
  const moved=last?distanceMeters(last,payload):Infinity;
  const lastHistoryAt=Number(last?.historyAt||0);
  if (!last || moved>=80 || now-lastHistoryAt>=120000) {
    await setDoc(doc(collection(db,'vehicleTracking',vehicleId,'locations')),payload);
    payload.historyAt=now;
  } else {
    payload.historyAt=lastHistoryAt;
  }
  await AsyncStorage.setItem(LOCATION_CURRENT_KEY,JSON.stringify(payload));
  if (Math.random()<0.08) {
    try {
      const cutoff=Date.now()-7*24*60*60*1000;
      const old=await getDocs(query(collection(db,'vehicleTracking',vehicleId,'locations'),where('updatedAt','<',cutoff),limit(100)));
      await Promise.all(old.docs.map(d=>deleteDoc(d.ref)));
    } catch(e) {}
  }
}

if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({data,error}) => {
    if (error || !data?.locations?.length) return;
    try { for (const location of data.locations) await saveLocation(location); }
    catch(e) { console.log('LOCATION_TASK_ERROR',e); }
  });
}

export async function startVehicleLocationTracking({vehicleId,registration}={}) {
  if (Platform.OS==='web') return {ok:false,reason:'web'};
  if (!FIREBASE_ENABLED || !db) return {ok:false,reason:'firebase'};
  const vehicle=safeVehicleId(vehicleId||registration);
  const old=await getConfig();
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...old,enabled:true,vehicleId:vehicle,registration:registration||vehicle}));
  const fg=await Location.requestForegroundPermissionsAsync();
  if (fg.status!=='granted') return {ok:false,reason:'foreground-permission'};
  const bg=await Location.requestBackgroundPermissionsAsync();
  if (bg.status!=='granted') return {ok:false,reason:'background-permission'};
  const running=await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (!running) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME,{
      accuracy:Location.Accuracy.High,
      timeInterval:15000,
      distanceInterval:50,
      deferredUpdatesInterval:15000,
      deferredUpdatesDistance:50,
      pausesUpdatesAutomatically:false,
      showsBackgroundLocationIndicator:true,
      foregroundService:{
        notificationTitle:'Grafik Pracy • lokalizacja auta',
        notificationBody:'Udostępnianie lokalizacji służbowego telefonu jest aktywne.',
        notificationColor:'#467ff1'
      }
    });
  }
  return {ok:true,vehicleId:vehicle};
}

export async function stopVehicleLocationTracking() {
  try {
    if (Platform.OS!=='web' && await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch(e) {}
  const old=await getConfig();
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...old,enabled:false}));
}

export async function getVehicleLocationConfig() {
  return getConfig();
}
