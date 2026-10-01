const {onCall,HttpsError} = require('firebase-functions/v2/https');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore} = require('firebase-admin/firestore');
const {normalizeEmail,validateEmail,validateDisplayName,validateRolePerson} = require('./userValidation');

initializeApp();

function requireAdmin(request, callerSnap) {
  if (!request.auth) throw new HttpsError('unauthenticated','Musisz być zalogowany.');
  if (!callerSnap.exists) throw new HttpsError('permission-denied','Profil administratora nie istnieje.');
  const caller = callerSnap.data() || {};
  if (caller.disabled === true || caller.role !== 'admin') {
    throw new HttpsError('permission-denied','Tylko aktywny administrator może wykonywać tę operację.');
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateEmail(email) {
  return email.length <= 254 && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}

function validateDisplayName(value) {
  return value.length >= 2 && value.length <= 100;
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
    throw new HttpsError('internal','Konto logowania zostało usunięte, ale nie udało się usunąć profilu. Powtórz operację lub usuń profil ręcznie.');
  }

  await writeAudit(db,{action:'delete-user',targetUid:uid,actorUid:request.auth.uid,createdAt:new Date()},'deleteUserAccount');
  return {ok:true,uid};
});

exports.disableUserAccount = onCall({region:'us-central1'}, async request => {
  const db=getFirestore();
  const auth=getAuth();
  if(!request.auth) throw new HttpsError('unauthenticated','Musisz być zalogowany.');
  const callerSnap=await db.collection('users').doc(request.auth.uid).get();
  requireAdmin(request,callerSnap);

  const uid=String(request.data?.uid||'').trim();
  if(!uid) throw new HttpsError('invalid-argument','Brak identyfikatora użytkownika.');
  if(uid===request.auth.uid) throw new HttpsError('failed-precondition','Administrator nie może dezaktywować własnego konta.');

  const ref=db.collection('users').doc(uid);
  const snap=await ref.get();
  if(!snap.exists) throw new HttpsError('not-found','Profil użytkownika nie istnieje.');

  try {
    await auth.updateUser(uid,{disabled:true});
    await ref.set({disabled:true,disabledAt:new Date(),updatedAt:new Date(),updatedBy:request.auth.uid},{merge:true});
  } catch(error) {
    console.error('disableUserAccount error',error);
    throw new HttpsError('internal','Nie udało się dezaktywować konta.');
  }

  await writeAudit(db,{action:'disable-user',targetUid:uid,actorUid:request.auth.uid,createdAt:new Date()},'disableUserAccount');
  return {ok:true,uid};
});

exports.enableUserAccount = onCall({region:'us-central1'}, async request => {
  const db=getFirestore();
  const auth=getAuth();
  if(!request.auth) throw new HttpsError('unauthenticated','Musisz być zalogowany.');
  const callerSnap=await db.collection('users').doc(request.auth.uid).get();
  requireAdmin(request,callerSnap);

  const uid=String(request.data?.uid||'').trim();
  if(!uid) throw new HttpsError('invalid-argument','Brak identyfikatora użytkownika.');
  if(uid===request.auth.uid) throw new HttpsError('failed-precondition','Nie można wykonać tej operacji na własnym koncie.');

  const ref=db.collection('users').doc(uid);
  const snap=await ref.get();
  if(!snap.exists) throw new HttpsError('not-found','Profil użytkownika nie istnieje.');

  try {
    await ref.set({disabled:false,updatedAt:new Date(),updatedBy:request.auth.uid},{merge:true});
    await auth.updateUser(uid,{disabled:false});
  } catch(error) {
    console.error('enableUserAccount error',error);
    try { await ref.set({disabled:true,updatedAt:new Date(),updatedBy:request.auth.uid},{merge:true}); } catch(rollbackError) { console.error('enableUserAccount rollback error',rollbackError); }
    throw new HttpsError('internal','Nie udało się aktywować konta. Stan konta został zabezpieczony jako nieaktywny.');
  }

  await writeAudit(db,{action:'enable-user',targetUid:uid,actorUid:request.auth.uid,createdAt:new Date()},'enableUserAccount');
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
  if (password.length < 6 || password.length > 128) throw new HttpsError('invalid-argument','Hasło musi mieć od 6 do 128 znaków.');
  if (!validateDisplayName(displayName)) throw new HttpsError('invalid-argument','Imię i nazwisko musi mieć od 2 do 100 znaków.');
  if (!validateRolePerson(role,personKey)) throw new HttpsError('invalid-argument','Nieprawidłowe połączenie roli i przypisania pracownika.');
  if (personKey) {
    const existing = await db.collection('users').where('personKey','==',personKey).limit(1).get();
    if (!existing.empty) throw new HttpsError('already-exists','Ten identyfikator pracownika jest już przypisany do innego konta.');
  }
  let user;
  try { user = await auth.createUser({email,password,displayName}); }
  catch (error) {
    if (error?.code === 'auth/email-already-exists') throw new HttpsError('already-exists','Konto z tym adresem e-mail już istnieje.');
    if (error?.code === 'auth/invalid-password') throw new HttpsError('invalid-argument','Hasło nie spełnia wymagań Firebase Authentication.');
    console.error('createUserAccount auth error', error);
    throw new HttpsError('internal','Nie udało się utworzyć konta pracownika.');
  }
  const userRef = db.collection('users').doc(user.uid);
  try {
    await userRef.set({uid:user.uid,email:user.email,displayName,personKey,role,disabled:false,createdAt:new Date(),updatedAt:new Date(),createdBy:request.auth.uid});
  } catch (error) {
    try { await auth.deleteUser(user.uid); } catch (rollbackError) { console.error('createUserAccount auth rollback error', rollbackError); }
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
  if (!validateDisplayName(displayName)) throw new HttpsError('invalid-argument','Imię i nazwisko musi mieć od 2 do 100 znaków.');
  if (!validateEmail(email)) throw new HttpsError('invalid-argument','Podaj prawidłowy e-mail.');
  if (newPassword && (newPassword.length < 6 || newPassword.length > 128)) throw new HttpsError('invalid-argument','Nowe hasło musi mieć od 6 do 128 znaków.');
  if (uid === request.auth.uid && role !== 'admin') throw new HttpsError('failed-precondition','Nie możesz odebrać sobie roli administratora.');
  if (personKey && personKey !== current.personKey) {
    const existing = await db.collection('users').where('personKey','==',personKey).limit(2).get();
    const conflict = existing.docs.find(item => item.id !== uid);
    if (conflict) throw new HttpsError('already-exists','Ten identyfikator pracownika jest już przypisany do innego konta.');
  }
  const update = {uid,displayName,personKey,role,email,updatedAt:new Date(),updatedBy:request.auth.uid};
  try { await targetRef.set(update,{merge:true}); }
  catch (error) { console.error('updateUserProfile firestore error', error); throw new HttpsError('internal','Nie udało się zapisać profilu użytkownika.'); }
  try {
    const authUpdate = {displayName};
    if (email !== normalizeEmail(current.email)) authUpdate.email = email;
    if (newPassword) authUpdate.password = newPassword;
    await auth.updateUser(uid,authUpdate);
  } catch (error) {
    try { await targetRef.set(current); } catch (rollbackError) { console.error('updateUserProfile firestore rollback error', rollbackError); }
    if (error?.code === 'auth/email-already-exists') throw new HttpsError('already-exists','Ten adres e-mail jest już używany.');
    if (error?.code === 'auth/user-not-found') throw new HttpsError('not-found','Konto logowania użytkownika nie istnieje.');
    console.error('updateUserProfile auth error', error);
    throw new HttpsError('internal','Nie udało się zaktualizować konta logowania. Zmiany profilu zostały wycofane.');
  }
  await writeAudit(db,{action:'update-user',targetUid:uid,actorUid:request.auth.uid,createdAt:new Date()},'updateUserProfile');
  return {ok:true,uid};
});

exports.cleanupVehicleLocationHistory = onSchedule({schedule:'0 3 * * *',timeZone:'Europe/Warsaw',retryCount:2}, async () => {
  const db = getFirestore();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const vehicles = await db.collection('vehicleTracking').get();
  let deleted = 0;
  for (const vehicle of vehicles.docs) {
    const old = await vehicle.ref.collection('locations').where('updatedAt','<',cutoff).limit(500).get();
    if (old.empty) continue;
    const batch = db.batch();
    old.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    deleted += old.size;
  }
  console.log('cleanupVehicleLocationHistory', {vehicles:vehicles.size, deleted});
});
