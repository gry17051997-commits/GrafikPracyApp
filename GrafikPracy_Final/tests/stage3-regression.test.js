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
  assert.match(rules, /resource\.data\.ownerUid == request\.auth\.uid/);
});

test('Firestore rules keep role escalation and self-delete blocked', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /uid != request\.auth\.uid/);
  assert.match(rules, /allow delete: if false;/);
  assert.match(rules, /request\.resource\.data\.role == 'employee'/);
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

test('schedule notification date calculation uses stored Monday weeks without shifting days twice', () => {
  const app = read('App.js');
  assert.match(app, /for \(let weekOffset = 0; weekOffset < 2; weekOffset\+\+\)/);
  assert.match(app, /const weekStart = addDays\(startDay,weekOffset \* 7\);/);
  assert.match(app, /const key = iso\(weekStart\);/);
  assert.match(app, /const shiftDate = addDays\(weekStart,di\);/);
});

test('schedule generator keeps weekday rotation while Sunday Łukasz is supplied by editable MUST defaults', () => {
  const app = read('App.js');
  assert.match(app, /const pairs = \[/);
  assert.doesNotMatch(app, /w\[6\]\.shifts\[0\]\.person = 'L'/);
  assert.doesNotMatch(app, /w\[6\]\.shifts\[1\]\.person = 'L'/);
  assert.match(app, /id:'default-sunday-l-1',type:'must',person:'L',dayIndex:6,shift:1/);
  assert.match(app, /id:'default-sunday-l-2',type:'must',person:'L',dayIndex:6,shift:2/);
});

test('GPS dashboards never silently switch to another vehicle when an assigned transmitter is stale', () => {
  const live = read('LiveLocationDashboard.js');
  const now = read('NowDashboard.js');
  assert.match(live, /const selected=requestedId \? \(exactFresh \? exact : exact \|\| null\)/);
  assert.match(now, /const selected=requested \? \(\(exact&&Date\.now\(\)-Number\(exact\.updatedAt\)<=180000\)\?exact:exact\|\|null\)/);
});

test('Web deployment uses the lockfile for deterministic dependency installation', () => {
  const workflow = read('../.github/workflows/web.yml');
  assert.match(workflow, /run: npm ci --ignore-scripts/);
});

test('bottom navigation stays usable on narrow screens', () => {
  const app = read('../App.js');
  assert.match(app, /<ScrollView\s+horizontal[\s\S]*?contentContainerStyle=\{S\.navScroll\}/);
  assert.match(app, /navBtn:\{width:82,minWidth:82/);
  assert.match(app, /navText:\{color:'#aab3c2'.*fontSize:11/);
});

test('weekly totals use the configured hours for the displayed week', () => {
  const app = read('../App.js');
  assert.match(app, /const currentWeekHours = currentWeekConfig\.hours \|\| hours/);
  assert.match(app, /result\.all\.hours \+= currentWeekHours/);
  assert.match(app, /result\.all\.money \+= RATES\[currentWeekHours\]/);
  assert.match(app, /result\[s\.person\]\.hours \+= currentWeekHours/);
  assert.match(app, /result\[s\.person\]\.money \+= RATES\[currentWeekHours\]/);
  assert.match(app, /shiftTime\(currentWeekTimes,s\.shift\)/);
});

test('web and Android acceptance surfaces remain wired', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies.expo, '~54.0.0');
  assert.equal(pkg.dependencies.react, '19.1.0');
  assert.equal(pkg.dependencies['react-native'], '0.81.5');
  assert.equal(pkg.scripts.web, 'expo start --web');
  assert.equal(pkg.scripts.android, 'expo start --android');
});


test('advanced generator treats person-specific OFF as a candidate restriction and detects conflicting MUST rules', () => {
  const app = read('App.js');
  assert.match(app, /c\.type==='off' && !c\.person && conditionApplies\(c,''/);
  assert.match(app, /const mustErrors=\[\];/);
  assert.match(app, /sprzeczne MUST/);
  assert.match(app, /ma jednocześnie OFF i MUST/);
  assert.match(app, /ma jednocześnie FORBID i MUST/);
  assert.match(app, /if\(mustErrors\.length \|\| unmet\.length \|\| forbiddenBroken\.length\)/);
});


test('main schedule requires authentication for reads', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /match \/schedules\/main \{\s*allow read: if signedIn\(\);/);
  assert.doesNotMatch(rules, /match \/schedules\/main \{\s*allow read: if true;/);
});

test('GPS history writes are serialized to prevent concurrent duplicate-history races', () => {
  const service = read('LocationService.js');
  assert.match(service, /let locationSaveQueue = Promise\.resolve\(\);/);
  assert.match(service, /const run = locationSaveQueue\.then\(\(\) => saveLocationInternal\(location\)\);/);
  assert.match(service, /locationSaveQueue = run\.catch\(\(\) => \{\}\);/);
});

test('Android widget refreshes are debounced', () => {
  const app = read('App.js');
  assert.match(app, /const widgetUpdateTimerRef = useRef\(null\);/);
  assert.match(app, /clearTimeout\(widgetUpdateTimerRef\.current\)/);
  assert.match(app, /widgetUpdateTimerRef\.current = setTimeout\(async \(\) =>/);
});

test('report notifications use each stored week configuration', () => {
  const app = read('App.js');
  assert.match(app, /const weekTimes = weekConfigs\[key\]\?\.times/);
  assert.match(app, /DEFAULT_TIMES\[weekConfigs\[key\]\?\.hours \|\| hours\]/);
});


test('Sunday 24h for Łukasz is an editable default MUST rule, not hardcoded in generateWeek', () => {
  const app = read('App.js');
  assert.doesNotMatch(app, /w\[6\]\.shifts\[0\]\.person\s*=\s*'L'/);
  assert.doesNotMatch(app, /w\[6\]\.shifts\[1\]\.person\s*=\s*'L'/);
  assert.match(app, /id:'default-sunday-l-1',type:'must',person:'L',dayIndex:6,shift:1/);
  assert.match(app, /id:'default-sunday-l-2',type:'must',person:'L',dayIndex:6,shift:2/);
  assert.match(app, /setConditions\(\[/);
});

test('Changing hours in the schedule view does not mutate global hours or times', () => {
  const app = read('App.js');
  const start = app.indexOf('const changeHours = h => {');
  const end = app.indexOf('\n  };', start);
  const block = app.slice(start, end);
  assert.doesNotMatch(block, /setHours\(h\)/);
  assert.doesNotMatch(block, /setTimes\(DEFAULT_TIMES\[h\]\)/);
  assert.match(block, /setWeekConfigs/);
});


test('advanced generator never overwrites manual or locked assignments', () => {
  const app = read('App.js');
  assert.match(app, /if \(dayHasPassed\(di\) \|\| s\.locked \|\| s\.manual\) return;/);
  assert.match(app, /if \(dayHasPassed\(di\) \|\| s\.locked \|\| s\.manual\) return;/);
  assert.match(app, /MUST dla \$\{PEOPLE\[c\.person\]\.name\} koliduje z istniejącą blokadą/);
});

test('advanced generator validates existing assignments against hard OFF and FORBID rules', () => {
  const app = read('App.js');
  assert.match(app, /jest obsadzony mimo globalnego OFF/);
  assert.match(app, /ma OFF przy istniejącej obsadzie/);
  assert.match(app, /łamie NIE MOŻE/);
});

test('weekly totals read the displayed week hours instead of global hours', () => {
  const app = read('App.js');
  assert.match(app, /result\.all\.hours \+= currentWeekHours/);
  assert.match(app, /result\.all\.money \+= RATES\[currentWeekHours\]/);
});


test('OFF without replacement remains an auto-fillable vacancy and remembers its original owner', () => {
  const app = read('App.js');
  assert.match(app, /s\.off\s*===\s*true/);
  assert.match(app, /s\.person\s*===\s*null/);
  assert.match(app, /offOriginalPerson/);
  assert.match(app, /recoverPerson/);
});

test('generator never assigns the original owner back into their own OFF vacancy', () => {
  const app = read('App.js');
  assert.match(app, /slot\.offOriginalPerson/);
  assert.match(app, /person === slot\.offOriginalPerson/);
});

test('replacement on an OFF shift remains manual and is not overwritten by generation', () => {
  const app = read('App.js');
  assert.match(app, /sh\.person=offReplacement \|\| null/);
  assert.match(app, /sh\.manual=true/);
});


test('recover debt does not grow from already locked or historical replacement shifts', () => {
  const app = read('App.js');
  assert.match(app, /const baseTargetCounts/);
  assert.match(app, /generateWeek(currentWeekConfig\.rotation \|\| rotation,currentWeekWarehouse)/);
  assert.doesNotMatch(app, /targets\[p\]=Math\.max\(targets\[p\]===null\?counts\[p\]:targets\[p\],counts\[p\]\+recoverNeeds\[p\]\)/);
});

test('recover target is based on the clean weekly template plus one recovery debt', () => {
  const app = read('App.js');
  assert.match(app, /const baseTarget = targets\[p\]===null\?baseTargetCounts\[p\]:targets\[p\]/);
  assert.match(app, /targets\[p\]=baseTarget\+recoverNeeds\[p\]/);
});
