import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {buildUserInviteDocument, validateUserInviteInput} from '../userInviteModel.js';

const read = file => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('invite validation normalizes email and accepts only compatible roles/person keys', () => {
  assert.deepEqual(validateUserInviteInput({
    email: '  NEW.USER@EXAMPLE.COM ',
    displayName: 'New User',
    role: 'employee',
    personKey: 'P'
  }), {
    email: 'new.user@example.com',
    displayName: 'New User',
    role: 'employee',
    personKey: 'P',
    expiresInDays: 7
  });

  assert.equal(validateUserInviteInput({
    email: 'locator@example.com',
    displayName: 'Locator',
    role: 'locator',
    personKey: ''
  }).role, 'locator');
});

test('invite validation rejects invalid role/person combinations and expiry ranges', () => {
  const base = {email: 'user@example.com', displayName: 'User', role: 'employee', personKey: 'P'};
  assert.throws(() => validateUserInviteInput({...base, role: 'owner'}), /Nieprawidłowa rola/);
  assert.throws(() => validateUserInviteInput({...base, role: 'locator', personKey: 'P'}), /nie mogą mieć przypisanego/);
  assert.throws(() => validateUserInviteInput({...base, personKey: ''}), /musi mieć przypisane/);
  assert.throws(() => validateUserInviteInput({...base, expiresInDays: 0}), /wygasać/);
  assert.throws(() => validateUserInviteInput({...base, expiresInDays: 31}), /wygasać/);
});

test('invite document contains no password or raw token and starts pending', () => {
  const invite = buildUserInviteDocument({
    email: 'user@example.com',
    displayName: 'User',
    role: 'employee',
    personKey: 'M'
  }, {
    createdBy: 'admin-uid',
    expiresAt: {toDate: () => new Date('2030-01-01T00:00:00Z')},
    serverTimestamp: () => 'server-time'
  });

  assert.deepEqual(Object.keys(invite).sort(), [
    'claimedAt', 'claimedBy', 'createdAt', 'createdBy', 'displayName',
    'email', 'expiresAt', 'personKey', 'role', 'status'
  ]);
  assert.equal(invite.status, 'pending');
  assert.equal(invite.claimedBy, null);
  assert.equal(invite.claimedAt, null);
  assert.equal(Object.hasOwn(invite, 'password'), false);
  assert.equal(Object.hasOwn(invite, 'token'), false);
});

test('invite token helper uses 256-bit CSPRNG material and SHA-256 document ids', () => {
  const crypto = read('userInviteCrypto.js');
  assert.match(crypto, /getRandomBytesAsync\(INVITE_TOKEN_BYTES\)/);
  assert.match(crypto, /const INVITE_TOKEN_BYTES = 32/);
  assert.match(crypto, /CryptoDigestAlgorithm\.SHA256/);
  assert.match(crypto, /CryptoEncoding\.HEX/);
  assert.doesNotMatch(crypto, /Math\.random/);
});

test('admin panel creates real Auth accounts and keeps invite service separate', () => {
  const inviteService = read('UserInviteService.js');
  const panel = read('AdminUsersPanel.js');
  const adminService = read('AdminUserService.js');
  assert.match(inviteService, /createUserInviteWithFirestore/);
  assert.match(inviteService, /listUserInvites/);
  assert.match(inviteService, /revokeUserInviteWithFirestore/);
  assert.match(panel, /createUserAccountWithoutFunctions\(form\)/);
  assert.match(panel, /listUserInvites\(\)/);
  assert.match(panel, /revokeUserInvite\(invite\.inviteId\)/);
  assert.match(panel, /secureTextEntry/);
  assert.match(adminService, /httpsCallable/);
  assert.match(adminService, /createUserAccount/);
  assert.doesNotMatch(panel, /createUserWithoutFunctions/);
  assert.doesNotMatch(panel, /deleteUserAccountWithoutFunctions/);
  assert.doesNotMatch(panel, /AsyncStorage|console\.log/);
});
