import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import {Platform, AppState} from 'react-native';
import {API_BASE_URL, apiPostGps} from './apiClient';

export const LOCATION_TASK_NAME='grafik-pracy-vehicle-location-v2';
export const LOCATION_CONFIG_KEY='grafik-pracy-location-config-v2';
export const LOCATION_CURRENT_KEY='grafik-pracy-location-current-v2';
export const LOCATION_DEVICE_TOKEN_KEY='grafik-pracy-location-device-token-v1';
export const LOCATION_DIAGNOSTICS_KEY='grafik-pracy-location-diagnostics-v1';
export const LOCATION_PENDING_QUEUE_KEY='grafik-pracy-location-pending-queue-v1';
export const LOCATION_REJECTED_QUEUE_KEY='grafik-pracy-location-rejected-queue-v1';
const LOCATION_OPTIONS_VERSION=3;

export const normalizeVehicleId=value=>String(value||'').trim().toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]+/gi,'_').slice(0,40)||'SLUZBOWY';

const getConfig=async()=>{try{const raw=await AsyncStorage.getItem(LOCATION_CONFIG_KEY);return raw?JSON.parse(raw):{};}catch{return{};}};
export const getLocationDeviceToken=()=>AsyncStorage.getItem(LOCATION_DEVICE_TOKEN_KEY);
export const getLocationDiagnostics=async()=>{try{const raw=await AsyncStorage.getItem(LOCATION_DIAGNOSTICS_KEY);return raw?JSON.parse(raw):{};}catch{return{};}};
const patchDiagnostics=async patch=>{try{const old=await getLocationDiagnostics();await AsyncStorage.setItem(LOCATION_DIAGNOSTICS_KEY,JSON.stringify({...old,...patch}));}catch(error){console.log('LOCATION_DIAGNOSTICS_WRITE_ERROR',error?.message||error);}};
export const setLocationDeviceToken=async token=>{const value=String(token||'').trim();if(value)await AsyncStorage.setItem(LOCATION_DEVICE_TOKEN_KEY,value);else await AsyncStorage.removeItem(LOCATION_DEVICE_TOKEN_KEY);return value;};

const distanceMeters=(a,b)=>{if(!a||!b)return Infinity;const R=6371000,p1=a.latitude*Math.PI/180,p2=b.latitude*Math.PI/180,dp=(b.latitude-a.latitude)*Math.PI/180,dl=(b.longitude-a.longitude)*Math.PI/180,x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};

const getDeviceAssignment=async token=>{
  if(!API_BASE_URL||!token)throw new Error('GPS_DEVICE_CONFIGURATION_MISSING');
  let response;
  try{
    response=await fetch(API_BASE_URL+'/gps/device',{headers:{'X-Device-Token':token}});
  }catch(error){
    // Błąd sieci/API nie jest dowodem, że urządzenie utraciło przypisanie.
    // Nie wolno z jego powodu zatrzymywać działającego foreground service.
    throw new Error('GPS_ASSIGNMENT_NETWORK_ERROR: '+String(error?.message||error));
  }
  if(response.status===401||response.status===404)return null;
  if(!response.ok)throw new Error('GPS_ASSIGNMENT_HTTP_'+response.status);
  let assignment;
  try{assignment=await response.json();}catch{throw new Error('GPS_ASSIGNMENT_INVALID_RESPONSE');}
  if(!assignment?.vehicleId)return null;
  return assignment;
};

const LOCATION_OPTIONS={
  accuracy:Location.Accuracy.High,
  timeInterval:10000,
  distanceInterval:0,
  deferredUpdatesInterval:0,
  deferredUpdatesDistance:0,
  pausesUpdatesAutomatically:false,
  showsBackgroundLocationIndicator:true,
  foregroundService:{
    notificationTitle:'Grafik Pracy • GPS aktywny',
    notificationBody:'Lokalizacja auta jest udostępniana również przy zablokowanym ekranie.',
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
  let result=null,lastError=null;
  const readPendingQueue=async()=>{
    try{const raw=await AsyncStorage.getItem(LOCATION_PENDING_QUEUE_KEY);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed.filter(x=>x&&x.payload&&x.token).slice(0,500):[];}catch{return[];}
  };
  const writePendingQueue=async queue=>AsyncStorage.setItem(LOCATION_PENDING_QUEUE_KEY,JSON.stringify(queue.slice(0,500)));
  const appendRejected=async(item,error)=>{
    try{
      const raw=await AsyncStorage.getItem(LOCATION_REJECTED_QUEUE_KEY);
      const stored=raw?JSON.parse(raw):[];
      const rejected=Array.isArray(stored)?stored:[];
      rejected.push({payload:item.payload,token:item.token,rejectedAt:Date.now(),status:Number(error?.status)||null,code:String(error?.code||error?.message||'GPS_API_ERROR').slice(0,120)});
      await AsyncStorage.setItem(LOCATION_REJECTED_QUEUE_KEY,JSON.stringify(rejected.slice(-500)));
      await patchDiagnostics({rejectedGpsCount:Math.min(rejected.length,500),lastPermanentGpsError:String(error?.code||error?.message||'GPS_API_ERROR').slice(0,160),lastPermanentGpsErrorAt:Date.now()});
    }catch(storageError){
      // Jeśli nie uda się zachować odrzuconego pomiaru, nie usuwaj go z kolejki.
      throw storageError;
    }
  };
  const isPermanentGpsError=error=>Number.isInteger(error?.status)&&error.status>=400&&error.status<500&&error.status!==408&&error.status!==429;
  const uploadWithRetries=async({payload,token})=>{
    let failure=null;
    for(let attempt=0;attempt<3;attempt++){
      try{return {result:await apiPostGps(payload,token),error:null};}
      catch(error){
        failure=error;
        if(isPermanentGpsError(error))return {result:null,error,permanent:true};
        if(attempt<2)await new Promise(resolve=>setTimeout(resolve,750*(attempt+1)));
      }
    }
    return {result:null,error:failure,permanent:false};
  };

  // Najpierw próbujemy starsze pomiary. Błędy przejściowe zachowują FIFO,
  // natomiast odrzucone przez API pomiary trafiają do osobnej kolejki diagnostycznej,
  // aby pojedynczy 4xx (np. DEVICE_NOT_ASSIGNED) nie blokował nowych pozycji.
  let pending=await readPendingQueue();
  while(pending.length){
    const oldest=pending[0];
    const sent=await uploadWithRetries(oldest);
    if(!sent.result){
      lastError=sent.error;
      if(sent.permanent){
        await appendRejected(oldest,lastError);
        pending.shift();
        await writePendingQueue(pending);
        continue;
      }
      pending.push({payload,token:deviceToken});
      await writePendingQueue(pending);
      const message=String(lastError?.message||lastError||'unknown');
      await patchDiagnostics({lastUploadError:message.slice(0,240),lastUploadErrorAt:Date.now(),pendingGpsCount:pending.length});
      console.log('LOCATION_PENDING_QUEUE_RETRY_FAILED',message);
      return;
    }
    pending.shift();
    await writePendingQueue(pending);
  }
  const current=await uploadWithRetries({payload,token:deviceToken});
  result=current.result;
  lastError=current.error;
  if(!result){
    pending.push({payload,token:deviceToken});
    await writePendingQueue(pending);
    const message=String(lastError?.message||lastError||'unknown');
    await patchDiagnostics({lastUploadError:message.slice(0,240),lastUploadErrorAt:Date.now(),pendingGpsCount:pending.length});
    console.log('LOCATION_API_WRITE_ERROR_QUEUED',message);
    return;
  }
  await patchDiagnostics({pendingGpsCount:0});
  try{
    await patchDiagnostics({lastUploadAt:Date.now(),lastUploadError:null,lastUploadErrorAt:null});
    const assignedVehicleId=normalizeVehicleId(result.vehicleId||result.registration||cfg.vehicleId);
    const local={...payload,vehicleId:assignedVehicleId,registration:result.registration||cfg.registration||'',receivedAt:Date.now()};
    let previous=null;try{const raw=await AsyncStorage.getItem(LOCATION_CURRENT_KEY);previous=raw?JSON.parse(raw):null;}catch{}
    const moved=previous?distanceMeters(previous,payload):Infinity;
    const historyAt=Number(previous?.historyAt||0);
    local.historyAt=!previous||moved>=80||now-historyAt>=120000?now:historyAt;
    await AsyncStorage.setItem(LOCATION_CURRENT_KEY,JSON.stringify(local));
    await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...cfg,enabled:true,vehicleId:assignedVehicleId,registration:local.registration}));
  }catch(error){
    const message=String(error?.message||error||'unknown');
    await patchDiagnostics({lastUploadError:message.slice(0,240),lastUploadErrorAt:Date.now()});
    console.log('LOCATION_LOCAL_SAVE_ERROR',message);
  }
}
function saveLocation(location){const run=saveQueue.then(()=>saveLocationInternal(location));saveQueue=run.catch(()=>{});return run;}

// Background tasks are native-only. Avoid calling TaskManager APIs in web builds.
if(Platform.OS!=='web'&&!TaskManager.isTaskDefined(LOCATION_TASK_NAME)){
  TaskManager.defineTask(LOCATION_TASK_NAME,async({data,error})=>{
    if(error){
      await patchDiagnostics({lastTaskError:String(error.message||error).slice(0,240),lastTaskErrorAt:Date.now()});
      return;
    }
    if(!data?.locations?.length)return;
    for(const location of data.locations){
      const coords=location?.coords||{};
      await patchDiagnostics({lastTaskAt:Date.now(),lastTaskError:null,lastTaskErrorAt:null,lastLocalLatitude:Number(coords.latitude)||null,lastLocalLongitude:Number(coords.longitude)||null,lastLocalObservedAt:Number(location.timestamp)||Date.now()});
      await saveLocation(location);
    }
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
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...old,enabled:true,optionsVersion:LOCATION_OPTIONS_VERSION,vehicleId:normalizeVehicleId(assignment.vehicleId),registration:assignment.registration||registration||''}));
  const alreadyRunning=await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if(alreadyRunning && old.optionsVersion!==LOCATION_OPTIONS_VERSION){
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  if(!alreadyRunning || old.optionsVersion!==LOCATION_OPTIONS_VERSION){
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME,LOCATION_OPTIONS);
  }
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
  // Funkcja może być wywołana przy wznowieniu aplikacji. Nie zatrzymuj ani nie
  // uznawaj działającego nadajnika za wyłączony tylko dlatego, że ekran był zablokowany.
  const cfg=await getConfig();
  if(cfg.enabled!==true)return {ok:false,reason:'disabled'};
  const token=await getLocationDeviceToken();
  if(!token)return {ok:false,reason:'device-token-missing'};
  const assignment=await getDeviceAssignment(token);
  if(!assignment?.vehicleId){await stopVehicleLocationTracking();return {ok:false,reason:'device-not-assigned'};}
  const fg=await Location.getForegroundPermissionsAsync(),bg=await Location.getBackgroundPermissionsAsync();
  if(fg.status!=='granted'||bg.status!=='granted')return {ok:false,reason:'permission'};
  if(!(await Location.hasServicesEnabledAsync()))return {ok:false,reason:'location-services-disabled'};
  let running=await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  let restarted=false;
  if(running && Number(cfg.optionsVersion||0)!==LOCATION_OPTIONS_VERSION){
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    running=false;
  }
  if(!running){
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME,LOCATION_OPTIONS);
    restarted=true;
  }
  if(!running || Number(cfg.optionsVersion||0)!==LOCATION_OPTIONS_VERSION){
    await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...cfg,enabled:true,optionsVersion:LOCATION_OPTIONS_VERSION,vehicleId:normalizeVehicleId(assignment.vehicleId),registration:assignment.registration||cfg.registration||''}));
  }
  try{await saveLocation(await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High}));}catch(e){console.log('LOCATION_REFRESH_ERROR',e);}
  return {ok:true,restarted,vehicleId:assignment.vehicleId,registration:assignment.registration||''};
}

export async function getVehicleLocationConfig(){
  const cfg=await getConfig();
  const token=await getLocationDeviceToken();
  if(token&&API_BASE_URL){try{const assignment=await getDeviceAssignment(token);if(assignment)return {...cfg,vehicleId:normalizeVehicleId(assignment.vehicleId),registration:assignment.registration||'',enabled:cfg.enabled===true};}catch{}}
  return cfg;
}
