import { deleteApp, getApps, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, inMemoryPersistence, initializeAuth, signOut } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from './firebaseConfig';

const SECONDARY_APP_NAME = 'admin-user-provisioning';

function validateInput(form) {
  const email = String(form.email || '').trim().toLowerCase();
  const password = String(form.password || '');
  const displayName = String(form.displayName || '').trim();
  const personKey = String(form.personKey || '').trim();
  const role = String(form.role || '').trim();

  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Podaj prawidłowy e-mail.');
  if (password.length < 6 || password.length > 128) throw new Error('Hasło musi mieć od 6 do 128 znaków.');
  if (displayName.length < 2 || displayName.length > 100) throw new Error('Imię i nazwisko musi mieć od 2 do 100 znaków.');
  if (!['','P','M','L'].includes(personKey)) throw new Error('Nieprawidłowe przypisanie pracownika.');
  if (!['employee','locator','admin'].includes(role)) throw new Error('Nieprawidłowa rola.');
  if (role === 'employee' && !['P','M','L'].includes(personKey)) {
    throw new Error('Pracownik musi mieć przypisane P/M/L.');
  }
  if (role !== 'employee' && personKey !== '') {
    throw new Error('Lokalizator i administrator nie mogą mieć przypisanego P/M/L.');
  }

  return { email, password, displayName, personKey, role };
}

export async function createUserWithoutFunctions(form, createdByUid) {
  if (!db) throw new Error('Firebase Firestore jest niedostępny.');
  const data = validateInput(form);
  const adminUid = String(createdByUid || '').trim();
  if (!adminUid) throw new Error('Brak identyfikatora administratora.');


  const existingSecondary = getApps().find(app => app.name === SECONDARY_APP_NAME);
  if (existingSecondary) {
    try { await deleteApp(existingSecondary); } catch {}
  }
  const secondaryApp = initializeApp(firebaseConfig, SECONDARY_APP_NAME);
  let secondaryAuth;
  try {
    secondaryAuth = initializeAuth(secondaryApp, { persistence: inMemoryPersistence });
  } catch {
    secondaryAuth = getAuth(secondaryApp);
  }

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.password);
    const user = credential.user;

    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: data.email,
      displayName: data.displayName,
      personKey: data.personKey,
      role: data.role,
      disabled: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: adminUid
    });

    return { ok: true, uid: user.uid, email: data.email };
  } finally {
    try { await signOut(secondaryAuth); } catch {}
    try { await deleteApp(secondaryApp); } catch {}
  }
}

export async function updateUserProfileWithoutFunctions(uid, form) {
  if (!db) throw new Error('Firebase Firestore jest niedostępny.');
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');

  const displayName = String(form.displayName || '').trim();
  const personKey = String(form.personKey || '').trim();
  const role = String(form.role || '').trim();

  if (displayName.length < 2 || displayName.length > 100) throw new Error('Imię i nazwisko musi mieć od 2 do 100 znaków.');
  if (!['','P','M','L'].includes(personKey)) throw new Error('Nieprawidłowe przypisanie pracownika.');
  if (!['employee','locator','admin'].includes(role)) throw new Error('Nieprawidłowa rola.');
  if (role === 'employee' && !['P','M','L'].includes(personKey)) {
    throw new Error('Pracownik musi mieć przypisane P/M/L.');
  }
  if (role !== 'employee' && personKey !== '') {
    throw new Error('Lokalizator i administrator nie mogą mieć przypisanego P/M/L.');
  }

  if (String(form.password || '')) {
    throw new Error('Zmiana hasła wymaga backendu administracyjnego. Dodawanie kont działa bez Cloud Functions.');
  }

  await setDoc(doc(db, 'users', uid), {
    uid,
    displayName,
    personKey,
    role,
    updatedAt: serverTimestamp()
  }, { merge: true });

  return { ok: true, uid };
}

export async function disableUserWithoutFunctions(uid) {
  if (!db) throw new Error('Firebase Firestore jest niedostępny.');
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');

  await setDoc(doc(db, 'users', uid), {
    disabled: true,
    disabledAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  return { ok: true, uid };
}

export async function enableUserWithoutFunctions(uid) {
  if (!db) throw new Error('Firebase Firestore jest niedostępny.');
  if (!uid) throw new Error('Brak identyfikatora użytkownika.');

  await setDoc(doc(db, 'users', uid), {
    disabled: false,
    updatedAt: serverTimestamp()
  }, { merge: true });

  return { ok: true, uid };
}
