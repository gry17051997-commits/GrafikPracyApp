import {collection, getDocs, orderBy, query} from 'firebase/firestore';
import {auth, db} from './firebaseConfig';
import {generateUserInviteCredentials, hashUserInviteToken} from './userInviteCrypto.js';
import {claimUserInviteWithFirestore} from './userInviteClaim.js';
import {createUserInviteWithFirestore, revokeUserInviteWithFirestore} from './userInviteServiceCore.js';

function requireSignedInAdmin() {
  const user = auth?.currentUser;
  if (!user?.uid) throw new Error('Zaloguj się jako administrator.');
  return user;
}

export async function createUserInvite(input) {
  const user = requireSignedInAdmin();
  return createUserInviteWithFirestore({
    database: db,
    user,
    input,
    generateCredentials: generateUserInviteCredentials
  });
}

export async function listUserInvites() {
  requireSignedInAdmin();
  if (!db) throw new Error('Firebase Firestore jest niedostępny.');

  const invites = await getDocs(query(collection(db, 'userInvites'), orderBy('createdAt', 'desc')));
  return invites.docs.map(snapshot => ({inviteId: snapshot.id, ...snapshot.data()}));
}

export async function revokeUserInvite(inviteId) {
  return revokeUserInviteWithFirestore({database: db, user: requireSignedInAdmin(), inviteId});
}

export async function claimUserInvite({token, authUser}) {
  const currentUser = auth?.currentUser;
  if (!currentUser?.uid || currentUser.uid !== authUser?.uid) {
    throw new Error('Użytkownik dołączający do zaproszenia musi być zalogowany.');
  }

  return claimUserInviteWithFirestore({
    database: db,
    token,
    authUser,
    currentUserUid: auth.currentUser?.uid,
    hashToken: hashUserInviteToken
  });
}
