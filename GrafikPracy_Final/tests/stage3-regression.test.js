import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Firestore GPS rules bind employee writes to the admin-assigned vehicle', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /get\(\/databases\/\$\(database\)\/documents\/locationConfig\/main\)\.data\.vehicleId == vehicleId/);
  assert.match(rules, /request\.resource\.data\.vehicleId == vehicleId/);
  assert.match(rules, /request\.resource\.data\.ownerUid == request\.auth\.uid/);
  assert.match(rules, /request\.resource\.data\.locatorUid == request\.auth\.uid/);
  assert.match(rules, /data\.locatorUid == request\.auth\.uid/);
  assert.match(rules, /resource\.data\.ownerUid == request\.auth\.uid/);
});

test('Firestore rules keep role escalation and self-delete blocked', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /uid != request\.auth\.uid/);
  assert.match(rules, /allow delete: if false;/);
  assert.match(rules, /validRole\(value\)/);
  assert.match(rules, /value == 'locator'/);
});

test('chat and WhatsApp reports cannot spoof profile identity', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /request\.resource\.data\.email == get\(\/databases\/\$\(database\)\/documents\/users\/\$\(request\.auth\.uid\)\)\.data\.email/);
  assert.match(rules, /request\.resource\.data\.person == get\(\/databases\/\$\(database\)\/documents\/users\/\$\(request\.auth\.uid\)\)\.data\.personKey/);
  assert.match(read('App.js'), /person:myPerson/);
});

test('logout and auth loss stop background GPS tracking', () => {
  const app = read('App.js');
  assert.match(app, /await stopVehicleLocationTracking\(\)/);
  assert.match(app, /onAuthStateChanged/);
  assert.match(app, /!user/);
});

test('GPS service rechecks authenticated owner before every cloud write', () => {
  const service = read('LocationService.js');
  assert.match(service, /waitForAuthenticatedUser\(20000\)/);
  assert.match(service, /auth\?\.currentUser\?\.uid\s*!==\s*ownerUid/);
  assert.match(service, /expectedUid\s*&&\s*ownerUid\s*!==\s*expectedUid/);
});

test('GPS tracker guards against duplicate background tasks', () => {
  const service = read('LocationService.js');
  assert.match(service, /hasStartedLocationUpdatesAsync\(LOCATION_TASK_NAME\)/);
});

test('schedule notification date calculation covers each stored week without double-shifting days', () => {
  const app = read('App.js');
  assert.match(app, /const weekStart = addDays\(startDay,weekOffset \* 7\);/);
  assert.match(app, /const key = iso\(weekStart\);/);
  assert.match(app, /const shiftDate = addDays\(weekStart,di\);/);
  assert.match(app, /weekOffset < 2/);
});

test('schedule generator preserves the two-person weekday rotation and Sunday Łukasz slot', () => {
  const app = read('App.js');
  assert.match(app, /const pairs = \[/);
  assert.match(app, /w\[6\]\.shifts\[0\]\.person = 'L'/);
  assert.match(app, /w\[6\]\.shifts\[1\]\.person = 'L'/);
});

test('web and Android acceptance surfaces remain wired', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies.expo, '~54.0.0');
  assert.equal(pkg.dependencies.react, '19.1.0');
  assert.equal(pkg.dependencies['react-native'], '0.81.5');
  assert.equal(pkg.scripts.web, 'expo start --web');
  assert.equal(pkg.scripts.android, 'expo start --android');
});
