export const USER_INVITE_ROLES = Object.freeze(['admin', 'employee', 'locator']);
export const USER_INVITE_PERSON_KEYS = Object.freeze(['P', 'M', 'L']);
export const MAX_USER_INVITE_DAYS = 30;

export function validateUserInviteInput(input) {
  const email = String(input?.email || '').trim().toLowerCase();
  const displayName = String(input?.displayName || '').trim();
  const role = String(input?.role || '').trim();
  const personKey = String(input?.personKey || '').trim();
  const expiresInDays = input?.expiresInDays ?? 7;

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Podaj prawidłowy adres e-mail zaproszenia.');
  }
  if (displayName.length < 2 || displayName.length > 100) {
    throw new Error('Imię i nazwisko musi mieć od 2 do 100 znaków.');
  }
  if (!USER_INVITE_ROLES.includes(role)) {
    throw new Error('Nieprawidłowa rola zaproszenia.');
  }
  if (role === 'employee' && !USER_INVITE_PERSON_KEYS.includes(personKey)) {
    throw new Error('Pracownik musi mieć przypisane P/M/L.');
  }
  if (role !== 'employee' && personKey !== '') {
    throw new Error('Administrator i lokalizator nie mogą mieć przypisanego P/M/L.');
  }
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > MAX_USER_INVITE_DAYS) {
    throw new Error(`Zaproszenie może wygasać za 1–${MAX_USER_INVITE_DAYS} dni.`);
  }

  return {email, displayName, role, personKey, expiresInDays};
}

export function buildUserInviteDocument(input, {createdBy, expiresAt, serverTimestamp}) {
  const validated = validateUserInviteInput(input);
  if (!createdBy) throw new Error('Brak identyfikatora administratora.');
  if (!expiresAt) throw new Error('Brak terminu wygaśnięcia zaproszenia.');
  if (typeof serverTimestamp !== 'function') throw new Error('Brak generatora server timestamp.');

  return {
    email: validated.email,
    displayName: validated.displayName,
    role: validated.role,
    personKey: validated.personKey,
    status: 'pending',
    expiresAt,
    createdAt: serverTimestamp(),
    createdBy,
    claimedBy: null,
    claimedAt: null
  };
}
