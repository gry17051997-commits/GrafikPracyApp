import {Timestamp, doc, serverTimestamp, setDoc, updateDoc} from 'firebase/firestore';
import {buildUserInviteDocument, validateUserInviteInput} from './userInviteModel.js';

const INVITE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function requireServiceAccess(database, user) {
  if (!user?.uid) throw new Error('Zaloguj się jako administrator.');
  if (!database) throw new Error('Firebase Firestore jest niedostępny.');
}

export async function createUserInviteWithFirestore({
  database,
  user,
  input,
  generateCredentials,
  now = () => Date.now()
}) {
  requireServiceAccess(database, user);
  if (typeof generateCredentials !== 'function') {
    throw new Error('Brak generatora bezpiecznego tokenu zaproszenia.');
  }

  const validated = validateUserInviteInput(input);
  const {token, inviteId} = await generateCredentials();
  if (!INVITE_TOKEN_PATTERN.test(token) || !INVITE_TOKEN_PATTERN.test(inviteId)) {
    throw new Error('Nieprawidłowy token zaproszenia.');
  }

  const expiresAt = new Date(now() + validated.expiresInDays * 24 * 60 * 60 * 1000);
  const invite = buildUserInviteDocument(validated, {
    createdBy: user.uid,
    expiresAt: Timestamp.fromDate(expiresAt),
    serverTimestamp
  });

  await setDoc(doc(database, 'userInvites', inviteId), invite);

  return {...validated, inviteId, token, expiresAt};
}

export async function revokeUserInviteWithFirestore({database, user, inviteId}) {
  requireServiceAccess(database, user);
  if (typeof inviteId !== 'string' || !INVITE_TOKEN_PATTERN.test(inviteId)) {
    throw new Error('Nieprawidłowy identyfikator zaproszenia.');
  }
  await updateDoc(doc(database, 'userInvites', inviteId), {status: 'revoked'});
}
