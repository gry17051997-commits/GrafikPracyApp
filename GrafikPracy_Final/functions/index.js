const {onCall,HttpsError} = require('firebase-functions/v2/https');
const {initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore} = require('firebase-admin/firestore');

initializeApp();

exports.deleteUserAccount = onCall(async request => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated','Musisz być zalogowany.');

  const db = getFirestore();
  const callerSnap = await db.collection('users').doc(caller.uid).get();
  if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied','Tylko administrator może usuwać konta.');
  }

  const uid = String(request.data?.uid || '').trim();
  if (!uid) throw new HttpsError('invalid-argument','Brak identyfikatora użytkownika.');
  if (uid === caller.uid) throw new HttpsError('failed-precondition','Administrator nie może usunąć własnego konta.');

  try {
    await getAuth().deleteUser(uid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') {
      console.error('deleteUserAccount auth error',error);
      throw new HttpsError('internal','Nie udało się usunąć konta logowania.');
    }
  }

  await db.collection('users').doc(uid).delete();

  await db.collection('audit').add({
    action:'delete-user',
    targetUid:uid,
    actorUid:caller.uid,
    createdAt:new Date()
  });

  return {ok:true,uid};
});


exports.createUserAccount = onCall(async request => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated','Musisz być zalogowany.');

  const db = getFirestore();
  const callerSnap = await db.collection('users').doc(caller.uid).get();
  if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied','Tylko administrator może dodawać pracowników.');
  }

  const data = request.data || {};
  const email = String(data.email || '').trim().toLowerCase();
  const password = String(data.password || '');
  const displayName = String(data.displayName || '').trim();
  const personKey = String(data.personKey || '').trim();
  const role = data.role === 'admin' ? 'admin' : 'employee';

  if (!email || !email.includes('@')) throw new HttpsError('invalid-argument','Podaj prawidłowy e-mail.');
  if (password.length < 6) throw new HttpsError('invalid-argument','Hasło musi mieć co najmniej 6 znaków.');
  if (!displayName) throw new HttpsError('invalid-argument','Podaj imię i nazwisko pracownika.');

  let user;
  try {
    user = await getAuth().createUser({email,password,displayName});
  } catch (error) {
    if (error?.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists','Konto z tym adresem e-mail już istnieje.');
    }
    console.error('createUserAccount auth error', error);
    throw new HttpsError('internal','Nie udało się utworzyć konta pracownika.');
  }

  try {
    await db.collection('users').doc(user.uid).set({
      uid:user.uid,
      email:user.email,
      displayName,
      personKey,
      role,
      createdAt:new Date(),
      updatedAt:new Date(),
      createdBy:caller.uid
    });
    await db.collection('audit').add({
      action:'create-user',
      targetUid:user.uid,
      actorUid:caller.uid,
      createdAt:new Date()
    });
  } catch (error) {
    try { await getAuth().deleteUser(user.uid); } catch (_) {}
    console.error('createUserAccount firestore error', error);
    throw new HttpsError('internal','Konto utworzono częściowo, ale nie udało się zapisać profilu.');
  }

  return {ok:true,uid:user.uid,email:user.email};
});

exports.updateUserProfile = onCall(async request => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated','Musisz być zalogowany.');

  const db = getFirestore();
  const callerSnap = await db.collection('users').doc(caller.uid).get();
  if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied','Tylko administrator może zarządzać użytkownikami.');
  }

  const data = request.data || {};
  const uid = String(data.uid || '').trim();
  if (!uid) throw new HttpsError('invalid-argument','Brak identyfikatora użytkownika.');

  const targetSnap = await db.collection('users').doc(uid).get();
  if (!targetSnap.exists) throw new HttpsError('not-found','Profil użytkownika nie istnieje.');

  const current = targetSnap.data() || {};
  const role = data.role === 'admin' ? 'admin' : 'employee';
  if (uid === caller.uid && role !== 'admin') {
    throw new HttpsError('failed-precondition','Nie możesz odebrać sobie roli administratora.');
  }

  const displayName = String(data.displayName ?? current.displayName ?? '').trim();
  const personKey = String(data.personKey ?? current.personKey ?? '').trim();
  const email = String(data.email ?? current.email ?? '').trim().toLowerCase();
  const newPassword = String(data.password || '');

  if (!displayName) throw new HttpsError('invalid-argument','Podaj imię i nazwisko pracownika.');
  if (newPassword && newPassword.length < 6) throw new HttpsError('invalid-argument','Nowe hasło musi mieć co najmniej 6 znaków.');

  const update = {displayName,personKey,role,email,updatedAt:new Date(),updatedBy:caller.uid};

  try {
    const authUpdate = {displayName};
    if (email && email !== current.email) authUpdate.email = email;
    if (newPassword) authUpdate.password = newPassword;
    await getAuth().updateUser(uid,authUpdate);
    await db.collection('users').doc(uid).set(update,{merge:true});
  } catch (error) {
    if (error?.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists','Ten adres e-mail jest już używany.');
    }
    console.error('updateUserProfile error', error);
    throw new HttpsError('internal','Nie udało się zaktualizować użytkownika.');
  }

  await db.collection('audit').add({
    action:'update-user',
    targetUid:uid,
    actorUid:caller.uid,
    createdAt:new Date()
  });

  return {ok:true,uid};
});
