import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAssignPersonToDay,
  maxAdditionalAssignments,
  buildWeekDocument,
  isValidWeekId,
  isValidWeekIdMap,
  isValidScheduleWeekMap,
  isValidScheduleConditions,
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

test('24h capacity counts both shifts per day only when explicitly enabled', () => {
  const slots = Array.from({length:7},(_,dayIndex)=>[
    {dayIndex,shiftIndex:0},
    {dayIndex,shiftIndex:1}
  ]).flat();
  const isAvailable = () => true;

  assert.equal(maxAdditionalAssignments(slots,false,isAvailable),7);
  assert.equal(maxAdditionalAssignments(slots,true,isAvailable),14);
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

test('backup schedule validation rejects malformed week shapes and unknown assignees', () => {
  const emptyWeek = Array.from({length:7},(_,dayIndex)=>({
    dayIndex,
    shifts:[{person:null},{person:null}]
  }));
  assert.equal(isValidScheduleWeekMap({}), true);
  assert.equal(isValidScheduleWeekMap({'2026-09-28':emptyWeek}), true);
  assert.equal(isValidScheduleWeekMap({'bad-week':emptyWeek}), false);
  assert.equal(isValidScheduleWeekMap({'2026-09-28':emptyWeek.slice(1)}), false);
  assert.equal(isValidScheduleWeekMap({'2026-09-28':[
    {...emptyWeek[0],shifts:[{person:'admin'},{person:null}]},
    ...emptyWeek.slice(1)
  ]}), false);
  assert.equal(isValidScheduleWeekMap({'2026-09-28':[
    {...emptyWeek[0],dayIndex:1},
    ...emptyWeek.slice(1)
  ]}), false);
  assert.equal(isValidScheduleWeekMap({'2026-09-28':[
    {...emptyWeek[0],shifts:[{person:null,shift:2},{person:null,shift:1}]},
    ...emptyWeek.slice(1)
  ]}), false);
});

test('backup validation rejects unsafe or contradictory generator condition shapes', () => {
  assert.equal(isValidScheduleConditions([
    {type:'must',person:'L',dayIndex:6,shift:2},
    {type:'count',person:'P',value:'8'},
    {type:'off',person:null}
  ]), true);
  assert.equal(isValidScheduleConditions([{type:'must',person:'admin',dayIndex:0,shift:1}]), false);
  assert.equal(isValidScheduleConditions([{type:'must',person:'P',dayIndex:7,shift:1}]), false);
  assert.equal(isValidScheduleConditions([{type:'forbid',person:'P',dayIndex:0}]), false);
  assert.equal(isValidScheduleConditions([{type:'count',person:'P',value:15}]), false);
  assert.equal(isValidScheduleConditions([{type:'unknown',person:'P'}]), false);
});

test('invalid week identifiers are rejected before persistence', () => {
  assert.throws(
    () => buildWeekDocument('main', [], {}),
    /Invalid weekId/
  );
});

test('week identifiers and backup week maps reject impossible calendar dates', () => {
  assert.equal(isValidWeekId('2026-09-28'), true);
  assert.equal(isValidWeekId('2026-02-30'), false);
  assert.equal(isValidWeekId('2026-13-01'), false);
  assert.equal(isValidWeekIdMap({'2026-09-28':{hours:10}}), true);
  assert.equal(isValidWeekIdMap({'2026-02-30':{hours:10}}), false);
});

test('Central API timestamps use server time', () => {
  const timestamp = {toMillis: () => 1234567890};
  assert.equal(serverTimestampMillis(timestamp),1234567890);
  assert.equal(serverTimestampMillis(123),123);
  assert.equal(serverTimestampMillis(undefined),0);
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
  const blockStart = source.indexOf("const scheduleRef=doc(db,'schedules',weekKeyAtSave);");
  const blockEnd = source.indexOf("    },250);", blockStart);
  assert.ok(blockStart >= 0 && blockEnd > blockStart);
  const block = source.slice(blockStart, blockEnd);
  assert.match(block, /const localMap=weekToShiftMap\(localWeek,weekKeyAtSave\)/);
  assert.ok(block.includes('transactionUpdate[`shifts.${key}`]'));
  assert.ok(block.includes('runTransaction(db, async tx =>'));
  assert.ok(block.includes('tx.get(scheduleRef)'));
  assert.ok(block.includes('tx.update(scheduleRef,transactionUpdate)'));
  assert.doesNotMatch(block, /tx\.set\(settingsRef/);
});

test('schedule listener ignores optimistic local snapshots and hydrates flat shift maps', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../AppRuntime.js', import.meta.url), 'utf8');
  assert.match(source, /includeMetadataChanges:true/);
  assert.match(source, /hasPendingWrites/);
  assert.match(source, /shiftMapToWeek/);
  assert.match(source, /weekToShiftMap/);
});

test('GPS stop failures prevent logout/reset from clearing its local assignment', async () => {
  const fs = await import('node:fs/promises');
  const service = await fs.readFile(new URL('../LocationService.js', import.meta.url), 'utf8');
  const app = await fs.readFile(new URL('../AppRuntime.js', import.meta.url), 'utf8');
  const stopStart = service.indexOf('export async function stopVehicleLocationTracking()');
  const stopEnd = service.indexOf('export async function ensureVehicleLocationTracking()', stopStart);
  const stopBlock = service.slice(stopStart, stopEnd);
  assert.match(stopBlock, /await Location\.stopLocationUpdatesAsync\(LOCATION_TASK_NAME\)/);
  assert.doesNotMatch(stopBlock, /catch\s*\(/);

  const resetStart = app.indexOf('const resetAll = () => {');
  const resetEnd = app.indexOf('const buildBackupPayload =', resetStart);
  const resetBlock = app.slice(resetStart, resetEnd);
  assert.match(resetBlock, /await stopVehicleLocationTracking\(\)/);
  assert.match(resetBlock, /await cancelReportNotifications\(\)/);
  assert.match(resetBlock, /Nie udało się bezpiecznie zatrzymać GPS lub powiadomień/);
  assert.match(resetBlock, /return;/);
  const cancelStart = app.indexOf('const cancelReportNotifications = async () => {');
  const cancelEnd = app.indexOf('const scheduleReportNotifications = async () => {', cancelStart);
  const cancelBlock = app.slice(cancelStart, cancelEnd);
  assert.match(cancelBlock, /if \(Platform\.OS !== 'web'\)/);
  assert.match(cancelBlock, /AsyncStorage\.removeItem\(REPORT_NOTIFICATION_IDS_KEY\)/);
});

test('local schedule persistence is serialized and surfaces storage failures', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../AppRuntime.js', import.meta.url), 'utf8');
  assert.match(source, /const localSaveQueueRef = useRef\(Promise\.resolve\(\)\)/);
  assert.match(source, /localSaveQueueRef\.current = localSaveQueueRef\.current\s*\.then\(\(\) => AsyncStorage\.setItem\(KEY,JSON\.stringify\(data\)\)\)/);
  assert.match(source, /console\.error\('Nie udało się zapisać lokalnego grafiku:', error\)/);
  assert.match(source, /setLocalStorageError\('Nie udało się zapisać grafiku na tym urządzeniu\.'\)/);
  assert.match(source, /⚠️ \{localStorageError\}/);
});

test('shared generator settings and recovery ledger persist through the central API store', () => {
  const app = fs.readFileSync(new URL('../AppRuntime.js', import.meta.url), 'utf8');
  assert.match(app,/from '\.\/apiClient'/);
  assert.ok(app.includes("setDoc(doc(db,'settings','main')"));
  assert.doesNotMatch(app,/from ['"]firebase\/firestore/);
});

test('GPS dashboards use the central API instead of Firestore', () => {
  const dashboard = fs.readFileSync(new URL('../LiveLocationDashboard.js', import.meta.url), 'utf8');
  const now = fs.readFileSync(new URL('../NowDashboard.js', import.meta.url), 'utf8');
  assert.match(dashboard,/from '\.\/apiClient'/);
  assert.match(now,/from '\.\/apiClient'/);
  assert.doesNotMatch(dashboard,/firebase\/firestore/);
  assert.doesNotMatch(now,/firebase\/firestore/);
});

test('GPS tracking requires a central device assignment and sends positions through the central API', async () => {
  const fs = await import('node:fs/promises');
  const service = await fs.readFile(new URL('../LocationService.js', import.meta.url), 'utf8');
  assert.match(service, /const getDeviceAssignment=async token=>/);
  assert.match(service, /fetch\(API_BASE_URL+'\\/gps\\/device'/);
  assert.match(service, /if\(!assignment\?\.vehicleId\)return\{ok:false,reason:'device-not-assigned'\}/);
  assert.match(service, /apiPostGps\(payload,deviceToken\)/);
  assert.match(service, /normalizeVehicleId\(assignment\.vehicleId\)/);
});

test('fleet assignment UI uses locator uid consistently', async () => {
  const fs = await import('node:fs/promises');
  const panel = await fs.readFile(new URL('../AdminFleetPanel.js', import.meta.url), 'utf8');
  assert.match(panel, /if\(!v\?\.id\|\|!p\?\.id\|\|!u\?\.uid\)/);
  assert.match(panel, /userId:u\.uid/);
  assert.match(panel, /a\.user_id===u\.uid/);
  assert.match(panel, /key=\{u\.uid\}/);
});
test('App.js stays a thin wrapper and cannot substitute static runtime fixtures', async () => {
  const fs = await import('node:fs/promises');
  const app = await fs.readFile(new URL('../App.js', import.meta.url), 'utf8');
  assert.match(app, /import AppRuntime from '\.\/AppRuntime'/);
  assert.match(app, /return <AppRuntime \/>/);
  assert.doesNotMatch(app, /export const/);
});

test('admin account controls use the central API and never Firebase Auth or Functions', () => {
  const service = fs.readFileSync(new URL('../AdminUserService.js', import.meta.url), 'utf8');
  assert.match(service,/api\('/users'/);
  assert.match(service,/api\('/users\/'+encodeURIComponent\(uid\)/);
  assert.doesNotMatch(service,/firebase\/auth/);
  assert.doesNotMatch(service,/httpsCallable|callable\(/);
});

test('admin role switching clears incompatible employee assignment in the UI', async () => {
  const panel = fs.readFileSync(new URL('../AdminUsersPanel.js', import.meta.url), 'utf8');
  assert.match(panel, /role==='employee'\?f\.personKey:''/);
  assert.match(panel, /u\.role==='employee'\?\(u\.personKey\|\|'\'\)':''/);
  assert.match(panel, /DEZAKTYWUJ/);
});



test('central API configuration is enabled and Firebase packages are absent', () => {
  const config = fs.readFileSync(new URL('../firebaseConfig.js', import.meta.url), 'utf8');
  const lock = fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8');
  assert.match(config, /CENTRAL_API_ENABLED\s*=\s*true/);
  assert.doesNotMatch(config, /firebase\/firestore|firebase\/auth/);
  assert.doesNotMatch(lock, /"node_modules\/firebase"/);
});

test('central backend protects document writes with revision checks', () => {
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  assert.match(server, /expectedRevision/);
  assert.match(server, /REVISION_CONFLICT/);
  assert.match(server, /AND revision=\$5 RETURNING \*/);
});

test('central backend supports administrator removal of GPS phones', () => {
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  assert.match(server, /app\.delete\('\/api\/phones\/:id',auth,admin/);
  assert.match(server, /PHONE_NOT_FOUND/);
});

test('central document store rejects arbitrary collection names', () => {
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  assert.match(server, /STORE_COLLECTIONS=new Set/);
  assert.match(server, /!STORE_COLLECTIONS\.has\(name\)/);
});

test('GPS uploads have a finite timeout and always release the timeout timer', () => {
  const source = fs.readFileSync(new URL('../apiClient.js', import.meta.url), 'utf8');
  const start = source.indexOf('export async function apiPostGps(');
  const end = source.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /new AbortController\(\)/);
  assert.match(block, /setTimeout\(/);
  assert.match(block, /12000/);
  assert.match(block, /controller\.abort\(\)/);
  assert.match(block, /Promise\.race\(\[request,timeout\]\)/);
  assert.match(block, /clearTimeout\(timeoutId\)/);
  assert.match(block, /GPS_API_TIMEOUT/);
});
