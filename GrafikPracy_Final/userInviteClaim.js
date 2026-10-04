import {
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

function requireValidAuthUser(authUser) {
  if (!authUser || typeof authUser !== 'object') {
    throw new Error('Brak zalogowanego użytkownika Firebase Authentication.');
  }
  if (typeof authUser.reload === 'function') {
    return authUser.reload().then(() => requireLoadedAuthUser(authUser));
  }
  return Promise.resolve(requireLoadedAuthUser(authUser));
}

function requireLoadedAuthUser(authUser) {
  if (typeof authUser.uid !== 'string' || !authUser.uid.trim()) {
    throw new Error('Brak UID użytkownika Firebase Authentication.');
  }
  if (typeof authUser.email !== 'string' || !authUser.email.trim()) {
    throw new Error('Konto Firebase Authentication nie ma adresu email.');
  }
  if (authUser.emailVerified !== true) {
    throw new Error('Przed użyciem zaproszenia zweryfikuj adres email.');
  }
  return authUser;
}

export async function claimUserInviteWithFirestore({database, token, authUser, currentUserUid, hashToken}) {
  if (!database) throw new Error('Firebase Firestore jest niedostępny.');
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw new Error('Nieprawidłowy token zaproszenia.');
  }

  const user = await requireValidAuthUser(authUser);
  if (currentUserUid !== user.uid) {
    throw new Error('Zalogowany użytkownik nie odpowiada kontu dołączającemu do zaproszenia.');
  }
  if (typeof user.getIdToken === 'function') await user.getIdToken(true);
  if (user.emailVerified !== true) {
    throw new Error('Przed użyciem zaproszenia zweryfikuj adres email.');
  }
  if (typeof hashToken !== 'function') throw new Error('Brak funkcji SHA-256 dla tokenu zaproszenia.');

  const inviteId = await hashToken(token);
  if (typeof inviteId !== 'string' || !/^[a-f0-9]{64}$/.test(inviteId)) {
    throw new Error('Nieprawidłowy skrót tokenu zaproszenia.');
  }
  const inviteRef = doc(database, 'userInvites', inviteId);
  const profileRef = doc(database, 'users', user.uid);

  return runTransaction(database, async transaction => {
    const inviteSnapshot = await transaction.get(inviteRef);
    if (!inviteSnapshot.exists()) throw new Error('Zaproszenie nie istnieje lub token jest nieprawidłowy.');
    const invite = inviteSnapshot.data();
    if (invite.status !== 'pending') throw new Error('Zaproszenie nie jest już dostępne.');
    if (!(invite.expiresAt instanceof Timestamp) || invite.expiresAt.toMillis() <= Date.now()) {
      throw new Error('Zaproszenie wygasło.');
    }
    if (invite.email !== user.email) {
      throw new Error('Adres email konta nie odpowiada zaproszeniu.');
    }

    const profileSnapshot = await transaction.get(profileRef);
    if (profileSnapshot.exists()) throw new Error('Konto ma już profil w aplikacji.');

    const timestamp = serverTimestamp();
    transaction.set(profileRef, {
      uid: user.uid,
      email: user.email,
      displayName: invite.displayName,
      role: invite.role,
      personKey: invite.personKey,
      disabled: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'active',
      inviteId
    });
    transaction.update(inviteRef, {
      status: 'claimed',
      claimedBy: user.uid,
      claimedAt: serverTimestamp()
    });

    return {uid: user.uid, inviteId, role: invite.role};
  });
}
