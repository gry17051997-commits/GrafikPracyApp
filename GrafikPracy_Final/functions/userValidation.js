const VALID_ROLES = new Set(['admin','employee','locator']);
const VALID_PERSON_KEYS = new Set(['P','M','L']);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateEmail(email) {
  return email.length <= 254 && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}

function validateDisplayName(value) {
  return value.length >= 2 && value.length <= 100;
}

function validatePersonKey(value) {
  return value === '' || VALID_PERSON_KEYS.has(value);
}

function validateRole(value) {
  return VALID_ROLES.has(value);
}

function validateRolePerson(role, personKey) {
  if (!validateRole(role) || !validatePersonKey(personKey)) return false;
  if (role === 'employee') return VALID_PERSON_KEYS.has(personKey);
  return personKey === '';
}

module.exports = {normalizeEmail,validateEmail,validateDisplayName,validatePersonKey,validateRole,validateRolePerson};
