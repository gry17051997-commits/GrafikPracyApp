import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = file => fs.readFileSync(path.join(root,file),'utf8');

test('entrypoint delegates application rendering to AppRuntime', () => {
  const app = read('App.js');
  assert.match(app, /import AppRuntime from ['"]\.\/AppRuntime['"]/);
  assert.match(app, /return <AppRuntime \/>/);
});

test('native lifecycle registrations remain in global entrypoint scope', () => {
  const index = read('index.js');
  const location = read('LocationService.js');
  assert.match(index, /import ['"]\.\/LocationService['"]/);
  assert.match(index, /Notifications\.setNotificationHandler\(/);
  assert.match(location, /TaskManager\.defineTask\(LOCATION_TASK_NAME/);
  assert.doesNotMatch(location, /defineTask\([^)]*\)[\\s\\S]*useEffect/);
});

test('notification handler is configured globally before React root registration', () => {
  const index = read('index.js');
  assert.ok(index.indexOf('Notifications.setNotificationHandler') < index.indexOf('registerRootComponent'));
});

test('GPS payload carries authenticated locator identity', () => {
  const service = read('LocationService.js');
  assert.match(service, /locatorUid:ownerUid/);
  assert.match(service, /expectedUid/);
  assert.match(service, /ownerUid=await waitForAuthenticatedUser/);
  assert.match(service, /auth\?\.currentUser\?\.uid!==ownerUid/);
});

test('GPS startup validates central vehicle assignment and locator account', () => {
  const service = read('LocationService.js');
  assert.match(service, /doc\(db,'locationConfig','main'\)/);
  assert.match(service, /centralLocatorUid/);
  assert.match(service, /centralLocatorUid !== ownerUid/);
  assert.match(service, /reason:'not-assigned'/);
});

test('GPS watchdog revalidates remote assignment and distinguishes permission failures', () => {
  const service = read('LocationService.js');
  assert.match(service, /remote\.locatorUid/);
  assert.match(service, /foreground-permission/);
  assert.match(service, /background-permission/);
  assert.match(service, /location-services-disabled/);
});

test('GPS background task is idempotent and serialized', () => {
  const service = read('LocationService.js');
  assert.match(service, /TaskManager\.isTaskDefined\(LOCATION_TASK_NAME\)/);
  assert.match(service, /let locationSaveQueue = Promise\.resolve\(\)/);
  assert.match(service, /locationSaveQueue = run\.catch/);
});

test('GPS history cleanup is server-side and limited to seven days', () => {
  const functions = read('functions/index.js');
  assert.match(functions, /cleanupVehicleLocationHistory/);
  assert.match(functions, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(functions, /collection\('locations'\)/);
});

test('Firestore restricts vehicle writes to the assigned locator', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /role == 'locator'/);
  assert.match(rules, /(?:locationConfig\(\)|locCfg\(\))\.get\('locatorUid'/);
  assert.match(rules, /(?:locationConfig\(\)|locCfg\(\))\.get\('locatorUid'/);
  assert.match(rules, /request\.resource\.data\.ownerUid == request\.auth\.uid/);
});

test('Firestore keeps locator accounts outside employee person assignments', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /validRolePerson/);
  assert.match(rules, /role == 'employee'/);
  assert.match(rules, /role != 'employee'/);
});

test('administrator user provisioning validates role and employee identity', () => {
  const service = read('AdminUserService.js');
  assert.match(service, /role === 'employee'/);
  assert.match(service, /role !== 'employee'/);
  assert.match(service, /\['employee','locator','admin'\]/);
});

test('admin user UI supports locator role without assigning P/M/L', () => {
  const panel = read('AdminUsersPanel.js');
  assert.match(panel, /ROLES=\['employee','locator','admin'\]/);
  assert.match(panel, /role==='locator'/);
  assert.match(panel, /personKey/);
});

test('schedule engine enforces person assignment constraints', () => {
  const engine = read('scheduleEngine.js');
  assert.match(engine, /canAssignPersonToDay/);
  assert.match(engine, /24/);
  assert.match(engine, /buildWeekDocument/);
  assert.match(engine, /Invalid weekId/);
});

test('cloud schedule persistence uses transactions and flat shift keys', () => {
  const runtime = read('AppRuntime.js');
  assert.match(runtime, /runTransaction\(db/);
  assert.match(runtime, /shifts\./);
  assert.match(runtime, /weekKeyAtSave/);
  assert.match(runtime, /includeMetadataChanges:true/);
});

test('dashboard tickers do not use interval-driven React loops', () => {
  for (const file of ['Dashboard.js','NowDashboard.js','LiveLocationDashboard.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /setInterval\s*\(/);
  }
  const ticker = read('hooks/useSecondTicker.js');
  assert.match(ticker, /requestAnimationFrame\(/);
  assert.match(ticker, /cancelAnimationFrame\(/);
});

test('Android widget entrypoints are isolated from React screen lifecycle', () => {
  const widgetHandler = read('widget-task-handler.js');
  const widgets = read('widgets.js');
  assert.match(widgetHandler, /widgetTaskHandler/);
  assert.match(widgetHandler, /renderWidget/);
  assert.match(widgets, /GrafikTerazWidget/);
  assert.match(widgets, /GrafikAutoWidget/);
  assert.match(widgets, /GrafikRaportWidget/);
});

test('package installation does not mutate production source', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.postinstall, undefined);
  assert.equal(fs.existsSync(path.join(root,'scripts','fix-app-build.js')), false);
  assert.equal(fs.existsSync(path.join(root,'scripts','fix-chat-build.js')), false);
  assert.equal(fs.existsSync(path.join(root,'scripts','fix-rotation-switch.js')), false);
});

test('CI no longer contains source-mutating build patch commands', () => {
  const workflows = fs.readdirSync(path.join(root,'../.github/workflows')).map(name =>
    fs.readFileSync(path.join(root,'../.github/workflows',name),'utf8')
  ).join('\n');
  assert.doesNotMatch(workflows, /scripts\/fix-app-build\.js/);
  assert.doesNotMatch(workflows, /scripts\/fix-chat-build\.js/);
  assert.doesNotMatch(workflows, /scripts\/fix-rotation-switch\.js/);
});

test('Expo configuration declares background location and notification plugins', () => {
  const app = JSON.parse(read('app.json'));
  assert.ok(Array.isArray(app.expo.plugins));
  assert.ok(app.expo.plugins.some(p => p === 'expo-notifications'));
  assert.ok(app.expo.plugins.some(p => Array.isArray(p) && p[0] === 'expo-location'));
  assert.equal(app.expo.android.permissions.includes('android.permission.ACCESS_BACKGROUND_LOCATION'), true);
  assert.equal(app.expo.android.permissions.includes('android.permission.FOREGROUND_SERVICE_LOCATION'), true);
});
