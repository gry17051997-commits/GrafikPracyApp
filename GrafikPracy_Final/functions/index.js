const {onCall,HttpsError} = require('firebase-functions/v2/https');
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

exports.deleteUserAccount = onCall(async request => {
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

  try {
    await db.collection('audit').add({
      action:'delete-user',
      targetUid:uid,
      actorUid:request.auth.uid,
      createdAt:new Date()
    });
  } catch (auditError) {
    console.error('deleteUserAccount audit error', auditError);
    throw new HttpsError('internal','Konto zostało usunięte, ale nie udało się zapisać audytu.');
  }

  return {ok:true,uid};
});

exports.createUserAccount = onCall(async request => {
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
  const registration = String(data.registration || '').trim();

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
  if (role === 'locator' && !registration) {
    throw new HttpsError('invalid-argument','Dla lokalizatora podaj numer rejestracyjny pojazdu.');
  }
  if (role === 'locator' && personKey) {
    throw new HttpsError('invalid-argument','Lokalizator nie może być przypisany do pracownika grafiku.');
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

  try {
    await db.collection('audit').add({
      action:'create-user',
      targetUid:user.uid,
      actorUid:request.auth.uid,
      createdAt:new Date()
    });
  } catch (auditError) {
    console.error('createUserAccount audit error', auditError);
    throw new HttpsError('internal','Konto zostało utworzone, ale nie udało się zapisać audytu.');
  }

  return {ok:true,uid:user.uid,email:user.email};
});

exports.configureVehicleLocator = onCall(async request => {
  const db = getFirestore();
  if (!request.auth) throw new HttpsError('unauthenticated','Musisz być zalogowany.');

  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  requireAdmin(request, callerSnap);

  const uid = String(request.data?.uid || '').trim();
  const registration = String(request.data?.registration || '').trim().toUpperCase();
  const enabled = request.data?.enabled !== false;

  if (!uid) throw new HttpsError('invalid-argument','Brak identyfikatora lokalizatora.');
  if (enabled && !registration) throw new HttpsError('invalid-argument','Podaj numer rejestracyjny pojazdu.');

  const targetSnap = await db.collection('users').doc(uid).get();
  if (enabled && (!targetSnap.exists || targetSnap.data()?.role !== 'locator')) {
    throw new HttpsError('failed-precondition','Wybrany użytkownik musi mieć rolę lokalizatora.');
  }

  const vehicleId = registration
    ? registration.toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]+/gi,'_').slice(0,40)
    : String(request.data?.vehicleId || '').trim();

  await db.collection('locationConfig').doc('main').set({
    enabled,
    vehicleId: enabled ? vehicleId : '',
    registration: enabled ? registration : '',
    locatorUid: enabled ? uid : '',
    updatedAt: new Date(),
    updatedBy: request.auth.uid
  }, {merge:true});

  try {
    await db.collection('audit').add({
      action: enabled ? 'configure-vehicle-locator' : 'disable-vehicle-locator',
      targetUid: uid,
      vehicleId: enabled ? vehicleId : '',
      actorUid: request.auth.uid,
      createdAt: new Date()
    });
  } catch (auditError) {
    console.error('configureVehicleLocator audit error', auditError);
  }

  return {ok:true,uid,vehicleId,registration,enabled};
});

exports.updateUserProfile = onCall(async request => {
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
  const registration = String(data.registration || '').trim();

  if (!validateRole(role)) throw new HttpsError('invalid-argument','Nieprawidłowa rola użytkownika.');
  if (!validateDisplayName(displayName)) {
    throw new HttpsError('invalid-argument','Imię i nazwisko musi mieć od 2 do 100 znaków.');
  }
  if (!validatePersonKey(personKey)) {
    throw new HttpsError('invalid-argument','Nieprawidłowy identyfikator pracownika.');
  }
  if (!validateEmail(email)) throw new HttpsError('invalid-argument','Podaj prawidłowy e-mail.');
  if (role === 'locator' && !registration) {
    throw new HttpsError('invalid-argument','Dla lokalizatora podaj numer rejestracyjny pojazdu.');
  }
  if (role === 'locator' && personKey) {
    throw new HttpsError('invalid-argument','Lokalizator nie może być przypisany do pracownika grafiku.');
  }
  if (newPassword && (newPassword.length < 6 || newPassword.length > 128)) {
    throw new HttpsError('invalid-argument','Nowe hasło musi mieć od 6 do 128 znaków.');
  }
  if (uid === request.auth.uid && role !== 'admin') {
    throw new HttpsError('failed-precondition','Nie możesz odebrać sobie roli administratora.');
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

  try {
    await db.collection('audit').add({
      action:'update-user',
      targetUid:uid,
      actorUid:request.auth.uid,
      createdAt:new Date()
    });
  } catch (auditError) {
    console.error('updateUserProfile audit error', auditError);
    throw new HttpsError('internal','Użytkownik został zaktualizowany, ale nie udało się zapisać audytu.');
  }

  return {ok:true,uid};
});
