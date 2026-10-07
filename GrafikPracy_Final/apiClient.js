import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL=String(process.env.EXPO_PUBLIC_API_URL||'').replace(/\\/$/,'');
export const API_TOKEN_KEY='grafik-pracy-api-token-v1';

async function token(){return AsyncStorage.getItem(API_TOKEN_KEY);}
export async function api(path,{method='GET',body,headers={}}={}){if(!API_BASE_URL)throw new Error('Brak EXPO_PUBLIC_API_URL. Aplikacja nie ma skonfigurowanego centralnego API.');const t=await token();const h={'Content-Type':'application/json',...headers};if(t)h.Authorization='Bearer '+t;const r=await fetch(API_BASE_URL+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});let data=null;try{data=await r.json();}catch{}if(!r.ok){const e=new Error(data?.error||'API_ERROR');e.status=r.status;e.code=data?.error;throw e;}return data;}
export async function apiLogin(email,password){const data=await api('/auth/login',{method:'POST',body:{email,password}});await AsyncStorage.setItem(API_TOKEN_KEY,data.token);return data.user;}
export async function apiLogout(){try{await api('/auth/logout',{method:'POST'});}finally{await AsyncStorage.removeItem(API_TOKEN_KEY);}}
export async function apiMe(){return (await api('/me')).user;}
export async function apiGetGps(){return (await api('/gps/vehicles')).vehicles;}
export async function apiPostGps(payload,deviceToken){if(!API_BASE_URL)throw new Error('Brak centralnego API.');const r=await fetch(API_BASE_URL+'/gps',{method:'POST',headers:{'Content-Type':'application/json','X-Device-Token':deviceToken},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data?.error||'GPS_API_ERROR');return data;}
