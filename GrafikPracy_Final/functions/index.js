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
