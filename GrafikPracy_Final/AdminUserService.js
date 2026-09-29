import {getFunctions, httpsCallable} from 'firebase/functions';
import {firebaseApp, FIREBASE_ENABLED} from './firebaseConfig';

function call(name) {
  if (!FIREBASE_ENABLED || !firebaseApp) throw new Error('Firebase jest wyłączony.');
  return httpsCallable(getFunctions(firebaseApp,'us-central1'),name);
}

export async function createUserWithoutFunctions(form) {
  const result=await call('adminCreateUser')(form);
  return result.data;
}
export async function updateUserProfileWithoutFunctions(uid, form) {
  const result=await call('adminUpdateUser')({...form,uid});
  return result.data;
}
export async function disableUserWithoutFunctions(uid) {
  const result=await call('adminDisableUser')({uid});
  return result.data;
}
