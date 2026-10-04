import {doc, serverTimestamp, updateDoc} from 'firebase/firestore';
import {db} from './firebaseConfig';
import {httpsCallable} from 'firebase/functions';
import {functions} from './firebaseConfig';

function callable(name) {
  if (!functions) throw new Error('Firebase Functions jest niedostępne.');
  return httpsCallable(functions, name);
}

function validateInput(form) {
  const email = String(form.email || '').trim().toLowerCase();
  const displayName = String(form.displayName || '').trim();
  const personKey = String(form.personKey || '').trim();
  const role = String(form.role || '').trim();

  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Podaj prawidłowy e-mail.');
  if (displayName.length < 2 || displayName.length > 100) throw new Error('Imię i nazwisko musi mieć od 2 do 100 znaków.');
  if (!['', 'P', 'M', 'L'].includes(personKey)) throw new Error('Nieprawidłowe przypisanie pracownika.');
  if (!['employee', 'locator', 'admin'].includes(role)) throw new Error('Nieprawidłowa rola.');
  if (role === 'employee' && !['P', 'M', 'L'].includes(personKey)) throw new Error('Pracownik musi mieć przypisane P/M/L.');
  if (role !== 'employee' && personKey !== '') throw new Error('Lokalizator i administrator nie mogą mieć przypisanego P/M/L.');

  return {email, displayName, personKey, role};
}

export async function updateUserProfileWithoutFunctions(uid, form) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  if (!db) throw new Error('Firebase Firestore jest niedostępny.');
  const {displayName, personKey, role} = validateInput(form);
  await updateDoc(doc(db, 'users', uid), {
    displayName,
    personKey,
    role,
    updatedAt: serverTimestamp()
  });
}

export async function disableUserWithoutFunctions(uid) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  if (!db) throw new Error('Firebase Firestore jest niedostępny.');
  await updateDoc(doc(db, 'users', uid), {
    disabled: true,
    status: 'disabled',
    updatedAt: serverTimestamp()
  });
}

export async function enableUserWithoutFunctions(uid) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  if (!db) throw new Error('Firebase Firestore jest niedostępny.');
  await updateDoc(doc(db, 'users', uid), {
    disabled: false,
    status: 'active',
    updatedAt: serverTimestamp()
  });
}

export async function setUserRoleAdmin(uid, role) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  if (!db) throw new Error('Firebase Firestore jest niedostępny.');
  if (!['employee', 'locator', 'admin'].includes(role)) throw new Error('Nieprawidłowa rola.');
  await updateDoc(doc(db, 'users', uid), {role, updatedAt: serverTimestamp()});
}

export async function setUserDisabledAdmin(uid, disabled) {
  return disabled ? disableUserWithoutFunctions(uid) : enableUserWithoutFunctions(uid);
}

export async function assignVehicleRegistrationAdmin(registration) {
  const res = await callable('assignVehicleRegistration')({ registration });
  return res.data;
}

export async function adjustRecoveryBalanceAdmin(person, delta) {
  const res = await callable('adjustRecoveryBalance')({ person, delta });
  return res.data;
}
