import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL=String(process.env.EXPO_PUBLIC_API_URL||'').replace(/\/$/,'');
export const API_TOKEN_KEY='grafik-pracy-api-token-v1';

async function token(){return AsyncStorage.getItem(API_TOKEN_KEY);}
export async function api(path,{method='GET',body,headers={}}={}){if(!API_BASE_URL)throw new Error('Brak EXPO_PUBLIC_API_URL. Aplikacja nie ma skonfigurowanego centralnego API.');const t=await token();const h={'Content-Type':'application/json',...headers};if(t)h.Authorization='Bearer '+t;const r=await fetch(API_BASE_URL+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});let data=null;try{data=await r.json();}catch{}if(!r.ok){const e=new Error(data?.error||'API_ERROR');e.status=r.status;e.code=data?.error;throw e;}return data;}
export async function apiLogin(email,password){const data=await api('/auth/login',{method:'POST',body:{email,password}});await AsyncStorage.setItem(API_TOKEN_KEY,data.token);return data.user;}
export async function apiLogout(){try{await api('/auth/logout',{method:'POST'});}finally{await AsyncStorage.removeItem(API_TOKEN_KEY);}}
export async function apiMe(){return (await api('/me')).user;}
export async function apiGetGps(){return (await api('/gps/vehicles')).vehicles;}
export async function apiGetMyGps(){return (await api('/gps/mine')).vehicle;}
export async function apiPostGps(payload,deviceToken){if(!API_BASE_URL)throw new Error('Brak centralnego API.');const r=await fetch(API_BASE_URL+'/gps',{method:'POST',headers:{'Content-Type':'application/json','X-Device-Token':deviceToken},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data?.error||'GPS_API_ERROR');return data;}

export const serverTimestamp=()=>new Date().toISOString();
export const deleteField=()=>({__apiDeleteField:true});
export const Timestamp={fromMillis(ms){return {toMillis:()=>Number(ms),toDate:()=>new Date(Number(ms))};}};
const ref=(kind,name,id=null)=>({kind,name,id});
export const collection=(_db,name)=>ref('collection',name);
export const doc=(_db,name,id)=>ref('doc',name,id);
export const where=(field,op,value)=>({type:'where',field,op,value});
export const orderBy=(field,direction='asc')=>({type:'orderBy',field,direction});
export const limit=n=>({type:'limit',value:n});
export const query=(base,...constraints)=>({...base,constraints});
const cleanDeletes=(obj)=>{if(!obj||typeof obj!=='object')return obj;const out={};for(const [k,v] of Object.entries(obj)){if(v&&v.__apiDeleteField)continue;out[k]=v&&typeof v==='object'&&!Array.isArray(v)?cleanDeletes(v):v;}return out;};
const pathFor=r=>r.kind==='doc'?'/store/'+encodeURIComponent(r.name)+'/'+encodeURIComponent(r.id):'/store/'+encodeURIComponent(r.name);
export async function getDoc(r){const raw=await api(pathFor(r));if(r.kind==='doc'){if(!raw.exists)return {exists:()=>false,data:()=>({}),id:r.id,metadata:{hasPendingWrites:false}};return {exists:()=>true,data:()=>raw.data||{},id:raw.id||r.id,metadata:{hasPendingWrites:false},updatedAt:raw.updatedAt,revision:raw.revision};}return raw;}
export async function setDoc(r,data,options={}){const body={payload:cleanDeletes(data)};if(Number.isInteger(options.expectedRevision)&&options.expectedRevision>0)body.expectedRevision=options.expectedRevision;return api(pathFor(r)+'?merge='+(options.merge!==false?'true':'false'),{method:'PUT',body});}
const updateQueues=new Map();

export function updateDoc(r,data){
  const queueKey=pathFor(r);
  const previous=updateQueues.get(queueKey)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
    const patch=Object.entries(data||{});
    let lastError=null;
    for(let attempt=0;attempt<4;attempt++){
      try{
        const current=await getDoc(r);
        const base=current.exists()?current.data():{};
        const next={...base};
        for(const [key,value] of patch){
          const parts=key.split('.');
          let target=next;
          for(let i=0;i<parts.length-1;i++){
            const p=parts[i];
            if(!target[p]||typeof target[p]!=='object'||Array.isArray(target[p]))target[p]={};
            target=target[p];
          }
          const leaf=parts[parts.length-1];
          if(value&&value.__apiDeleteField)delete target[leaf];
          else target[leaf]=cleanDeletes(value);
        }
        return await setDoc(r,next,{merge:false,expectedRevision:Number(current.revision)||undefined});
      }catch(e){
        lastError=e;
        if(e?.code!=='REVISION_CONFLICT' || attempt===3) throw e;
        await new Promise(resolve=>setTimeout(resolve,150*(attempt+1)));
      }
    }
    throw lastError||new Error('UPDATE_FAILED');
  });
  updateQueues.set(queueKey,task);
  task.finally(()=>{
    if(updateQueues.get(queueKey)===task)updateQueues.delete(queueKey);
  }).catch(()=>{});
  return task;
}
export async function addDoc(r,data){return api(pathFor(r),{method:'POST',body:{payload:cleanDeletes(data)}});}
export async function deleteDoc(r){return api(pathFor(r),{method:'DELETE'});}
export async function getDocs(qr){const constraints=qr.constraints||[],params=new URLSearchParams();const w=constraints.find(x=>x.type==='where');if(w&&w.op==='=='){params.set('whereField',w.field);params.set('whereValue',w.value);}const o=constraints.find(x=>x.type==='orderBy');if(o){params.set('orderField',o.field);params.set('orderDirection',o.direction);}const l=constraints.find(x=>x.type==='limit');if(l)params.set('limit',String(l.value));const suffix=params.toString()?'?'+params.toString():'';const d=await api(pathFor(qr)+suffix);return {docs:(d.docs||[]).map(x=>({id:x.id,data:()=>{const y={...x};delete y.id;delete y._revision;delete y._updatedAt;delete y._updatedBy;return y;},metadata:{hasPendingWrites:false},exists:()=>true}))};}
export function onSnapshot(target,options,callback,errorCallback){
  if(typeof options==='function'){errorCallback=callback;callback=options;options={};}
  let stopped=false,last='';
  const poll=async()=>{if(stopped)return;try{const snap=target.kind==='doc'?await getDoc(target):await getDocs(target);const key=JSON.stringify(snap);if(key!==last){last=key;callback(snap);}}catch(e){errorCallback?.(e);}};
  poll();const timer=setInterval(poll,4000);return()=>{stopped=true;clearInterval(timer);};
}
export async function runTransaction(_db,fn){const pending=[];const tx={get:getDoc,update:(r,d)=>{const p=updateDoc(r,d);pending.push(p);return p;},set:(r,d)=>{const p=setDoc(r,d);pending.push(p);return p;}};const result=await fn(tx);await Promise.all(pending);return result;}
