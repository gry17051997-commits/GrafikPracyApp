const VALID_ROLES = new Set(['admin','employee','locator']);
const VALID_PERSON_KEYS = new Set(['P','M','L']);

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function validateEmail(email) {
  return email.length <= 254 && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}

export function validateDisplayName(value) {
  return value.length >= 2 && value.length <= 100;
}

export function validatePersonKey(value) {
  return value === '' || VALID_PERSON_KEYS.has(value);
}

export function validateRole(value) {
  return VALID_ROLES.has(value);
}

export function validateRolePerson(role, personKey) {
  if (!validateRole(role) || !validatePersonKey(personKey)) return false;
  if (role === 'employee') return VALID_PERSON_KEYS.has(personKey);
  return personKey === '';
}
