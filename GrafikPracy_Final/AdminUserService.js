import {initializeApp,deleteApp} from 'firebase/app';
import {createUserWithEmailAndPassword,initializeAuth,inMemoryPersistence,signOut,updateProfile} from 'firebase/auth';
import {doc,deleteDoc,setDoc,serverTimestamp,updateDoc} from 'firebase/firestore';
import {auth,db,firebaseApp,firebaseConfig} from './firebaseConfig';

function assertReady(){
  if(!firebaseApp || !auth || !db) throw new Error('Firebase nie jest dostępny.');
}

function validateInput(form, requirePassword=true) {
  const email=String(form.email||'').trim().toLowerCase();
  const password=String(form.password||'');
  const displayName=String(form.displayName||'').trim();
  const personKey=String(form.personKey||'').trim();
  const role=String(form.role||'').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Podaj prawidłowy e-mail.');
  if (requirePassword && (password.length<6 || password.length>128)) throw new Error('Hasło musi mieć od 6 do 128 znaków.');
  if (displayName.length<2 || displayName.length>100) throw new Error('Imię i nazwisko musi mieć od 2 do 100 znaków.');
  if (!['','P','M','L'].includes(personKey)) throw new Error('Nieprawidłowe przypisanie pracownika.');
  if (!['employee','locator','admin'].includes(role)) throw new Error('Nieprawidłowa rola.');
  if (role==='employee' && !['P','M','L'].includes(personKey)) throw new Error('Pracownik musi mieć przypisane P/M/L.');
  if (role!=='employee' && personKey!=='') throw new Error('Lokalizator i administrator nie mogą mieć przypisanego P/M/L.');
  return {email,password,displayName,personKey,role};
}

async function createSecondaryAuth(){
  const secondary=initializeApp(firebaseConfig,'grafik-pracy-admin-create-'+Date.now());
  const secondaryAuth=initializeAuth(secondary,{persistence:inMemoryPersistence});
  return {secondary,secondaryAuth};
}

export async function createUserWithoutFunctions(form) {
  assertReady();
  const data=validateInput(form,true);
  const {secondary,secondaryAuth}=await createSecondaryAuth();
  let createdUid='';
  try {
    const cred=await createUserWithEmailAndPassword(secondaryAuth,data.email,data.password);
    createdUid=cred.user.uid;
    await updateProfile(cred.user,{displayName:data.displayName});
    await setDoc(doc(db,'users',createdUid),{
      uid:createdUid,
      email:data.email,
      displayName:data.displayName,
      personKey:data.personKey,
      role:data.role,
      disabled:false,
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp(),
      createdBy:auth.currentUser.uid
    });
    return {ok:true,uid:createdUid,email:data.email};
  } catch(error) {
    if(createdUid){
      try { await secondaryAuth.currentUser?.delete(); } catch(e) {}
      try { await deleteDoc(doc(db,'users',createdUid)); } catch(e) {}
    }
    if(error?.code==='auth/email-already-in-use') throw new Error('Konto z tym adresem e-mail już istnieje.');
    if(error?.code==='auth/invalid-email') throw new Error('Podaj prawidłowy e-mail.');
    if(error?.code==='auth/weak-password') throw new Error('Hasło jest zbyt słabe.');
    if(error?.code==='permission-denied') throw new Error('Brak uprawnień administratora do utworzenia profilu.');
    throw error;
  } finally {
    try { await signOut(secondaryAuth); } catch(e) {}
    try { await deleteApp(secondary); } catch(e) {}
  }
}

export async function updateUserProfileWithoutFunctions(uid,form) {
  assertReady();
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const data=validateInput({...form,password:''},false);
  if(data.email && form.emailChanged===true) {
    throw new Error('Zmiana e-maila istniejącego konta wymaga logowania tego użytkownika. Zmień dane profilu bez zmiany e-maila.');
  }
  await updateDoc(doc(db,'users',uid),{
    displayName:data.displayName,
    personKey:data.personKey,
    role:data.role,
    updatedAt:serverTimestamp(),
    updatedBy:auth.currentUser.uid
  });
  return {ok:true,uid};
}

export async function deleteUserAccountWithoutFunctions(uid) {
  assertReady();
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  if (uid===auth.currentUser?.uid) throw new Error('Administrator nie może usunąć własnego konta.');
  await deleteDoc(doc(db,'users',uid));
  return {ok:true,uid};
}

export async function disableUserWithoutFunctions(uid) {
  assertReady();
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  if (uid===auth.currentUser?.uid) throw new Error('Nie możesz wyłączyć własnego konta.');
  await updateDoc(doc(db,'users',uid),{disabled:true,disabledAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});
  return {ok:true,uid,disabled:true};
}

export async function enableUserWithoutFunctions(uid) {
  assertReady();
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  if (uid===auth.currentUser?.uid) return {ok:true,uid,disabled:false};
  await updateDoc(doc(db,'users',uid),{disabled:false,disabledAt:null,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});
  return {ok:true,uid,disabled:false};
}

export async function setUserRoleAdmin(uid,role) {
  assertReady();
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  if (!['admin','employee','locator'].includes(role)) throw new Error('Nieprawidłowa rola.');
  await updateDoc(doc(db,'users',uid),{role,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});
  return {ok:true,uid,role};
}

export async function setUserDisabledAdmin(uid,disabled) {
  return disabled ? disableUserWithoutFunctions(uid) : enableUserWithoutFunctions(uid);
}

export async function assignVehicleRegistrationAdmin(registration) {
  assertReady();
  const reg=String(registration||'').trim().toUpperCase();
  if(!reg) throw new Error('Brak numeru rejestracyjnego.');
  const vehicleId=reg.replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]/gi,'_').slice(0,40);
  await setDoc(doc(db,'locationConfig','main'),{
    vehicleId,
    registration:reg,
    updatedAt:serverTimestamp(),
    updatedBy:auth.currentUser.uid
  },{merge:true});
  return {ok:true,vehicleId,registration:reg};
}

export async function adjustRecoveryBalanceAdmin(person,delta) {
  throw new Error('Ta operacja wymaga backendu uprzywilejowanego i nie jest dostępna bez Firebase Functions.');
}
