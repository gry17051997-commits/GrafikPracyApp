import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import {Platform, AppState} from 'react-native';
import {API_BASE_URL, apiPostGps} from './apiClient';

export const LOCATION_TASK_NAME='grafik-pracy-vehicle-location-v2';
export const LOCATION_CONFIG_KEY='grafik-pracy-location-config-v2';
export const LOCATION_CURRENT_KEY='grafik-pracy-location-current-v2';
export const LOCATION_DEVICE_TOKEN_KEY='grafik-pracy-location-device-token-v1';

export const normalizeVehicleId=value=>String(value||'').trim().toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]+/gi,'_').slice(0,40)||'SLUZBOWY';

const getConfig=async()=>{try{const raw=await AsyncStorage.getItem(LOCATION_CONFIG_KEY);return raw?JSON.parse(raw):{};}catch{return{};}};
export const getLocationDeviceToken=()=>AsyncStorage.getItem(LOCATION_DEVICE_TOKEN_KEY);
export const setLocationDeviceToken=async token=>{const value=String(token||'').trim();if(value)await AsyncStorage.setItem(LOCATION_DEVICE_TOKEN_KEY,value);else await AsyncStorage.removeItem(LOCATION_DEVICE_TOKEN_KEY);return value;};

const distanceMeters=(a,b)=>{if(!a||!b)return Infinity;const R=6371000,p1=a.latitude*Math.PI/180,p2=b.latitude*Math.PI/180,dp=(b.latitude-a.latitude)*Math.PI/180,dl=(b.longitude-a.longitude)*Math.PI/180,x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};

const getDeviceAssignment=async token=>{
  if(!API_BASE_URL||!token)return null;
  const r=await fetch(API_BASE_URL+'/gps/device',{headers:{'X-Device-Token':token}});
  if(!r.ok)return null;
  return r.json();
};

const LOCATION_OPTIONS={
  accuracy:Location.Accuracy.High,
  timeInterval:15000,
  distanceInterval:25,
  pausesUpdatesAutomatically:false,
  showsBackgroundLocationIndicator:true,
  foregroundService:{
    notificationTitle:'Grafik Pracy • lokalizacja auta',
    notificationBody:'Udostępnianie lokalizacji służbowego telefonu jest aktywne.',
    notificationColor:'#467ff1',
    killServiceOnDestroy:false
  }
};

let saveQueue=Promise.resolve();
async function saveLocationInternal(location){
  if(!location?.coords||!API_BASE_URL)return;
  const cfg=await getConfig();
  if(cfg.enabled!==true)return;
  const deviceToken=await getLocationDeviceToken();
  if(!deviceToken)return;
  const c=location.coords,now=Date.now();
  const payload={
    latitude:Number(c.latitude),
    longitude:Number(c.longitude),
    accuracy:Number(c.accuracy||0),
    altitude:Number(c.altitude||0),
    speed:Number.isFinite(c.speed)?Number(c.speed):null,
    heading:Number.isFinite(c.heading)?Number(c.heading):null,
    observedAt:Number(location.timestamp||now)
  };
  try{
    const result=await apiPostGps(payload,deviceToken);
    const assignedVehicleId=normalizeVehicleId(result.vehicleId||result.registration||cfg.vehicleId);
    const local={...payload,vehicleId:assignedVehicleId,registration:result.registration||cfg.registration||'',receivedAt:now};
    let previous=null;try{const raw=await AsyncStorage.getItem(LOCATION_CURRENT_KEY);previous=raw?JSON.parse(raw):null;}catch{}
    const moved=previous?distanceMeters(previous,payload):Infinity;
    const historyAt=Number(previous?.historyAt||0);
    local.historyAt=!previous||moved>=80||now-historyAt>=120000?now:historyAt;
    await AsyncStorage.setItem(LOCATION_CURRENT_KEY,JSON.stringify(local));
    await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...cfg,enabled:true,vehicleId:assignedVehicleId,registration:local.registration}));
  }catch(error){console.log('LOCATION_API_WRITE_ERROR',error?.message||error);}
}
function saveLocation(location){const run=saveQueue.then(()=>saveLocationInternal(location));saveQueue=run.catch(()=>{});return run;}

if(!TaskManager.isTaskDefined(LOCATION_TASK_NAME)){
  TaskManager.defineTask(LOCATION_TASK_NAME,async({data,error})=>{
    if(error||!data?.locations?.length)return;
    for(const location of data.locations)await saveLocation(location);
  });
}

export async function saveVehicleLocationAssignment(registration){
  const reg=String(registration||'').trim().toUpperCase();
  if(!reg)throw new Error('Brak numeru rejestracyjnego.');
  const old=await getConfig();
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...old,vehicleId:normalizeVehicleId(reg),registration:reg}));
  return {ok:true,vehicleId:normalizeVehicleId(reg),registration:reg};
}

export async function startVehicleLocationTracking({vehicleId,registration}={}){
  if(Platform.OS==='web')return {ok:false,reason:'web'};
  if(AppState.currentState!=='active')return {ok:false,reason:'app-not-active'};
  if(!API_BASE_URL)return {ok:false,reason:'api-not-configured'};
  const token=await getLocationDeviceToken();
  if(!token)return {ok:false,reason:'device-token-missing'};
  const assignment=await getDeviceAssignment(token);
  if(!assignment?.vehicleId)return {ok:false,reason:'device-not-assigned'};
  // Centralne przypisanie z API jest jedynym źródłem prawdy.
  // Lokalnie zapisany numer auta może być nieaktualny po zmianie przypisania
  // przez administratora, dlatego nie blokujemy startu GPS porównaniem z cache.
  const fg=await Location.requestForegroundPermissionsAsync();
  if(fg.status!=='granted')return {ok:false,reason:'foreground-permission'};
  if(!(await Location.hasServicesEnabledAsync()))return {ok:false,reason:'location-services-disabled'};
  const bg=await Location.requestBackgroundPermissionsAsync();
  if(bg.status!=='granted')return {ok:false,reason:'background-permission'};
  const old=await getConfig();
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...old,enabled:true,vehicleId:normalizeVehicleId(assignment.vehicleId),registration:assignment.registration||registration||''}));
  if(!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)))await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME,LOCATION_OPTIONS);
  try{await saveLocation(await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Highest,mayShowUserSettingsDialog:true}));}catch(e){console.log('LOCATION_INITIAL_FIX_ERROR',e);}
  return {ok:true,vehicleId:assignment.vehicleId,registration:assignment.registration||''};
}

export async function stopVehicleLocationTracking(){
  if(Platform.OS!=='web'&&await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME))await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  const old=await getConfig();
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...old,enabled:false}));
  await AsyncStorage.removeItem(LOCATION_CURRENT_KEY);
}

export async function ensureVehicleLocationTracking(){
  if(Platform.OS==='web'||!API_BASE_URL)return {ok:false,reason:'unsupported'};
  if(AppState.currentState!=='active')return {ok:false,reason:'app-not-active'};
  const cfg=await getConfig();
  if(cfg.enabled!==true)return {ok:false,reason:'disabled'};
  const token=await getLocationDeviceToken();
  if(!token)return {ok:false,reason:'device-token-missing'};
  const assignment=await getDeviceAssignment(token);
  if(!assignment?.vehicleId){await stopVehicleLocationTracking();return {ok:false,reason:'device-not-assigned'};}
  const fg=await Location.getForegroundPermissionsAsync(),bg=await Location.getBackgroundPermissionsAsync();
  if(fg.status!=='granted'||bg.status!=='granted')return {ok:false,reason:'permission'};
  if(!(await Location.hasServicesEnabledAsync()))return {ok:false,reason:'location-services-disabled'};
  const running=await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if(!running)await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME,LOCATION_OPTIONS);
  try{await saveLocation(await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High}));}catch(e){console.log('LOCATION_REFRESH_ERROR',e);}
  return {ok:true,restarted:!running,vehicleId:assignment.vehicleId,registration:assignment.registration||''};
}

export async function getVehicleLocationConfig(){
  const cfg=await getConfig();
  const token=await getLocationDeviceToken();
  if(token&&API_BASE_URL){try{const assignment=await getDeviceAssignment(token);if(assignment)return {...cfg,vehicleId:normalizeVehicleId(assignment.vehicleId),registration:assignment.registration||'',enabled:cfg.enabled===true};}catch{}}
  return cfg;
}
