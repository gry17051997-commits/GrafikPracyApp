const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {setGlobalOptions} = require('firebase-functions/v2');
const {initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');

initializeApp();
setGlobalOptions({region:'us-central1',maxInstances:10});

const db=getFirestore();
const adminAuth=getAuth();
const PERSON_KEYS=new Set(['','P','M','L']);
const ROLES=new Set(['employee','locator','admin']);

async function requireAdmin(request){
  const uid=request.auth?.uid;
  if(!uid) throw new HttpsError('unauthenticated','Wymagane logowanie.');
  const snap=await db.doc(`users/${uid}`).get();
  if(request.auth.token?.admin!==true && (!snap.exists||snap.data()?.role!=='admin'||snap.data()?.disabled===true))
    throw new HttpsError('permission-denied','Wymagane uprawnienia administratora.');
  return uid;
}
function validateProfile(data,{creating=false}={}){
  const email=String(data?.email||'').trim().toLowerCase();
  const displayName=String(data?.displayName||'').trim();
  const personKey=String(data?.personKey||'').trim();
  const role=String(data?.role||'employee').trim();
  const password=String(data?.password||'');
  if(creating&&!/^\S+@\S+\.\S+$/.test(email)) throw new HttpsError('invalid-argument','Nieprawidłowy e-mail.');
  if(creating&&(password.length<6||password.length>128)) throw new HttpsError('invalid-argument','Hasło musi mieć od 6 do 128 znaków.');
  if(displayName.length<2||displayName.length>100) throw new HttpsError('invalid-argument','Imię i nazwisko musi mieć od 2 do 100 znaków.');
  if(!PERSON_KEYS.has(personKey)) throw new HttpsError('invalid-argument','Nieprawidłowe przypisanie pracownika.');
  if(!ROLES.has(role)) throw new HttpsError('invalid-argument','Nieprawidłowa rola.');
  return {email,displayName,personKey,role,password};
}
async function assertPersonKeyAvailable(personKey,uid){
  if(!personKey)return;
  const snap=await db.collection('users').where('personKey','==',personKey).where('disabled','==',false).limit(10).get();
  if(snap.docs.some(d=>d.id!==uid)) throw new HttpsError('already-exists',`Pracownik ${personKey} jest już przypisany do aktywnego konta.`);
}
exports.adminCreateUser=onCall(async request=>{
  const adminUid=await requireAdmin(request);
  const data=validateProfile(request.data,{creating:true});
  let user=null;
  try{
    user=await adminAuth.createUser({email:data.email,password:data.password,displayName:data.displayName,disabled:false});
    await assertPersonKeyAvailable(data.personKey,user.uid);
    await db.doc(`users/${user.uid}`).set({
      uid:user.uid,email:data.email,displayName:data.displayName,personKey:data.personKey,role:data.role,
      disabled:false,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),createdBy:adminUid
    });
    return {ok:true,uid:user.uid,email:data.email};
  }catch(error){
    if(user?.uid)try{await adminAuth.deleteUser(user.uid)}catch{}
    if(error instanceof HttpsError)throw error;
    if(error?.code==='auth/email-already-exists')throw new HttpsError('already-exists','Konto z tym e-mailem już istnieje.');
    throw new HttpsError('internal','Nie udało się utworzyć konta.');
  }
});
exports.adminUpdateUser=onCall(async request=>{
  const adminUid=await requireAdmin(request);
  const uid=String(request.data?.uid||'');
  if(!uid)throw new HttpsError('invalid-argument','Brak identyfikatora użytkownika.');
  const data=validateProfile(request.data);
  if(uid===adminUid&&data.role!=='admin')throw new HttpsError('failed-precondition','Nie można odebrać sobie roli administratora.');
  const target=await adminAuth.getUser(uid).catch(()=>null);
  if(!target)throw new HttpsError('not-found','Użytkownik nie istnieje.');
  await assertPersonKeyAvailable(data.personKey,uid);
  const authUpdate={displayName:data.displayName};
  if(data.email&&data.email!==target.email)authUpdate.email=data.email;
  if(data.password)authUpdate.password=data.password;
  await adminAuth.updateUser(uid,authUpdate);
  await db.doc(`users/${uid}`).set({
    uid,email:data.email||target.email||'',displayName:data.displayName,personKey:data.personKey,role:data.role,
    updatedAt:FieldValue.serverTimestamp()
  },{merge:true});
  return {ok:true,uid};
});
exports.adminDisableUser=onCall(async request=>{
  const adminUid=await requireAdmin(request);
  const uid=String(request.data?.uid||'');
  if(!uid)throw new HttpsError('invalid-argument','Brak identyfikatora użytkownika.');
  if(uid===adminUid)throw new HttpsError('failed-precondition','Nie można wyłączyć własnego konta.');
  await adminAuth.updateUser(uid,{disabled:true});
  await db.doc(`users/${uid}`).set({disabled:true,disabledAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  return {ok:true,uid};
});


exports.cleanupVehicleLocationHistory=onSchedule({schedule:'every day 03:15',timeZone:'Europe/Warsaw',region:'us-central1',maxInstances:1},async()=>{
  const cutoff=new Date(Date.now()-7*24*60*60*1000);
  const vehicles=await db.collection('vehicleTracking').get();
  for(const vehicle of vehicles.docs){
    let query=vehicle.ref.collection('locations').where('updatedAt','<',cutoff).limit(400);
    while(true){
      const snap=await query.get();
      if(snap.empty) break;
      const batch=db.batch();
      snap.docs.forEach(doc=>batch.delete(doc.ref));
      await batch.commit();
      if(snap.size<400) break;
    }
  }
});
