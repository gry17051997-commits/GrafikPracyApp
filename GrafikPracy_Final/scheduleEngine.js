function canAssignPersonToDay(dayShifts, person, allow24h) {
  if (allow24h) return true;
  return !(Array.isArray(dayShifts) && dayShifts.some(shift => shift?.person === person));
}

function buildWeekDocument(weekId, week, config) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekId))) {
    throw new Error('Invalid weekId');
  }
  return {
    weekId: String(weekId),
    week: Array.isArray(week) ? week : [],
    config: config && typeof config === 'object' ? config : {}
  };
}

function serverTimestampMillis(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return 0;
}

function addHourEpoch(timestampMs) {
  return Number(timestampMs) + 3600000;
}

module.exports = {
  canAssignPersonToDay,
  buildWeekDocument,
  serverTimestampMillis,
  addHourEpoch
};
