import {auth, db, firebaseConfig} from './firebaseConfig';
import {getApp, initializeApp} from 'firebase/app';
import {createUserWithEmailAndPassword, getAuth, initializeAuth, signOut, updateProfile} from 'firebase/auth';
import {doc, getDoc, runTransaction, serverTimestamp, setDoc, updateDoc} from 'firebase/firestore';


let adminCreateApp = null;
let adminCreateAuth = null;
function getAdminCreateAuth() {
  if (!adminCreateApp) {
    try { adminCreateApp = getApp('grafik-pracy-admin-create'); }
    catch { adminCreateApp = initializeApp(firebaseConfig,'grafik-pracy-admin-create'); }
  }
  if (!adminCreateAuth) {
    try { adminCreateAuth = initializeAuth(adminCreateApp); }
    catch { adminCreateAuth = getAuth(adminCreateApp); }
  }
  return adminCreateAuth;
}

async function assertAdmin() {
  if (!auth?.currentUser || !db) throw new Error('Musisz być zalogowany jako administrator.');
  const snap = await getDoc(doc(db,'users',auth.currentUser.uid));
  const data = snap.exists() ? snap.data() : null;
  if (!data || data.role !== 'admin' || data.disabled === true) throw new Error('Tylko aktywny administrator może wykonywać tę operację.');
  return auth.currentUser.uid;
}

function validateInput(form, requirePassword = true) {
  const email = String(form.email || '').trim().toLowerCase();
  const password = String(form.password || '').trim();
  const displayName = String(form.displayName || '').trim();
  const personKey = String(form.personKey || '').trim();
  const role = String(form.role || '').trim();

  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Podaj prawidłowy e-mail.');
  if (requirePassword && (password.length < 6 || password.length > 128)) throw new Error('Hasło musi mieć od 6 do 128 znaków.');
  if (displayName.length < 2 || displayName.length > 100) throw new Error('Imię i nazwisko musi mieć od 2 do 100 znaków.');
  if (!['', 'P', 'M', 'L'].includes(personKey)) throw new Error('Nieprawidłowe przypisanie pracownika.');
  if (!['employee', 'locator', 'admin'].includes(role)) throw new Error('Nieprawidłowa rola.');
  if (role === 'employee' && !['P', 'M', 'L'].includes(personKey)) throw new Error('Pracownik musi mieć przypisane P/M/L.');
  if (role !== 'employee' && personKey !== '') throw new Error('Lokalizator i administrator nie mogą mieć przypisanego P/M/L.');

  return { email, password, displayName, personKey, role };
}

export async function createUserWithoutFunctions(form) {
  const data = validateInput(form, true);
  const adminUid = await assertAdmin();
  const secondaryAuth = getAdminCreateAuth();
  let createdUid = '';
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth,data.email,data.password);
    createdUid = credential.user.uid;
    await updateProfile(credential.user,{displayName:data.displayName});
    await setDoc(doc(db,'users',createdUid),{uid:createdUid,email:data.email,displayName:data.displayName,personKey:data.personKey,role:data.role,disabled:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:adminUid});
    await signOut(secondaryAuth);
    return {ok:true,uid:createdUid,email:data.email};
  } catch(error) {
    try { await signOut(secondaryAuth); } catch {}
    if(error?.code==='auth/email-already-in-use') throw new Error('Konto z tym adresem e-mail już istnieje.');
    throw error;
  }
}

export async function updateUserProfileWithoutFunctions(uid, form) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const data = validateInput(form, false);
  const res = await callable('updateUserProfile')({ uid, ...data });
  return res.data;
}

export async function disableUserWithoutFunctions(uid) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const res = await callable('setUserDisabled')({ uid, disabled: true });
  return res.data;
}

export async function deleteUserAccountWithoutFunctions(uid) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const res = await callable('deleteUserAccount')({ uid });
  return res.data;
}

export async function enableUserWithoutFunctions(uid) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const res = await callable('setUserDisabled')({ uid, disabled: false });
  return res.data;
}

export async function setUserRoleAdmin(uid, role) {
  const adminUid = await assertAdmin();
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  if (!['admin','employee','locator'].includes(role)) throw new Error('Nieprawidłowa rola użytkownika.');
  if (uid === adminUid && role !== 'admin') throw new Error('Nie możesz odebrać sobie roli administratora.');
  const ref = doc(db,'users',uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Profil użytkownika nie istnieje.');
  const personKey = String(snap.data()?.personKey || '');
  if (role === 'employee' && !['P','M','L'].includes(personKey)) throw new Error('Pracownik musi mieć przypisane P/M/L.');
  if (role !== 'employee' && personKey !== '') throw new Error('Lokalizator i administrator nie mogą mieć przypisanego P/M/L.');
  await updateDoc(ref,{role,updatedAt:serverTimestamp(),updatedBy:adminUid});
  return {ok:true,uid,role};
}

export async function setUserDisabledAdmin(uid, disabled) {
  if (disabled) return disableUserWithoutFunctions(uid);
  return enableUserWithoutFunctions(uid);
}

export async function assignVehicleRegistrationAdmin(registration) {
  const adminUid = await assertAdmin();
  const normalized = String(registration || '').trim().toUpperCase();
  if (!normalized) throw new Error('Brak numeru rejestracyjnego.');
  const vehicleId = normalized.replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]/gi,'_').slice(0,40);
  if (!vehicleId) throw new Error('Nieprawidłowy numer rejestracyjny.');
  await setDoc(doc(db,'locationConfig','main'),{vehicleId,registration:normalized,updatedAt:serverTimestamp(),updatedBy:adminUid},{merge:true});
  return {ok:true,vehicleId,registration:normalized};
}

export async function adjustRecoveryBalanceAdmin(person, delta) {
  const adminUid = await assertAdmin();
  if (!['P','M','L'].includes(person)) throw new Error('Nieprawidłowy pracownik.');
  const amount = Number(delta);
  if (!Number.isFinite(amount) || amount === 0) throw new Error('Nieprawidłowa korekta salda.');
  const ref = doc(db,'settings','main');
  let next=0;
  await runTransaction(db,async tx=>{
    const snap=await tx.get(ref);
    const current=snap.data()?.recoveryBalances || {};
    next=(Number(current[person])||0)+amount;
    if(next<0) throw new Error('Saldo nie może spaść poniżej zera.');
    tx.set(ref,{recoveryBalances:{...current,[person]:next},updatedAt:serverTimestamp(),updatedBy:adminUid},{merge:true});
  });
  return {ok:true,person,delta:amount,next};
}
