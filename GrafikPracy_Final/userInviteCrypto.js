import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytesAsync
} from 'expo-crypto';

const INVITE_TOKEN_BYTES = 32;
const INVITE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function bytesToHex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

export async function generateUserInviteCredentials() {
  const bytes = await getRandomBytesAsync(INVITE_TOKEN_BYTES);
  if (!(bytes instanceof Uint8Array) || bytes.length !== INVITE_TOKEN_BYTES) {
    throw new Error('Nie udało się wygenerować bezpiecznego tokenu zaproszenia.');
  }

  const token = bytesToHex(bytes);
  const inviteId = await digestStringAsync(CryptoDigestAlgorithm.SHA256, token, {
    encoding: CryptoEncoding.HEX
  });
  if (!INVITE_TOKEN_PATTERN.test(token) || !INVITE_TOKEN_PATTERN.test(inviteId)) {
    throw new Error('Nieprawidłowy token zaproszenia.');
  }

  return {token, inviteId};
}

export async function hashUserInviteToken(token) {
  if (typeof token !== 'string' || !INVITE_TOKEN_PATTERN.test(token)) {
    throw new Error('Nieprawidłowy token zaproszenia.');
  }
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, token, {
    encoding: CryptoEncoding.HEX
  });
}
