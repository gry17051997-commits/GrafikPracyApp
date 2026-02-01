function canAssignPersonToDay(dayShifts, person, allow24h) {
  if (allow24h) return true;
  return !(Array.isArray(dayShifts) && dayShifts.some(shift => shift?.person === person));
}

function maxAdditionalAssignments(slots, allow24h) {
  const capacity = new Set();
  for (const slot of slots) {
    capacity.add(allow24h ? `${slot.dayIndex}-${slot.shiftIndex}` : slot.dayIndex);
  }
  return capacity.size;
}

function buildWeekDocument(weekId, week, config) {
  if (!isValidWeekId(String(weekId))) {
    throw new Error('Invalid weekId');
  }
  return {
    weekId: String(weekId),
    week: Array.isArray(week) ? week : [],
    config: config && typeof config === 'object' ? config : {}
  };
}

function isValidWeekId(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidScheduleWeekMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([weekId, week]) => (
    isValidWeekId(weekId)
    && Array.isArray(week)
    && week.length === 7
    && week.every((day, dayIndex) => (
      day
      && typeof day === 'object'
      && (day.dayIndex === undefined || day.dayIndex === dayIndex)
      && Array.isArray(day.shifts)
      && day.shifts.length === 2
      && day.shifts.every((shift, shiftIndex) => (
        shift
        && typeof shift === 'object'
        && (shift.person == null || ['P', 'M', 'L'].includes(shift.person))
        && (shift.shift === undefined || shift.shift === shiftIndex + 1)
        && (shift.manual === undefined || typeof shift.manual === 'boolean')
        && (shift.locked === undefined || typeof shift.locked === 'boolean')
      ))
    ))
  ));
}

function isValidWeekIdMap(value) {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).every(isValidWeekId);
}

function isValidScheduleConditions(value) {
  if (!Array.isArray(value)) return false;
  return value.every(condition => {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return false;
    if (!['count', 'must', 'off', 'forbid', 'prefer'].includes(condition.type)) return false;
    if (!['P', 'M', 'L'].includes(condition.person) && !(condition.type === 'off' && condition.person == null)) return false;
    if (condition.type === 'count') {
      const count = Number(condition.value);
      return Number.isInteger(count) && count >= 0 && count <= 14;
    }
    if (condition.dayIndex !== undefined && (!Number.isInteger(Number(condition.dayIndex)) || Number(condition.dayIndex) < 0 || Number(condition.dayIndex) > 6)) return false;
    if (condition.shift !== undefined && (!Number.isInteger(Number(condition.shift)) || Number(condition.shift) < 1 || Number(condition.shift) > 2)) return false;
    return condition.type === 'off'
      || (condition.dayIndex !== undefined && condition.shift !== undefined);
  });
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
  maxAdditionalAssignments,
  buildWeekDocument,
  isValidWeekId,
  isValidWeekIdMap,
  isValidScheduleWeekMap,
  isValidScheduleConditions,
  serverTimestampMillis,
  addHourEpoch
};
