import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAssignPersonToDay,
  buildWeekDocument,
  serverTimestampMillis,
  addHourEpoch
} from '../scheduleEngine.js';

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
  assert.throws(
    () => buildWeekDocument('main', [], {}),
    /Invalid weekId/
  );
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
  const payload = buildWeekDocument(
    '2026-09-28',
    [{dayIndex:0,shifts:[{person:'P'}]}],
    {hours:12,rotation:'P'}
  );
  assert.deepEqual(Object.keys(payload).sort(), ['config','week','weekId']);
});

test('runtime dashboards do not use interval-driven React tickers', async () => {
  const fs = await import('node:fs/promises');
  const paths = [
    '../Dashboard.js',
    '../NowDashboard.js',
    '../LiveLocationDashboard.js'
  ];
  for (const relative of paths) {
    const source = await fs.readFile(new URL(relative, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /setInterval\s*\(/);
    assert.match(source, /useSecondTicker\(/);
  }
});

test('shared ticker uses requestAnimationFrame and cancels on unmount', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../hooks/useSecondTicker.js', import.meta.url), 'utf8');
  assert.match(source, /requestAnimationFrame\(/);
  assert.match(source, /cancelAnimationFrame\(/);
});

test('schedule cloud persistence uses a fresh transaction snapshot and updates only dirty shift fields', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../AppRuntime.js', import.meta.url), 'utf8');
  assert.match(source, /const localMap\s*=\s*weekToShiftMap\(localWeek,weekKeyAtSave\)/);
  assert.match(source, /runTransaction\(db,\s*async tx\s*=>/);
  assert.match(source, /tx\.get\(scheduleRef\)/);
  assert.match(source, /transactionUpdate/);
  assert.match(source, /tx\.update\(scheduleRef,transactionUpdate\)/);
  assert.doesNotMatch(source, /tx\.set\(settingsRef/);
});

test('schedule listener ignores optimistic local snapshots and hydrates flat shift maps', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../AppRuntime.js', import.meta.url), 'utf8');
  assert.match(source, /includeMetadataChanges:true/);
  assert.match(source, /hasPendingWrites/);
  assert.match(source, /shiftMapToWeek/);
  assert.match(source, /weekToShiftMap/);
});
