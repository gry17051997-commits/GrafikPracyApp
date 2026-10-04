import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import {claimUserInviteWithFirestore} from '../userInviteClaim.js';
import {
  createUserInviteWithFirestore,
  revokeUserInviteWithFirestore
} from '../userInviteServiceCore.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let testEnv;
const projectId = 'demo-grafikpracy-user-invites';
const adminUid = 'active-admin';
const disabledAdminUid = 'disabled-admin';
const employeeUid = 'employee-user';
const disabledEmployeeUid = 'disabled-employee-user';
const locatorUid = 'locator-user';
const disabledLocatorUid = 'disabled-locator-user';
const inviteId = 'a'.repeat(64);
const inviteEmail = 'invited@example.com';
const claimCases = {
  valid: {token: 'a1'.repeat(32), email: 'claim@example.com'},
  expired: {token: 'a2'.repeat(32), email: 'expired-claim@example.com'},
  revoked: {token: 'a3'.repeat(32), email: 'revoked-claim@example.com'},
  claimed: {token: 'a4'.repeat(32), email: 'claimed-claim@example.com'},
  race: {token: 'a5'.repeat(32), email: 'race-claim@example.com'},
  role: {token: 'a6'.repeat(32), email: 'role-claim@example.com'},
  personKey: {token: 'a7'.repeat(32), email: 'person-key-claim@example.com'},
  otherUid: {token: 'a8'.repeat(32), email: 'other-uid-claim@example.com'},
  forgedPath: {token: 'a9'.repeat(32), email: 'forged-path-claim@example.com'},
  displayName: {token: 'aa'.repeat(32), email: 'display-name-claim@example.com'},
  roleTamper: {token: 'ab'.repeat(32), email: 'role-tamper-claim@example.com'},
  personKeyTamper: {token: 'ac'.repeat(32), email: 'person-key-tamper-claim@example.com'},
  replay: {token: 'ad'.repeat(32), email: 'replay-claim@example.com'}
};

const inviteIdForToken = token => createHash('sha256').update(token).digest('hex');
const hashToken = async token => inviteIdForToken(token);

async function seedClaimInvite(testEnv, {token, email}, overrides = {}) {
  const id = inviteIdForToken(token);
  const value = inviteData({
    email,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    ...overrides
  });
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'userInvites', id), value);
  });
  return {id, value};
}

function mockAuthUser(uid, email, emailVerified = true) {
  return {
    uid,
    email,
    emailVerified,
    reload: async () => {},
    getIdToken: async forceRefresh => {
      assert.equal(forceRefresh, true);
      return 'emulator-test-token';
    }
  };
}

async function attemptForgedClaim({
  db,
  token,
  uid,
  email,
  profileUid = uid,
  profileOverrides = {},
  inviteOverrides = {}
}) {
  const id = inviteIdForToken(token);
  const inviteRef = doc(db, 'userInvites', id);
  await runTransaction(db, async transaction => {
    const inviteSnapshot = await transaction.get(inviteRef);
    const invite = inviteSnapshot.data();
    transaction.set(doc(db, 'users', profileUid), {
      uid: profileUid,
      email,
      displayName: invite.displayName,
      role: invite.role,
      personKey: invite.personKey,
      disabled: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: 'active',
      inviteId: id,
      ...profileOverrides
    });
    transaction.update(inviteRef, {
      status: 'claimed',
      claimedBy: uid,
      claimedAt: serverTimestamp(),
      ...inviteOverrides
    });
  });
}

const userProfile = (uid, role, disabled = false) => ({
  uid,
  role,
  disabled
});

function inviteData(overrides = {}) {
  return {
    email: inviteEmail,
    displayName: 'Invited User',
    role: 'employee',
    personKey: 'P',
    status: 'pending',
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    createdAt: Timestamp.now(),
    createdBy: adminUid,
    claimedBy: null,
    claimedAt: null,
    ...overrides
  };
}

before(async () => {
  if (!enabled) return;
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {rules: fs.readFileSync('firestore.rules', 'utf8')}
  });
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', adminUid), userProfile(adminUid, 'admin'));
    await setDoc(doc(db, 'users', disabledAdminUid), userProfile(disabledAdminUid, 'admin', true));
    await setDoc(doc(db, 'users', employeeUid), userProfile(employeeUid, 'employee'));
    await setDoc(doc(db, 'users', disabledEmployeeUid), userProfile(disabledEmployeeUid, 'employee', true));
    await setDoc(doc(db, 'users', locatorUid), userProfile(locatorUid, 'locator'));
    await setDoc(doc(db, 'users', disabledLocatorUid), userProfile(disabledLocatorUid, 'locator', true));
    await setDoc(doc(db, 'schedules', 'main'), {weekId: 'main'});
    await setDoc(doc(db, 'locationConfig', 'main'), {vehicleId: 'test-vehicle'});
    for (const uid of [
      adminUid,
      disabledAdminUid,
      employeeUid,
      disabledEmployeeUid,
      locatorUid,
      disabledLocatorUid
    ]) {
      await setDoc(doc(db, 'proposals', `proposal-${uid}`), {fromUid: uid, status: 'pending'});
    }
    await setDoc(doc(db, 'userInvites', inviteId), inviteData());
    await setDoc(doc(db, 'userInvites', 'b'.repeat(64)), inviteData({
      email: 'expired@example.com',
      expiresAt: Timestamp.fromDate(new Date(Date.now() - 60_000))
    }));
    await setDoc(doc(db, 'userInvites', 'c'.repeat(64)), inviteData({
      email: 'revoked@example.com',
      status: 'revoked'
    }));
  });
  await seedClaimInvite(testEnv, claimCases.valid);
  await seedClaimInvite(testEnv, claimCases.expired, {
    expiresAt: Timestamp.fromDate(new Date(Date.now() - 60_000))
  });
  await seedClaimInvite(testEnv, claimCases.revoked, {status: 'revoked'});
  await seedClaimInvite(testEnv, claimCases.claimed, {
    status: 'claimed',
    claimedBy: 'previous-claimer',
    claimedAt: Timestamp.now()
  });
  await seedClaimInvite(testEnv, claimCases.race);
  await seedClaimInvite(testEnv, claimCases.role);
  await seedClaimInvite(testEnv, claimCases.personKey);
  await seedClaimInvite(testEnv, claimCases.otherUid);
  await seedClaimInvite(testEnv, claimCases.forgedPath);
  await seedClaimInvite(testEnv, claimCases.displayName);
  await seedClaimInvite(testEnv, claimCases.roleTamper);
  await seedClaimInvite(testEnv, claimCases.personKeyTamper);
  await seedClaimInvite(testEnv, claimCases.replay, {
    status: 'claimed',
    claimedBy: 'replay-user',
    claimedAt: Timestamp.now()
  });
});

after(async () => {
  await testEnv?.cleanup();
});

test('active admin can create a well-formed pending invite', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(adminUid).firestore();
  await assertSucceeds(setDoc(doc(db, 'userInvites', 'd'.repeat(64)), inviteData({
    createdAt: serverTimestamp()
  })));
});

test('admin creates an invite through the invite service without storing the token or password', {skip: !enabled}, async () => {
  const token = 'b1'.repeat(32);
  const inviteId = inviteIdForToken(token);
  const db = testEnv.authenticatedContext(adminUid).firestore();
  const created = await createUserInviteWithFirestore({
    database: db,
    user: {uid: adminUid},
    input: {
      email: '  SERVICE.USER@EXAMPLE.COM ',
      displayName: 'Service User',
      role: 'employee',
      personKey: 'M'
    },
    generateCredentials: async () => ({token, inviteId})
  });
  const snapshot = await getDoc(doc(db, 'userInvites', inviteId));
  const stored = snapshot.data();

  assert.equal(created.token, token);
  assert.equal(created.email, 'service.user@example.com');
  assert.equal(created.role, 'employee');
  assert.equal(created.personKey, 'M');
  assert.equal(stored.createdBy, adminUid);
  assert.equal(stored.status, 'pending');
  assert.equal(Object.hasOwn(stored, 'token'), false);
  assert.equal(Object.hasOwn(stored, 'password'), false);
  assert.equal(Object.hasOwn(stored, 'email'), true);
});

test('non-admin cannot create an invite through the invite service', {skip: !enabled}, async () => {
  const token = 'b2'.repeat(32);
  const db = testEnv.authenticatedContext(employeeUid, {email: 'employee@example.com'}).firestore();
  await assert.rejects(createUserInviteWithFirestore({
    database: db,
    user: {uid: employeeUid},
    input: {
      email: 'service-denied@example.com',
      displayName: 'Denied User',
      role: 'employee',
      personKey: 'P'
    },
    generateCredentials: async () => ({token, inviteId: inviteIdForToken(token)})
  }));
});

test('invite service rejects invalid role or personKey before writing', {skip: !enabled}, async t => {
  const db = testEnv.authenticatedContext(adminUid).firestore();
  const input = {
    email: 'invalid-service@example.com',
    displayName: 'Invalid User',
    role: 'employee',
    personKey: 'P'
  };
  await t.test('role', async () => assert.rejects(createUserInviteWithFirestore({
    database: db,
    user: {uid: adminUid},
    input: {...input, role: 'owner'},
    generateCredentials: async () => ({token: 'b3'.repeat(32), inviteId: 'b4'.repeat(32)})
  }), /Nieprawidłowa rola/));
  await t.test('personKey', async () => assert.rejects(createUserInviteWithFirestore({
    database: db,
    user: {uid: adminUid},
    input: {...input, personKey: ''},
    generateCredentials: async () => ({token: 'b5'.repeat(32), inviteId: 'b6'.repeat(32)})
  }), /musi mieć przypisane/));
});

test('Firestore Rules reject invites whose expiration has passed', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(adminUid).firestore();
  await assertFails(setDoc(doc(db, 'userInvites', 'b7'.repeat(32)), inviteData({
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() - 60_000))
  })));
});

test('admin revokes an invite through the invite service', {skip: !enabled}, async () => {
  const token = 'b8'.repeat(32);
  const {id} = await seedClaimInvite(testEnv, {token, email: 'revoke-service@example.com'});
  const db = testEnv.authenticatedContext(adminUid).firestore();
  await revokeUserInviteWithFirestore({
    database: db,
    user: {uid: adminUid},
    inviteId: id
  });
  assert.equal((await getDoc(doc(db, 'userInvites', id))).data().status, 'revoked');
});

test('employee cannot create an invite', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(employeeUid, {email: 'employee@example.com'}).firestore();
  await assertFails(setDoc(doc(db, 'userInvites', 'e'.repeat(64)), inviteData()));
});

test('locator cannot create an invite', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(locatorUid, {email: 'locator@example.com'}).firestore();
  await assertFails(setDoc(doc(db, 'userInvites', 'f'.repeat(64)), inviteData()));
});

test('disabled admin cannot create an invite', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(disabledAdminUid).firestore();
  await assertFails(setDoc(doc(db, 'userInvites', '1'.repeat(64)), inviteData()));
});

test('active employee can read the main schedule and disabled employee cannot', {skip: !enabled}, async t => {
  await t.test('active employee', async () => {
    const db = testEnv.authenticatedContext(employeeUid).firestore();
    await assertSucceeds(getDoc(doc(db, 'schedules', 'main')));
  });
  await t.test('disabled employee', async () => {
    const db = testEnv.authenticatedContext(disabledEmployeeUid).firestore();
    await assertFails(getDoc(doc(db, 'schedules', 'main')));
  });
});

test('active user can read own proposal and disabled user cannot', {skip: !enabled}, async t => {
  await t.test('active employee', async () => {
    const db = testEnv.authenticatedContext(employeeUid).firestore();
    await assertSucceeds(getDoc(doc(db, 'proposals', `proposal-${employeeUid}`)));
  });
  await t.test('disabled employee', async () => {
    const db = testEnv.authenticatedContext(disabledEmployeeUid).firestore();
    await assertFails(getDoc(doc(db, 'proposals', `proposal-${disabledEmployeeUid}`)));
  });
});

test('active locator and admin retain access to protected shared data', {skip: !enabled}, async t => {
  for (const uid of [locatorUid, adminUid]) {
    await t.test(uid, async () => {
      const db = testEnv.authenticatedContext(uid).firestore();
      await assertSucceeds(getDoc(doc(db, 'schedules', 'main')));
      await assertSucceeds(getDoc(doc(db, 'locationConfig', 'main')));
      await assertSucceeds(getDoc(doc(db, 'proposals', `proposal-${uid}`)));
    });
  }
});

test('disabled locator and admin cannot read protected data', {skip: !enabled}, async t => {
  for (const uid of [disabledLocatorUid, disabledAdminUid]) {
    await t.test(uid, async () => {
      const db = testEnv.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, 'schedules', 'main')));
      await assertFails(getDoc(doc(db, 'locationConfig', 'main')));
      await assertFails(getDoc(doc(db, 'proposals', `proposal-${uid}`)));
    });
  }
});

test('disabled user can still read their own profile', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(disabledEmployeeUid).firestore();
  await assertSucceeds(getDoc(doc(db, 'users', disabledEmployeeUid)));
});

test('admin cannot create an invite with an unsupported role', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(adminUid).firestore();
  await assertFails(setDoc(doc(db, 'userInvites', '2'.repeat(64)), inviteData({role: 'owner'})));
});

test('admin cannot create an invite with a role-incompatible personKey', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(adminUid).firestore();
  await assertFails(setDoc(doc(db, 'userInvites', '3'.repeat(64)), inviteData({personKey: ''})));
});

test('ordinary user cannot change invite role or personKey', {skip: !enabled}, async t => {
  const db = testEnv.authenticatedContext(employeeUid, {
    email: inviteEmail,
    email_verified: true
  }).firestore();
  await assertSucceeds(getDoc(doc(db, 'userInvites', inviteId)));
  await t.test('role', async () => assertFails(updateDoc(doc(db, 'userInvites', inviteId), {role: 'admin'})));
  await t.test('personKey', async () => assertFails(updateDoc(doc(db, 'userInvites', inviteId), {personKey: 'L'})));
});

test('ordinary user cannot read another email address invitation', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(employeeUid, {
    email: 'someone-else@example.com',
    email_verified: true
  }).firestore();
  await assertFails(getDoc(doc(db, 'userInvites', inviteId)));
});

test('ordinary user cannot list invitations', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(employeeUid, {
    email: inviteEmail,
    email_verified: true
  }).firestore();
  const {collection, getDocs} = await import('firebase/firestore');
  await assertFails(getDocs(collection(db, 'userInvites')));
});

test('unverified user cannot read an invitation', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(employeeUid, {email: inviteEmail}).firestore();
  await assertFails(getDoc(doc(db, 'userInvites', inviteId)));
});

test('expired invite is not readable by its intended email', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(employeeUid, {
    email: 'expired@example.com',
    email_verified: true
  }).firestore();
  await assertFails(getDoc(doc(db, 'userInvites', 'b'.repeat(64))));
});

test('revoked invite is not readable by its intended email', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(employeeUid, {
    email: 'revoked@example.com',
    email_verified: true
  }).firestore();
  await assertFails(getDoc(doc(db, 'userInvites', 'c'.repeat(64))));
});

test('active admin can revoke a pending invite but cannot delete it', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(adminUid).firestore();
  const target = doc(db, 'userInvites', inviteId);
  await assertSucceeds(updateDoc(target, {status: 'revoked'}));
  await assertFails(updateDoc(target, {status: 'pending'}));
});

test('ordinary user cannot create their own invite', {skip: !enabled}, async () => {
  const db = testEnv.authenticatedContext(employeeUid, {email: inviteEmail}).firestore();
  await assertFails(setDoc(doc(db, 'userInvites', '4'.repeat(64)), inviteData({
    email: inviteEmail,
    createdBy: employeeUid
  })));
});

test('verified invited user atomically claims invite and gets exactly the invite profile', {skip: !enabled}, async () => {
  const uid = 'claim-success-user';
  const db = testEnv.authenticatedContext(uid, {
    email: claimCases.valid.email,
    email_verified: true
  }).firestore();
  const result = await claimUserInviteWithFirestore({
    database: db,
    token: claimCases.valid.token,
    authUser: mockAuthUser(uid, claimCases.valid.email),
    currentUserUid: uid,
    hashToken
  });

  assert.equal(result.uid, uid);
  assert.equal(result.inviteId, inviteIdForToken(claimCases.valid.token));
  assert.equal(result.role, 'employee');

  const adminDb = testEnv.authenticatedContext(adminUid).firestore();
  const profile = (await getDoc(doc(adminDb, 'users', uid))).data();
  const invite = (await getDoc(doc(adminDb, 'userInvites', result.inviteId))).data();
  assert.deepEqual({
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName,
    role: profile.role,
    personKey: profile.personKey,
    disabled: profile.disabled,
    status: profile.status,
    inviteId: profile.inviteId
  }, {
    uid,
    email: claimCases.valid.email,
    displayName: 'Invited User',
    role: 'employee',
    personKey: 'P',
    disabled: false,
    status: 'active',
    inviteId: result.inviteId
  });
  assert.equal(invite.status, 'claimed');
  assert.equal(invite.claimedBy, uid);
  assert.ok(invite.claimedAt instanceof Timestamp);
});

test('unverified email cannot claim an invite', {skip: !enabled}, async () => {
  const uid = 'claim-unverified-user';
  const db = testEnv.authenticatedContext(uid, {
    email: claimCases.valid.email,
    email_verified: false
  }).firestore();
  await assert.rejects(claimUserInviteWithFirestore({
    database: db,
    token: claimCases.valid.token,
    authUser: mockAuthUser(uid, claimCases.valid.email, false),
    currentUserUid: uid
  }), /zweryfikuj adres email/);
});

test('malformed or unknown token cannot claim an invite', {skip: !enabled}, async () => {
  const uid = 'claim-bad-token-user';
  const db = testEnv.authenticatedContext(uid, {
    email: claimCases.valid.email,
    email_verified: true
  }).firestore();
  await assert.rejects(claimUserInviteWithFirestore({
    database: db,
    token: 'not-a-token',
    authUser: mockAuthUser(uid, claimCases.valid.email),
    currentUserUid: uid,
    hashToken
  }), /Nieprawidłowy token/);
  await assert.rejects(claimUserInviteWithFirestore({
    database: db,
    token: 'ff'.repeat(32),
    authUser: mockAuthUser(uid, claimCases.valid.email),
    currentUserUid: uid,
    hashToken
  }));
});

test('expired invite cannot be claimed', {skip: !enabled}, async () => {
  const uid = 'claim-expired-user';
  const db = testEnv.authenticatedContext(uid, {
    email: claimCases.expired.email,
    email_verified: true
  }).firestore();
  await assert.rejects(claimUserInviteWithFirestore({
    database: db,
    token: claimCases.expired.token,
    authUser: mockAuthUser(uid, claimCases.expired.email),
    currentUserUid: uid,
    hashToken
  }));
});

test('revoked invite cannot be claimed', {skip: !enabled}, async () => {
  const uid = 'claim-revoked-user';
  const db = testEnv.authenticatedContext(uid, {
    email: claimCases.revoked.email,
    email_verified: true
  }).firestore();
  await assert.rejects(claimUserInviteWithFirestore({
    database: db,
    token: claimCases.revoked.token,
    authUser: mockAuthUser(uid, claimCases.revoked.email),
    currentUserUid: uid,
    hashToken
  }));
});

test('claimed invite cannot be claimed again', {skip: !enabled}, async () => {
  const uid = 'claim-already-used-user';
  const db = testEnv.authenticatedContext(uid, {
    email: claimCases.claimed.email,
    email_verified: true
  }).firestore();
  await assert.rejects(claimUserInviteWithFirestore({
    database: db,
    token: claimCases.claimed.token,
    authUser: mockAuthUser(uid, claimCases.claimed.email),
    currentUserUid: uid,
    hashToken
  }));
});

test('verified user with a different email cannot claim the invite', {skip: !enabled}, async () => {
  const uid = 'claim-wrong-email-user';
  const db = testEnv.authenticatedContext(uid, {
    email: 'not-invited@example.com',
    email_verified: true
  }).firestore();
  await assert.rejects(claimUserInviteWithFirestore({
    database: db,
    token: claimCases.valid.token,
    authUser: mockAuthUser(uid, 'not-invited@example.com'),
    currentUserUid: uid,
    hashToken
  }));
});

test('claim rejects a claimedBy UID different from the authenticated user', {skip: !enabled}, async () => {
  const uid = 'claim-other-uid-user';
  const db = testEnv.authenticatedContext(uid, {
    email: claimCases.otherUid.email,
    email_verified: true
  }).firestore();
  await assertFails(attemptForgedClaim({
    db,
    token: claimCases.otherUid.token,
    uid,
    email: claimCases.otherUid.email,
    inviteOverrides: {claimedBy: 'attacker-chosen-uid'}
  }));
});

test('claim cannot create a profile under another UID', {skip: !enabled}, async () => {
  const uid = 'claim-own-auth-uid';
  const db = testEnv.authenticatedContext(uid, {
    email: claimCases.forgedPath.email,
    email_verified: true
  }).firestore();
  await assertFails(attemptForgedClaim({
    db,
    token: claimCases.forgedPath.token,
    uid,
    email: claimCases.forgedPath.email,
    profileUid: 'different-profile-uid'
  }));
});

test('claim rejects displayName tampering', {skip: !enabled}, async () => {
  const uid = 'claim-display-name-user';
  const db = testEnv.authenticatedContext(uid, {
    email: claimCases.displayName.email,
    email_verified: true
  }).firestore();
  await assertFails(attemptForgedClaim({
    db,
    token: claimCases.displayName.token,
    uid,
    email: claimCases.displayName.email,
    profileOverrides: {displayName: 'Attacker Name'}
  }));
});

test('claim rejects role escalation to admin', {skip: !enabled}, async () => {
  const uid = 'claim-role-user';
  const db = testEnv.authenticatedContext(uid, {
    email: claimCases.role.email,
    email_verified: true
  }).firestore();
  await assertFails(attemptForgedClaim({
    db,
    token: claimCases.role.token,
    uid,
    email: claimCases.role.email,
    profileOverrides: {role: 'admin'}
  }));
});

test('claim rejects role tampering even when the requested role is otherwise valid', {skip: !enabled}, async () => {
  const uid = 'claim-role-tamper-user';
  const db = testEnv.authenticatedContext(uid, {
    email: claimCases.roleTamper.email,
    email_verified: true
  }).firestore();
  await assertFails(attemptForgedClaim({
    db,
    token: claimCases.roleTamper.token,
    uid,
    email: claimCases.roleTamper.email,
    profileOverrides: {role: 'locator'}
  }));
});

test('claim rejects personKey tampering', {skip: !enabled}, async () => {
  const uid = 'claim-person-key-user';
  const db = testEnv.authenticatedContext(uid, {
    email: claimCases.personKey.email,
    email_verified: true
  }).firestore();
  await assertFails(attemptForgedClaim({
    db,
    token: claimCases.personKey.token,
    uid,
    email: claimCases.personKey.email,
    profileOverrides: {personKey: 'L'}
  }));
});

test('claim rejects personKey tampering even when it remains role-compatible', {skip: !enabled}, async () => {
  const uid = 'claim-person-key-tamper-user';
  const db = testEnv.authenticatedContext(uid, {
    email: claimCases.personKeyTamper.email,
    email_verified: true
  }).firestore();
  await assertFails(attemptForgedClaim({
    db,
    token: claimCases.personKeyTamper.token,
    uid,
    email: claimCases.personKeyTamper.email,
    profileOverrides: {personKey: 'M'}
  }));
});

test('the same UID cannot claim an already claimed invite again', {skip: !enabled}, async () => {
  const uid = 'replay-user';
  const db = testEnv.authenticatedContext(uid, {
    email: claimCases.replay.email,
    email_verified: true
  }).firestore();
  await assert.rejects(claimUserInviteWithFirestore({
    database: db,
    token: claimCases.replay.token,
    authUser: mockAuthUser(uid, claimCases.replay.email),
    currentUserUid: uid,
    hashToken
  }));
});

test('two simultaneous claim attempts yield one profile and one claimed UID', {skip: !enabled}, async () => {
  const firstUid = 'claim-race-user-one';
  const secondUid = 'claim-race-user-two';
  const makeDb = uid => testEnv.authenticatedContext(uid, {
    email: claimCases.race.email,
    email_verified: true
  }).firestore();
  const outcomes = await Promise.allSettled([
    claimUserInviteWithFirestore({
      database: makeDb(firstUid),
      token: claimCases.race.token,
      authUser: mockAuthUser(firstUid, claimCases.race.email),
      currentUserUid: firstUid,
      hashToken
    }),
    claimUserInviteWithFirestore({
      database: makeDb(secondUid),
      token: claimCases.race.token,
      authUser: mockAuthUser(secondUid, claimCases.race.email),
      currentUserUid: secondUid,
      hashToken
    })
  ]);

  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(outcome => outcome.status === 'rejected').length, 1);
  const adminDb = testEnv.authenticatedContext(adminUid).firestore();
  const claimedInvite = (await getDoc(doc(adminDb, 'userInvites', inviteIdForToken(claimCases.race.token)))).data();
  assert.ok([firstUid, secondUid].includes(claimedInvite.claimedBy));
  const profiles = await getDocs(collection(adminDb, 'users'));
  const raceProfiles = profiles.docs.filter(snapshot => [firstUid, secondUid].includes(snapshot.id));
  assert.equal(raceProfiles.length, 1);
  assert.equal(raceProfiles[0].id, claimedInvite.claimedBy);
});
