import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseConfig';

function callable(name) {
  if (!functions) throw new Error('Firebase Functions jest niedostępne.');
  return httpsCallable(functions,name);
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

export async function createUserWithoutFunctions(form) {
  const data=validateInput(form,true);
  const res=await callable('createUserAccount')(data);
  return res.data;
}

export async function updateUserProfileWithoutFunctions(uid,form) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const data=validateInput(form,false);
  const res=await callable('updateUserProfile')({uid,...data});
  return res.data;
}

export async function disableUserWithoutFunctions(uid) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const res=await callable('setUserDisabled')({uid,disabled:true});
  return res.data;
}

export async function deleteUserAccountWithoutFunctions(uid) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const res=await callable('deleteUserAccount')({uid});
  return res.data;
}

export async function enableUserWithoutFunctions(uid) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const res=await callable('setUserDisabled')({uid,disabled:false});
  return res.data;
}

export async function setUserRoleAdmin(uid,role) {
  const res=await callable('setUserRole')({uid,role});
  return res.data;
}

export async function setUserDisabledAdmin(uid,disabled) {
  const res=await callable('setUserDisabled')({uid,disabled:!!disabled});
  return res.data;
}

export async function assignVehicleRegistrationAdmin(registration) {
  const res=await callable('assignVehicleRegistration')({registration});
  return res.data;
}

export async function adjustRecoveryBalanceAdmin(person,delta) {
  const res=await callable('adjustRecoveryBalance')({person,delta});
  return res.data;
}
