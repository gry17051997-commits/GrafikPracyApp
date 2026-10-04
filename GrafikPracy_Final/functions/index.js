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
  if (!callerSnap.exists || callerSnap.data()?.role !== 'admin' || callerSnap.data()?.disabled === true) {
    throw new HttpsError('permission-denied','Tylko aktywny administrator może wykonywać tę operację.');
  }
}

function validateRolePerson(role, personKey) {
  return validateRole(role)
    && validatePersonKey(personKey)
    && (
      (role === 'employee' && VALID_PERSON_KEYS.has(personKey))
      || (role !== 'employee' && personKey === '')
    );
}

async function restoreUserFields(ref, previous, updatedFields) {
  const currentSnap = await ref.get();
  const current = currentSnap.exists ? (currentSnap.data() || {}) : {};
  const patch = {};
  for (const [key,value] of Object.entries(updatedFields)) {
    if (!Object.prototype.hasOwnProperty.call(current,key)) continue;
    if (!Object.is(current[key],value)) continue;
    if (Object.prototype.hasOwnProperty.call(previous,key)) patch[key] = previous[key];
    else patch[key] = require('firebase-admin/firestore').FieldValue.delete();
  }
  if (Object.keys(patch).length) await ref.set(patch,{merge:true});
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
  if (!validateRolePerson(role,personKey)) {
    throw new HttpsError('invalid-argument','Nieprawidłowe połączenie roli i przypisania pracownika.');
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

  if (!validateRolePerson(role,personKey)) throw new HttpsError('invalid-argument','Nieprawidłowe połączenie roli i przypisania pracownika.');
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
      await restoreUserFields(targetRef,current,update);
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


exports.setUserRole = onCall({region:'us-central1'}, async request => {
  const db = getFirestore();
  const callerSnap = request.auth ? await db.collection('users').doc(request.auth.uid).get() : null;
  requireAdmin(request, callerSnap);
  const uid = String(request.data?.uid || '').trim();
  const role = String(request.data?.role || '').trim();
  if (!uid) throw new HttpsError('invalid-argument','Brak identyfikatora użytkownika.');
  if (!validateRole(role)) throw new HttpsError('invalid-argument','Nieprawidłowa rola użytkownika.');
  if (uid === request.auth.uid && role !== 'admin') throw new HttpsError('failed-precondition','Nie możesz odebrać sobie roli administratora.');
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found','Profil użytkownika nie istnieje.');
  const current = snap.data() || {};
  const personKey = String(current.personKey || '');
  if (!validatePersonKey(personKey) || !((role === 'employee' && VALID_PERSON_KEYS.has(personKey)) || (role !== 'employee' && personKey === ''))) {
    throw new HttpsError('failed-precondition','Wybrana rola jest niezgodna z przypisaniem pracownika.');
  }
  await ref.set({role,updatedAt:new Date(),updatedBy:request.auth.uid},{merge:true});
  await writeAudit(db,{action:'set-user-role',targetUid:uid,actorUid:request.auth.uid,role,createdAt:new Date()},'setUserRole');
  return {ok:true,uid,role};
});

exports.setUserDisabled = onCall({region:'us-central1'}, async request => {
  const db = getFirestore();
  const adminAuth = getAuth();
  const callerSnap = request.auth ? await db.collection('users').doc(request.auth.uid).get() : null;
  requireAdmin(request, callerSnap);
  const uid = String(request.data?.uid || '').trim();
  const disabled = request.data?.disabled === true;
  if (!uid) throw new HttpsError('invalid-argument','Brak identyfikatora użytkownika.');
  if (uid === request.auth.uid && disabled) throw new HttpsError('failed-precondition','Administrator nie może wyłączyć własnego konta.');
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found','Profil użytkownika nie istnieje.');
  const previous = snap.data() || {};
  const update = {disabled,disabledAt:disabled?new Date():null,updatedAt:new Date(),updatedBy:request.auth.uid};
  try {
    await ref.set(update,{merge:true});
    await adminAuth.updateUser(uid,{disabled});
  } catch(error) {
    try { await restoreUserFields(ref,previous,update); } catch(rollbackError) { console.error('setUserDisabled rollback error',rollbackError); }
    if (error?.code === 'auth/user-not-found') throw new HttpsError('not-found','Konto logowania użytkownika nie istnieje.');
    console.error('setUserDisabled error',error);
    throw new HttpsError('internal','Nie udało się zmienić stanu konta.');
  }
  await writeAudit(db,{action:disabled?'disable-user':'enable-user',targetUid:uid,actorUid:request.auth.uid,disabled,createdAt:new Date()},'setUserDisabled');
  return {ok:true,uid,disabled};
});

exports.assignVehicleRegistration = onCall({region:'us-central1'}, async request => {
  const db = getFirestore();
  const callerSnap = request.auth ? await db.collection('users').doc(request.auth.uid).get() : null;
  requireAdmin(request, callerSnap);
  const registration = String(request.data?.registration || '').trim().toUpperCase();
  if (!registration) throw new HttpsError('invalid-argument','Brak numeru rejestracyjnego.');
  const vehicleId = registration.replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]/gi,'_').slice(0,40);
  if (!vehicleId) throw new HttpsError('invalid-argument','Nieprawidłowy numer rejestracyjny.');
  await db.collection('locationConfig').doc('main').set({vehicleId,registration,updatedAt:new Date(),updatedBy:request.auth.uid},{merge:true});
  await writeAudit(db,{action:'assign-vehicle',actorUid:request.auth.uid,vehicleId,registration,createdAt:new Date()},'assignVehicleRegistration');
  return {ok:true,vehicleId,registration};
});

exports.adjustRecoveryBalance = onCall({region:'us-central1'}, async request => {
  const db = getFirestore();
  const callerSnap = request.auth ? await db.collection('users').doc(request.auth.uid).get() : null;
  requireAdmin(request, callerSnap);
  const person = String(request.data?.person || '').trim();
  const delta = Number(request.data?.delta);
  if (!VALID_PERSON_KEYS.has(person)) throw new HttpsError('invalid-argument','Nieprawidłowy pracownik.');
  if (!Number.isFinite(delta) || delta === 0) throw new HttpsError('invalid-argument','Nieprawidłowa korekta salda.');
  const ref = db.collection('settings').doc('main');
  let next = 0;
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const current = snap.data()?.recoveryBalances || {};
    const currentValue = Number(current[person]) || 0;
    next = currentValue + delta;
    if (next < 0) throw new HttpsError('invalid-argument','Saldo nie może spaść poniżej zera.');
    tx.set(ref,{recoveryBalances:{...current,[person]:next},updatedAt:new Date(),updatedBy:request.auth.uid},{merge:true});
  });
  await writeAudit(db,{action:'adjust-recovery-balance',actorUid:request.auth.uid,person,delta,next,createdAt:new Date()},'adjustRecoveryBalance');
  return {ok:true,person,delta,next};
});
