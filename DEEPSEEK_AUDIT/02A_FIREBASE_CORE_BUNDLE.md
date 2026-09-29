# DeepSeek Audit Bundle 2A/3


===== FILE: GrafikPracy_Final/widget-task-handler.js =====

```text
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {GrafikTerazWidget,GrafikAutoWidget,GrafikRaportWidget} from './widgets';

const KEY='grafik-pracy-v5';
const LOCATION_CONFIG_KEY='grafik-pracy-location-config-v1';
const LOCATION_CURRENT_KEY='grafik-pracy-location-current-v1';
const PEOPLE={P:'Paweł',M:'Mateusz',L:'Łukasz'};

function monday(d){const x=new Date(d);const n=x.getDay();x.setDate(x.getDate()+(n===0?-6:1-n));x.setHours(0,0,0,0);return x;}
function pad(n){return String(n).padStart(2,'0');}
function parseClock(v){const a=String(v||'00:00').split(':').map(Number);return (a[0]||0)*60+(a[1]||0);}
function timestampMs(v){if(!v)return 0;if(typeof v==='number')return v;if(typeof v==='string'){const n=Date.parse(v);return Number.isFinite(n)?n:0;}if(typeof v==='object'&&Number.isFinite(Number(v.seconds)))return Number(v.seconds)*1000+Math.floor(Number(v.nanoseconds||0)/1e6);return 0;}
function durationText(mins){mins=Math.max(0,Math.round(mins));const h=Math.floor(mins/60),m=mins%60;return h?(m?h+' h '+m+' min':h+' h'):m+' min';}
function shiftDate(dayIndex,shift,times){const d=monday(new Date());d.setDate(d.getDate()+dayIndex);const t=times?.[shift===1?'s1':'s2']||(shift===1?'06:00':'18:00');const e=times?.[shift===1?'e1':'e2']||(shift===1?'18:00':'06:00');const sm=parseClock(t),em=parseClock(e);const start=new Date(d);start.setHours(Math.floor(sm/60),sm%60,0,0);const finish=new Date(d);finish.setHours(Math.floor(em/60),em%60,0,0);if(em<=sm)finish.setDate(finish.getDate()+1);return {start,finish};}
function getNowData(data){const now=new Date(),base=monday(now),key=base.getFullYear()+'-'+pad(base.getMonth()+1)+'-'+pad(base.getDate()),cfg=data?.weekConfigs?.[key]||{},week=Array.isArray(data?.weeks?.[key])?data.weeks[key]:[];const c=[];for(let day=0;day<7;day++){const shifts=week?.[day]?.shifts||[];for(let i=1;i<=2;i++){const s=shifts[i-1];if(!s?.person)continue;const weekTimes=cfg.times||data?.times?.[cfg.hours||data?.hours]||data?.times||{};const z=shiftDate(day,i,weekTimes);c.push({s,start:z.start,finish:z.finish});}}const active=c.find(x=>now>=x.start&&now<x.finish);if(active)return {person:PEOPLE[active.s.person]||active.s.person,warehouse:active.s.warehouse||data?.warehouse||'',time:pad(active.start.getHours())+':'+pad(active.start.getMinutes())+'–'+pad(active.finish.getHours())+':'+pad(active.finish.getMinutes()),remaining:durationText((active.finish-now)/60000)};const next=c.filter(x=>x.start>now).sort((a,b)=>a.start-b.start)[0];if(next)return {person:'Następnie: '+(PEOPLE[next.s.person]||next.s.person),warehouse:next.s.warehouse||data?.warehouse||'',time:pad(next.start.getHours())+':'+pad(next.start.getMinutes()),remaining:'za '+durationText((next.start-now)/60000)};return {person:'Brak aktywnej zmiany',warehouse:'',time:'',remaining:''};}
function parseReportDuration(value){const s=String(value||'').toLowerCase();const h=s.match(/(\d+)\s*h/),m=s.match(/(\d+)\s*min/);return (h?Number(h[1])*60:0)+(m?Number(m[1]):0);}
function getReportData(data){const list=Array.isArray(data?.reportHistory)?data.reportHistory:[];const last=list.filter(x=>x?.createdAt&&(!x.person||x.person===data?.myPerson)).sort((a,b)=>timestampMs(b.createdAt)-timestampMs(a.createdAt))[0];if(!last)return {};const created=timestampMs(last.createdAt);const base=Number(last.durationMinutes)||parseReportDuration(last.duration);const total=base+Math.max(0,(Date.now()-created)/60000);return {status:last.status||'Raport',detail:[last.warehouse,last.ramp?'R'+last.ramp:null].filter(Boolean).join(' · '),duration:total>0?durationText(total):'',time:created?new Date(created).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}):''};}
async function readJson(key,fallback){try{const raw=await AsyncStorage.getItem(key);return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
export async function buildWidgetData(){const data=await readJson(KEY,{}),loc=await readJson(LOCATION_CONFIG_KEY,{}),cur=await readJson(LOCATION_CURRENT_KEY,{});const enabled=loc?.enabled!==false&&!!loc?.vehicleId;const sameVehicle=enabled&&cur?.vehicleId===loc?.vehicleId;const age=sameVehicle&&cur?.updatedAt?Math.round((Date.now()-Number(cur.updatedAt))/60000):null;const auto={status:enabled?(sameVehicle?(age!=null&&age>10?'⚠️ Stary sygnał':'🟢 GPS aktywny'):'🟠 Oczekiwanie na GPS nowego auta'):'GPS wyłączony',vehicle:loc?.registration||data?.vehicleRegistration||'',detail:enabled&&sameVehicle&&cur?.latitude!=null?(Number(cur.latitude).toFixed(5)+', '+Number(cur.longitude).toFixed(5)):(enabled?'Oczekiwanie na lokalizację':'Włącz nadajnik w aplikacji.'),updated:age!=null?'aktualizacja: '+age+' min temu':''};return {now:getNowData(data),auto,report:getReportData(data)};}
const map={GrafikTeraz:GrafikTerazWidget,GrafikAuto:GrafikAutoWidget,GrafikRaport:GrafikRaportWidget};
export async function widgetTaskHandler(props){const Widget=map[props?.widgetInfo?.widgetName];if(!Widget)return;if(props.widgetAction==='WIDGET_DELETED')return;const data=await buildWidgetData();const key=props.widgetInfo.widgetName==='GrafikTeraz'?'now':props.widgetInfo.widgetName==='GrafikAuto'?'auto':'report';props.renderWidget(<Widget data={data[key]}/>);}

```

===== FILE: GrafikPracy_Final/scheduleEngine.js =====

```text
function canAssignPersonToDay(dayShifts, person, allow24h) {
  if (allow24h) return true;
  return !(Array.isArray(dayShifts) && dayShifts.some(shift => shift?.person === person));
}

function buildWeekDocument(weekId, week, config) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekId))) {
    throw new Error('Invalid weekId');
  }
  return {
    weekId: String(weekId),
    week: Array.isArray(week) ? week : [],
    config: config && typeof config === 'object' ? config : {}
  };
}

function serverTimestampMillis(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return 0;
}

function addHourEpoch(timestampMs) {
  return Number(timestampMs) + 3600000;
}

module.exports = {
  canAssignPersonToDay,
  buildWeekDocument,
  serverTimestampMillis,
  addHourEpoch
};

```

===== FILE: GrafikPracy_Final/firebaseConfig.js =====

```text
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

export const firebaseConfig = {
  apiKey: 'AIzaSyCFmVaMVtLo7oGZxj3JCMnrWWum4FT5ZsY',
  authDomain: 'grafik-pracy-c9006.firebaseapp.com',
  projectId: 'grafik-pracy-c9006',
  storageBucket: 'grafik-pracy-c9006.firebasestorage.app',
  messagingSenderId: '977408978130',
  appId: '1:977408978130:web:c7f7ef7f9359515d32d10b',
  measurementId: 'G-JDY7G3KVRE'
};

export const FIREBASE_ENABLED = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId
);

export const firebaseApp = FIREBASE_ENABLED
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

export const auth = firebaseApp
  ? (() => {
      try {
        return initializeAuth(firebaseApp, { persistence: getReactNativePersistence(AsyncStorage) });
      } catch (e) {
        return getAuth(firebaseApp);
      }
    })()
  : null;

export const db = firebaseApp ? getFirestore(firebaseApp) : null;

export const functions = firebaseApp ? getFunctions(firebaseApp,'us-central1') : null;

```

===== FILE: GrafikPracy_Final/firestore.rules =====

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function activeUser() {
      return signedIn()
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('disabled', false) == false;
    }

    function isAdmin() {
      return activeUser()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    function validRole(value) {
      return value == 'admin' || value == 'employee' || value == 'locator';
    }

    function validPersonKey(value) {
      return value == '' || value == 'P' || value == 'M' || value == 'L';
    }

    function validRolePerson(role, personKey) {
      return (role == 'employee' && (personKey == 'P' || personKey == 'M' || personKey == 'L'))
        || (role != 'employee' && personKey == '');
    }

    function locationConfig() {
      return exists(/databases/$(database)/documents/locationConfig/main)
        ? get(/databases/$(database)/documents/locationConfig/main).data
        : {};
    }

    match /users/{uid} {
      allow read: if signedIn() && (request.auth.uid == uid || isAdmin());

      allow create: if (
        signedIn()
        && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['email','role','createdAt'])
        && request.resource.data.role == 'employee'
        && request.resource.data.email is string
      ) || (
        isAdmin()
        && uid == request.resource.data.uid
        && request.resource.data.keys().hasOnly([
          'uid','email','displayName','personKey','role',
          'disabled','createdAt','updatedAt','createdBy'
        ])
        && request.resource.data.email is string
        && request.resource.data.displayName is string
        && request.resource.data.role in ['admin','employee','locator']
        && request.resource.data.personKey in ['', 'P', 'M', 'L']
        && validRolePerson(request.resource.data.role, request.resource.data.personKey)
        && request.resource.data.disabled == false
        && request.resource.data.createdBy == request.auth.uid
      );

      allow update: if isAdmin()
        && uid != request.auth.uid
        && request.resource.data.uid == uid
        && request.resource.data.email is string
        && request.resource.data.displayName is string
        && request.resource.data.role in ['admin','employee','locator']
        && request.resource.data.personKey in ['', 'P', 'M', 'L']
        && validRolePerson(request.resource.data.role, request.resource.data.personKey)
        && request.resource.data.disabled is bool
        || (
          isAdmin()
          && uid != request.auth.uid
          && request.resource.data.get('disabled', false) == true
          && request.resource.data.get('uid', uid) == uid
        );

      allow delete: if false;
    }

    // Legacy monolithic schedule is retained read-only for administrators during migration.
    // New clients must use schedules/{weekId}.
    match /schedules/main {
      allow read: if isAdmin();
      allow write: if false;
    }

    match /schedules/{weekId} {
      allow read: if activeUser() && weekId != 'main';
      allow create, update: if isAdmin()
        && weekId != 'main'
        && request.resource.data.weekId == weekId;
      allow delete: if isAdmin() && weekId != 'main';
    }

    match /settings/main {
      allow read: if activeUser();
      allow write: if isAdmin();
    }

    match /proposals/{proposalId} {
      allow read: if isAdmin() || (signedIn() && resource.data.fromUid == request.auth.uid);
      allow create: if signedIn()
        && request.resource.data.fromUid == request.auth.uid
        && request.resource.data.status == 'pending'
        && (isAdmin()
          || (exists(/databases/$(database)/documents/users/$(request.auth.uid))
            && request.resource.data.fromPerson == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.personKey));
      allow update: if isAdmin();
      allow delete: if false;
    }

    match /chatMessages/{messageId} {
      allow read: if activeUser();
      allow create: if activeUser()
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.text is string
        && request.resource.data.text.size() > 0
        && request.resource.data.text.size() <= 500;
      allow update, delete: if isAdmin();
    }

    match /whatsappReports/{reportId} {
      allow read: if isAdmin() || (activeUser() && resource.data.uid == request.auth.uid);
      allow create: if activeUser()
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.text is string
        && request.resource.data.text.size() > 0
        && request.resource.data.text.size() <= 500;
      allow update, delete: if isAdmin();
    }

    match /locationConfig/main {
      allow read: if activeUser();
      allow write: if isAdmin();
    }

    match /vehicleTracking/{vehicleId} {
      function locCfg() {
        return exists(/databases/$(database)/documents/locationConfig/main)
          ? get(/databases/$(database)/documents/locationConfig/main).data
          : {};
      }
      allow read: if isAdmin()
        || (activeUser()
          && (locationConfig().get('vehicleId', '') == vehicleId
            || locationConfig().get('registration', '') == resource.data.get('registration', '')
            || resource.data.get('ownerUid', '') == request.auth.uid));

      // W projekcie działa jeden wspólny nadajnik pojazdu. Jego identyfikator
      // jest ustalany przez administratora w locationConfig/main. Pracownik
      // nie może utworzyć dokumentu pod innym vehicleId tylko przez zmianę
      // lokalnej konfiguracji telefonu.
      allow create: if isAdmin()
        || (activeUser()
          && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'locator'
          && locationConfig().get('vehicleId', '') == vehicleId
          && request.resource.data.vehicleId == vehicleId
          && request.resource.data.ownerUid == request.auth.uid
          && request.resource.data.latitude is number
          && request.resource.data.longitude is number
          && request.resource.data.latitude >= -90
          && request.resource.data.latitude <= 90
          && request.resource.data.longitude >= -180
          && request.resource.data.longitude <= 180);

      allow update: if isAdmin()
        || (activeUser()
          && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'locator'
          && locCfg().get('vehicleId', '') == vehicleId
          && resource.data.ownerUid == request.auth.uid
          && request.resource.data.vehicleId == vehicleId
          && request.resource.data.ownerUid == resource.data.ownerUid
          && request.resource.data.latitude is number
          && request.resource.data.longitude is number
          && request.resource.data.latitude >= -90
          && request.resource.data.latitude <= 90
          && request.resource.data.longitude >= -180
          && request.resource.data.longitude <= 180);

      allow delete: if isAdmin();

      match /locations/{locationId} {
        allow read: if isAdmin()
          || (activeUser()
            && (locationConfig().get('vehicleId', '') == vehicleId
              || locationConfig().get('registration', '') == resource.data.get('registration', '')
              || resource.data.get('ownerUid', '') == request.auth.uid));

        allow create: if isAdmin()
          || (activeUser()
            && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'locator'
            && get(/databases/$(database)/documents/locationConfig/main).data.vehicleId == vehicleId
            && request.resource.data.vehicleId == vehicleId
            && request.resource.data.ownerUid == request.auth.uid
            && request.resource.data.latitude is number
            && request.resource.data.longitude is number
            && request.resource.data.latitude >= -90
            && request.resource.data.latitude <= 90
            && request.resource.data.longitude >= -180
            && request.resource.data.longitude <= 180);

        allow update: if isAdmin()
          || (activeUser()
            && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'locator'
            && get(/databases/$(database)/documents/locationConfig/main).data.vehicleId == vehicleId
            && resource.data.ownerUid == request.auth.uid
            && request.resource.data.vehicleId == vehicleId
            && request.resource.data.ownerUid == resource.data.ownerUid
            && request.resource.data.latitude is number
            && request.resource.data.longitude is number
            && request.resource.data.latitude >= -90
            && request.resource.data.latitude <= 90
            && request.resource.data.longitude >= -180
            && request.resource.data.longitude <= 180);

        allow delete: if isAdmin();
      }
    }

    match /audit/{entryId} {
      allow read: if isAdmin();
      allow create, update, delete: if false;
    }
  }
}
```

===== FILE: GrafikPracy_Final/functions/index.js =====

```text
const {onCall,HttpsError} = require('firebase-functions/v2/https');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore} = require('firebase-admin/firestore');

initializeApp();

const VALID_ROLES = new Set(['admin','employee','locator']);
const VALID_PERSON_KEYS = new Set(['P','M','L']);

function requireAdmin(request, callerSnap) {
  if (!request.auth) throw new HttpsError('unauthenticated','Musisz być zalogowany.');
  if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied','Tylko administrator może wykonywać tę operację.');
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateDisplayName(value) {
  return value.length >= 2 && value.length <= 100;
}

function validatePersonKey(value) {
  return value === '' || VALID_PERSON_KEYS.has(value);
}

function validateRole(value) {
  return VALID_ROLES.has(value);
}

async function writeAudit(db,entry,action) {
  try {
    await db.collection('audit').add(entry);
  } catch (error) {
    console.error(action+' audit error', error);
  }
}

exports.deleteUserAccount = onCall({region:'us-central1'}, async request => {
  const db = getFirestore();
  const auth = getAuth();
  if (!request.auth) throw new HttpsError('unauthenticated','Musisz być zalogowany.');

  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  requireAdmin(request, callerSnap);

  const uid = String(request.data?.uid || '').trim();
  if (!uid) throw new HttpsError('invalid-argument','Brak identyfikatora użytkownika.');
  if (uid === request.auth.uid) {
    throw new HttpsError('failed-precondition','Administrator nie może usunąć własnego konta.');
  }

  const targetRef = db.collection('users').doc(uid);
  const targetSnap = await targetRef.get();

  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') {
      console.error('deleteUserAccount auth error', error);
      throw new HttpsError('internal','Nie udało się usunąć konta logowania.');
    }
  }

  try {
    if (targetSnap.exists) await targetRef.delete();
  } catch (error) {
    console.error('deleteUserAccount firestore cleanup error', error);
    throw new HttpsError(
      'internal',
      'Konto logowania zostało usunięte, ale nie udało się usunąć profilu. Powtórz operację lub usuń profil ręcznie.'
    );
  }

  await writeAudit(db,{action:'delete-user',targetUid:uid,actorUid:request.auth.uid,createdAt:new Date()},'deleteUserAccount');

  return {ok:true,uid};
});

exports.createUserAccount = onCall({region:'us-central1'}, async request => {
  const db = getFirestore();
  const auth = getAuth();
  if (!request.auth) throw new HttpsError('unauthenticated','Musisz być zalogowany.');

  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  requireAdmin(request, callerSnap);

  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const email = normalizeEmail(data.email);
  const password = String(data.password || '');
  const displayName = String(data.displayName || '').trim();
  const personKey = String(data.personKey || '').trim();
  const role = String(data.role || '').trim();

  if (!validateEmail(email)) throw new HttpsError('invalid-argument','Podaj prawidłowy e-mail.');
  if (password.length < 6 || password.length > 128) {
    throw new HttpsError('invalid-argument','Hasło musi mieć od 6 do 128 znaków.');
  }
  if (!validateDisplayName(displayName)) {
    throw new HttpsError('invalid-argument','Imię i nazwisko musi mieć od 2 do 100 znaków.');
  }
  if (!validatePersonKey(personKey)) {
    throw new HttpsError('invalid-argument','Nieprawidłowy identyfikator pracownika.');
  }
  if (!validateRole(role)) {
    throw new HttpsError('invalid-argument','Nieprawidłowa rola użytkownika.');
  }

  if (personKey) {
    const existing = await db.collection('users').where('personKey','==',personKey).limit(1).get();
    if (!existing.empty) throw new HttpsError('already-exists','Ten identyfikator pracownika jest już przypisany do innego konta.');
  }

  let user;
  try {
    user = await auth.createUser({email,password,displayName});
  } catch (error) {
    if (error?.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists','Konto z tym adresem e-mail już istnieje.');
    }
    if (error?.code === 'auth/invalid-password') {
      throw new HttpsError('invalid-argument','Hasło nie spełnia wymagań Firebase Authentication.');
    }
    console.error('createUserAccount auth error', error);
    throw new HttpsError('internal','Nie udało się utworzyć konta pracownika.');
  }

  const userRef = db.collection('users').doc(user.uid);
  try {
    await userRef.set({
      uid:user.uid,
      email:user.email,
      displayName,
      personKey,
      role,
      createdAt:new Date(),
      updatedAt:new Date(),
      createdBy:request.auth.uid
    });
  } catch (error) {
    try { await auth.deleteUser(user.uid); } catch (rollbackError) {
      console.error('createUserAccount auth rollback error', rollbackError);
    }
    console.error('createUserAccount firestore error', error);
    throw new HttpsError('internal','Nie udało się utworzyć profilu pracownika. Konto logowania zostało wycofane.');
  }

  await writeAudit(db,{action:'create-user',targetUid:user.uid,actorUid:request.auth.uid,createdAt:new Date()},'createUserAccount');

  return {ok:true,uid:user.uid,email:user.email};
});

exports.updateUserProfile = onCall({region:'us-central1'}, async request => {
  const db = getFirestore();
  const auth = getAuth();
  if (!request.auth) throw new HttpsError('unauthenticated','Musisz być zalogowany.');

  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  requireAdmin(request, callerSnap);

  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const uid = String(data.uid || '').trim();
  if (!uid) throw new HttpsError('invalid-argument','Brak identyfikatora użytkownika.');

  const targetRef = db.collection('users').doc(uid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new HttpsError('not-found','Profil użytkownika nie istnieje.');

  const current = targetSnap.data() || {};
  const role = String(data.role ?? current.role ?? '').trim();
  const displayName = String(data.displayName ?? current.displayName ?? '').trim();
  const personKey = String(data.personKey ?? current.personKey ?? '').trim();
  const email = normalizeEmail(data.email ?? current.email);
  const newPassword = String(data.password || '');

  if (!validateRole(role)) throw new HttpsError('invalid-argument','Nieprawidłowa rola użytkownika.');
  if (!validateDisplayName(displayName)) {
    throw new HttpsError('invalid-argument','Imię i nazwisko musi mieć od 2 do 100 znaków.');
  }
  if (!validatePersonKey(personKey)) {
    throw new HttpsError('invalid-argument','Nieprawidłowy identyfikator pracownika.');
  }
  if (!validateEmail(email)) throw new HttpsError('invalid-argument','Podaj prawidłowy e-mail.');
  if (newPassword && (newPassword.length < 6 || newPassword.length > 128)) {
    throw new HttpsError('invalid-argument','Nowe hasło musi mieć od 6 do 128 znaków.');
  }
  if (uid === request.auth.uid && role !== 'admin') {
    throw new HttpsError('failed-precondition','Nie możesz odebrać sobie roli administratora.');
  }

  if (personKey && personKey !== current.personKey) {
    const existing = await db.collection('users').where('personKey','==',personKey).limit(2).get();
    const conflict = existing.docs.find(item => item.id !== uid);
    if (conflict) throw new HttpsError('already-exists','Ten identyfikator pracownika jest już przypisany do innego konta.');
  }

  const update = {
    uid,
    displayName,
    personKey,
    role,
    email,
    updatedAt:new Date(),
    updatedBy:request.auth.uid
  };

  try {
    await targetRef.set(update,{merge:true});
  } catch (error) {
    console.error('updateUserProfile firestore error', error);
    throw new HttpsError('internal','Nie udało się zapisać profilu użytkownika.');
  }

  try {
    const authUpdate = {displayName};
    if (email !== normalizeEmail(current.email)) authUpdate.email = email;
    if (newPassword) authUpdate.password = newPassword;
    await auth.updateUser(uid,authUpdate);
  } catch (error) {
    try {
      await targetRef.set(current);
    } catch (rollbackError) {
      console.error('updateUserProfile firestore rollback error', rollbackError);
    }
    if (error?.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists','Ten adres e-mail jest już używany.');
    }
    if (error?.code === 'auth/user-not-found') {
      throw new HttpsError('not-found','Konto logowania użytkownika nie istnieje.');
    }
    console.error('updateUserProfile auth error', error);
    throw new HttpsError('internal','Nie udało się zaktualizować konta logowania. Zmiany profilu zostały wycofane.');
  }

  await writeAudit(db,{action:'update-user',targetUid:uid,actorUid:request.auth.uid,createdAt:new Date()},'updateUserProfile');

  return {ok:true,uid};
});


exports.cleanupVehicleLocationHistory = onSchedule(
  {schedule:'0 3 * * *',timeZone:'Europe/Warsaw',retryCount:2},
  async () => {
    const db = getFirestore();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const vehicles = await db.collection('vehicleTracking').get();
    let deleted = 0;

    for (const vehicle of vehicles.docs) {
      const old = await vehicle.ref
        .collection('locations')
        .where('updatedAt','<',cutoff)
        .limit(500)
        .get();

      if (old.empty) continue;
      const batch = db.batch();
      old.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deleted += old.size;
    }

    console.log('cleanupVehicleLocationHistory', {vehicles:vehicles.size, deleted});
  }
);

```
