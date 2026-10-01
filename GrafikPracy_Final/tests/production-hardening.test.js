import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAssignPersonToDay,
  buildWeekDocument,
  serverTimestampMillis,
  addHourEpoch
} from '../scheduleEngine.js';
import {validateRolePerson} from '../functions/userValidation.js';

test('24h disabled blocks a second shift for the same person', () => {
  const day = [{person:'P'}, {person:null}];
  assert.equal(canAssignPersonToDay(day,'P',false), false);
  assert.equal(canAssignPersonToDay(day,'M',false), true);
});

test('24h enabled allows the same person on both shifts', () => {
  const day = [{person:'P'}, {person:null}];
  assert.equal(canAssignPersonToDay(day,'P',true), true);
});

test('24h mode does not bypass an unrelated empty-slot restriction', () => {
  const day = [{person:'M'}, {person:null}];
  assert.equal(canAssignPersonToDay(day,'P',true), true);
});

test('week documents are isolated by weekId', () => {
  const weekA = buildWeekDocument('2026-09-28', [{dayIndex:0,shifts:[{person:'P'}]}], {hours:10});
  const weekB = buildWeekDocument('2026-10-05', [{dayIndex:0,shifts:[{person:'M'}]}], {hours:12});
  assert.equal(weekA.weekId, '2026-09-28');
  assert.equal(weekB.weekId, '2026-10-05');
  assert.notDeepEqual(weekA.week, weekB.week);
  assert.equal(Object.hasOwn(weekA, 'weeks'), false);
  assert.equal(Object.hasOwn(weekB, 'weeks'), false);
});

test('invalid week identifiers are rejected before persistence', () => {
  assert.throws(() => buildWeekDocument('main', [], {}), /Invalid weekId/);
});

test('Firestore Timestamp freshness uses server time', () => {
  const timestamp = {toMillis: () => 1234567890};
  assert.equal(serverTimestampMillis(timestamp), 1234567890);
  assert.equal(serverTimestampMillis(123), 123);
  assert.equal(serverTimestampMillis(undefined), 0);
});

test('hourly notification stepping uses absolute epoch time', () => {
  const start = Date.UTC(2026, 9, 25, 0, 30);
  assert.equal(addHourEpoch(start) - start, 3600000);
  assert.equal(addHourEpoch(addHourEpoch(start)) - start, 7200000);
});

test('hourly stepping is independent of local DST transitions', () => {
  const before = Date.UTC(2026, 9, 25, 0, 30);
  const after = addHourEpoch(before);
  assert.equal(after - before, 3600000);
});

test('week payload cannot accidentally carry the complete multi-week state', () => {
  const payload = buildWeekDocument('2026-09-28', [{dayIndex:0,shifts:[{person:'P'}]}], {hours:12,rotation:'P'});
  assert.deepEqual(Object.keys(payload).sort(), ['config','week','weekId']);
});

test('admin role/person assignment contract is enforced server-side', () => {
  assert.equal(validateRolePerson('employee','P'), true);
  assert.equal(validateRolePerson('employee',''), false);
  assert.equal(validateRolePerson('locator',''), true);
  assert.equal(validateRolePerson('locator','P'), false);
  assert.equal(validateRolePerson('admin',''), true);
  assert.equal(validateRolePerson('admin','M'), false);
});
