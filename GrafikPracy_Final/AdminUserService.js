import {httpsCallable} from 'firebase/functions';
import {functions} from './firebaseConfig';

function validateInput(form, {requirePassword=false}={}) {
  const email = String(form.email || '').trim().toLowerCase();
  const displayName = String(form.displayName || '').trim();
  const personKey = String(form.personKey || '').trim();
  const role = String(form.role || '').trim();
  const password = String(form.password || '');

  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Podaj prawidłowy e-mail.');
  if (displayName.length < 2 || displayName.length > 100) throw new Error('Imię i nazwisko musi mieć od 2 do 100 znaków.');
  if (!['', 'P', 'M', 'L'].includes(personKey)) throw new Error('Nieprawidłowe przypisanie pracownika.');
  if (!['employee', 'locator', 'admin'].includes(role)) throw new Error('Nieprawidłowa rola.');
  if (role === 'employee' && !['P', 'M', 'L'].includes(personKey)) throw new Error('Pracownik musi mieć przypisane P/M/L.');
  if (role !== 'employee' && personKey !== '') throw new Error('Lokalizator i administrator nie mogą mieć przypisanego P/M/L.');
  if (requirePassword && (password.length < 6 || password.length > 128)) throw new Error('Hasło musi mieć od 6 do 128 znaków.');

  return {email, displayName, personKey, role, ...(requirePassword ? {password} : {})};
}

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions jest niedostępne.');
  return functions;
}

async function call(name, data) {
  const callable = httpsCallable(requireFunctions(), name);
  const result = await callable(data);
  return result?.data || {};
}

export async function createUserAccountWithoutFunctions(form) {
  const input = validateInput(form, {requirePassword:true});
  return call('createUserAccount', input);
}

export async function updateUserProfileWithoutFunctions(uid, form) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const input = validateInput(form);
  return call('updateUserProfile', {uid, ...input});
}

export async function disableUserWithoutFunctions(uid) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  return call('setUserDisabled', {uid, disabled:true});
}

export async function enableUserWithoutFunctions(uid) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  return call('setUserDisabled', {uid, disabled:false});
}

export async function setUserRoleAdmin(uid, role) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const nextRole = String(role || '').trim();
  if (!['employee', 'locator', 'admin'].includes(nextRole)) throw new Error('Nieprawidłowa rola.');
  return call('setUserRole', {uid, role:nextRole});
}

export async function setUserDisabledAdmin(uid, disabled) {
  return disabled ? disableUserWithoutFunctions(uid) : enableUserWithoutFunctions(uid);
}
