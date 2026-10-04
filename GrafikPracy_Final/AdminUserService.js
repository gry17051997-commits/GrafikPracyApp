import {doc, serverTimestamp, updateDoc} from 'firebase/firestore';
import {db} from './firebaseConfig';

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

  return {displayName, personKey, role};
}

function requireDatabase() {
  if (!db) throw new Error('Firebase Firestore jest niedostępny.');
  return db;
}

export async function updateUserProfileWithoutFunctions(uid, form) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const database = requireDatabase();
  const {displayName, personKey, role} = validateInput(form);
  await updateDoc(doc(database, 'users', uid), {
    displayName,
    personKey,
    role,
    updatedAt: serverTimestamp()
  });
}

export async function disableUserWithoutFunctions(uid) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const database = requireDatabase();
  await updateDoc(doc(database, 'users', uid), {
    disabled: true,
    status: 'disabled',
    updatedAt: serverTimestamp()
  });
}

export async function enableUserWithoutFunctions(uid) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const database = requireDatabase();
  await updateDoc(doc(database, 'users', uid), {
    disabled: false,
    status: 'active',
    updatedAt: serverTimestamp()
  });
}

export async function setUserRoleAdmin(uid, role) {
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');
  const database = requireDatabase();
  const nextRole = String(role || '').trim();
  if (!['employee', 'locator', 'admin'].includes(nextRole)) throw new Error('Nieprawidłowa rola.');
  await updateDoc(doc(database, 'users', uid), {
    role: nextRole,
    updatedAt: serverTimestamp()
  });
}

export async function setUserDisabledAdmin(uid, disabled) {
  return disabled ? disableUserWithoutFunctions(uid) : enableUserWithoutFunctions(uid);
}
