import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const appRoot = fs.existsSync(path.join(cwd, 'GrafikPracy_Final', 'App.js'))
  ? path.join(cwd, 'GrafikPracy_Final')
  : fs.existsSync(path.join(cwd, 'App.js'))
    ? cwd
    : path.join(cwd, 'GrafikPracy_Final');

const read = file => {
  const normalized = file.replace(/^\.\.\//, '');
  const candidates = [
    path.join(appRoot, normalized),
    path.join(cwd, normalized),
    path.join(cwd, 'GrafikPracy_Final', normalized)
  ];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) throw new Error(`Test fixture not found: ${file}`);
  return fs.readFileSync(found, 'utf8');
};

test('Firestore GPS rules bind employee writes to the admin-assigned vehicle', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /get\(\/databases\/\$\(database\)\/documents\/locationConfig\/main\)\.data\.vehicleId == vehicleId/);
  assert.match(rules, /request\.resource\.data\.vehicleId == vehicleId/);
  assert.match(rules, /request\.resource\.data\.ownerUid == request\.auth\.uid/);
  assert.match(rules, /resource\.data\.ownerUid == request\.auth\.uid/);
  assert.match(rules, /allow read: if isAdmin\(\)\s*\n\s*\|\| \(signedIn\(\)/);
  assert.match(rules, /locationConfig\/main\).*vehicleId == vehicleId/);
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

test('Android location config enables background and location foreground service permissions', () => {
  const config = read('app.json');
  assert.match(config, /"android\.permission\.ACCESS_BACKGROUND_LOCATION"/);
  assert.match(config, /"android\.permission\.FOREGROUND_SERVICE"/);
  assert.match(config, /"android\.permission\.FOREGROUND_SERVICE_LOCATION"/);
  assert.match(config, /"isAndroidBackgroundLocationEnabled": true/);
  assert.match(config, /"isAndroidForegroundServiceEnabled": true/);
  assert.match(config, /"isAndroidForegroundServiceEnabled": true/);
  const service = read('LocationService.js');
  assert.match(service, /killServiceOnDestroy:\s*false/);
});

test('GPS tracker guards against duplicate background tasks', () => {
  const service = read('LocationService.js');
  assert.match(service, /hasStartedLocationUpdatesAsync\(LOCATION_TASK_NAME\)/);
});

test('GPS history cleanup is deterministic and keeps only the last 7 days', () => {
  const service = read('LocationService.js');
  assert.doesNotMatch(service, /Math\.random\(\)<0\.08/);
  assert.match(service, /const cutoff=Date\.now\(\)-7\*24\*60\*60\*1000/);
  assert.match(service, /where\('updatedAt','<',cutoff\)/);
  assert.match(service, /limit\(100\)/);
  assert.match(service, /deleteDoc\(d\.ref\)/);
});

test('report widget filters shared history to the current worker', () => {
  const handler = read('widget-task-handler.js');
  assert.match(handler, /x\?\.createdAt&&\(!x\.person\|\|x\.person===data\?\.myPerson\)/);
  assert.match(handler, /report:getReportData\(data\)/);
});

test('report alarm persists a bounded set of handled notification IDs', () => {
  const app = read('App.js');
  assert.match(app, /const handled = raw \? JSON\.parse\(raw\) : \[\]/);
  assert.match(app, /const handledIds = Array\.isArray\(handled\) \? handled : \(raw \? \[raw\] : \[\]\)/);
  assert.match(app, /handledIds\.includes\(id\)/);
  assert.match(app, /\.slice\(0,50\)/);
  assert.match(app, /JSON\.stringify\(nextHandled\)/);
});

test('LocationService closes saveLocationInternal before declaring the serialized queue', () => {
  const service = read('LocationService.js');
  const start = service.indexOf('async function saveLocationInternal');
  const queue = service.indexOf('// Serializujemy zapisy GPS', start);
  const block = service.slice(start, queue);
  assert.equal((block.match(/\{/g)||[]).length, (block.match(/\}/g)||[]).length);
  assert.match(block, /await AsyncStorage\.setItem\(LOCATION_CURRENT_KEY/);
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
  assert.match(live, /const selected=snap\.exists\(\)\?\(\{id:snap\.id,\.\.\.snap\.data\(\)\}\):null/);
  assert.match(now, /const selected=requested \? \(\(exact&&Date\.now\(\)-Number\(exact\.updatedAt\)<=180000\)\?exact:exact\|\|null\)/);
});

test('Web deployment uses the lockfile for deterministic dependency installation', () => {
  const workflow = read('../.github/workflows/web.yml');
  assert.match(workflow, /run: npm ci --ignore-scripts/);
});

test('bottom navigation stays usable on narrow screens', () => {
  const app = read('App.js');
  assert.match(app, /navDock:\{flex:1,flexDirection:'row'/);
  assert.match(app, /navBtn:\{flex:1,minWidth:0/);
  assert.match(app, /navText:\{color:'#8f99aa'.*fontSize:10/);
  assert.match(app, /\['summary','📊','Suma'\]/);
  assert.match(app, /\['ustawienia','⚙️','Ustaw\.'\]/);
});

test('weekly totals use the configured hours for the displayed week', () => {
  const app = read('App.js');
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


test('cloud snapshot apply guard remains owned by the cloud save effect', () => {
  const app = read('App.js');
  const start = app.indexOf('useEffect(() => {\n    if (!ready || !scheduleHydratedRef.current) return;');
  const end = app.indexOf("useEffect(() => {\n    if (!FIREBASE_ENABLED || !db || !cloudUser || cloudRole !== 'admin' || !ready) return;", start);
  const block = app.slice(start, end);
  assert.match(block, /if \(cloudApplying\.current\) return;/);
  assert.doesNotMatch(block, /cloudApplying\.current = false/);
});

test('GPS cache is cleared when the assigned vehicle changes or tracking stops', () => {
  const service = read('LocationService.js');
  assert.match(service, /safeVehicleId\(old\.vehicleId\|\|old\.registration\) !== vehicle/);
  assert.match(service, /removeItem\(LOCATION_CURRENT_KEY\)/);
});

test('GPS widget only exposes cached coordinates for the currently assigned vehicle', () => {
  const widget = read('widget-task-handler.js');
  assert.match(widget, /const sameVehicle=enabled&&cur\?\.vehicleId===loc\?\.vehicleId/);
  assert.match(widget, /Oczekiwanie na GPS nowego auta/);
  assert.match(widget, /sameVehicle&&cur\?\.latitude!=null/);
});

test('offline schedule state is durable and cache snapshots cannot discard it', () => {
  const app = read('App.js');
  assert.match(app, /cloudPending:cloudDirtyRef\.current/);
  assert.match(app, /cloudBaseUpdatedAt:cloudUpdatedAtRef\.current/);
  assert.match(app, /onSnapshot\(doc\(db,'schedules','main'\), \{includeMetadataChanges:true\}/);
  assert.match(app, /if \(cloudDirtyRef\.current\)/);
  assert.match(app, /if \(snap\.metadata\.fromCache\) return/);
  assert.match(app, /setCloudRetryTick\(v => v \+ 1\)/);
});

test('schedule save refuses to overwrite an existing remote document before initial sync', () => {
  const app = read('App.js');
  const start = app.indexOf('const payload = {hours,rotation,warehouse,weeks');
  const end = app.indexOf('const parseHM =', start);
  const block = app.slice(start, end);
  assert.match(block, /snap\.exists\(\) && \(expectedUpdatedAt === null \|\| remoteUpdatedAt !== expectedUpdatedAt\)/);
  assert.match(block, /throw new Error\('schedule-conflict'\)/);
});

test('rotation changes never overwrite manual, locked or recovery OFF assignments', () => {
  const app = read('App.js');
  const start = app.indexOf('const changeRotation =');
  const end = app.indexOf('  const openWeekSetup =', start);
  const block = app.slice(start, end);
  assert.match(block, /if \(s\.manual \|\| s\.locked \|\| s\.person === 'L'\) return/);
  assert.match(block, /setWeeks\(prev =>/);
  assert.match(block, /const next\s*=\s*cloneWeek\(existing\)/);
});

test('reselecting the current rotation is a no-op', () => {
  const app = read('App.js');
  const start = app.indexOf('const changeRotation =');
  const end = app.indexOf('  const openWeekSetup =', start);
  const block = app.slice(start, end);
  assert.match(block, /const currentRotation = weekConfigs\[wkKey\]\?\.rotation \|\| rotation/);
  assert.match(block, /if \(k === currentRotation\) return/);
});

test('week setup preserves an existing week instead of replacing its assignments', () => {
  const app = read('App.js');
  const start = app.indexOf('const confirmWeekSetup =');
  const end = app.indexOf('  const moveWeek =', start);
  const block = app.slice(start, end);
  assert.match(block, /setWeeks\(prev=>\(\{\.\.\.prev,\[key\]:prev\[key\]\|\|generateWeek/);
});

test('offline swap approval validates the current assignments before marking approved', () => {
  const app = read('App.js');
  const start = app.indexOf('const approveProposal = async proposal => {');
  const end = app.indexOf('  const rejectProposal = async id => {', start);
  const block = app.slice(start, end);
  assert.match(block, /const source=weeks\[proposalWeekKey\]/);
  assert.match(block, /x\.person!==expectedA \|\| y\.person!==expectedB \|\| x\.locked \|\| y\.locked/);
  assert.match(block, /setWeeks\(prev=>\(\{\.\.\.prev,\[proposalWeekKey\]:next\}\)\)/);
  assert.match(block, /setProposals\(p=>p\.map\(item=>item\.id===proposal\.id\?\{\.\.\.item,status:'approved'\}:item\)\)/);
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

test('hourly report notifications use alarm presentation and handoff to report', () => {
  const app = read('App.js');
  assert.match(app, /title: '🚨 RAPORT GODZINOWY'/);
  assert.match(app, /sound: 'default'/);
  assert.match(app, /data: \{type:'work-report', alarm:true\}/);
  assert.match(app, /const \[reportAlarm,setReportAlarm\] = useState\(false\)/);
  assert.match(app, /setReportAlarm\(true\)/);
  assert.match(app, /setReportAlarm\(false\);\s*applyReportContinuity\(reportStatusRef\.current\);\s*setReportModal\(true\)/);
});

test('work report notification refreshes continuity before opening modal', () => {
  const app = read('App.js');
  assert.match(app, /const openReportAlarm = async response =>/);
  const start = app.indexOf('const openReportAlarm = async response =>');
  const end = app.indexOf('const sub = Notifications.addNotificationResponseReceivedListener', start);
  const block = app.slice(start, end);
  assert.match(block, /type !== 'work-report'/);
  assert.match(block, /applyReportContinuity\(reportStatusRef.current\)/);
  assert.match(block, /setReportModal\(false\)/);
  assert.match(block, /setReportAlarm\(true\)/);
});

test('report notification scheduling reacts to per-week configuration changes', () => {
  const app = read('App.js');
  const start = app.indexOf("useEffect(() => {\n    if (!ready || Platform.OS === 'web') return;\n    const timer = setTimeout(() => { scheduleReportNotifications().catch(()=>{}); }, 800);");
  const end = app.indexOf("  },[ready,reportsEnabled,myPerson,weeks,weekConfigs,times,vehicleRegistration]);", start);
  assert.ok(start >= 0 && end > start);
  const block = app.slice(start, end);
  assert.match(app, /\},\[ready,reportsEnabled,myPerson,weeks,weekConfigs,times,vehicleRegistration\]\);/);
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
  assert.match(app, /generateWeek\(currentWeekConfig\.rotation \|\| rotation,currentWeekWarehouse\)/);
  assert.doesNotMatch(app, /targets\[p\]=Math\.max\(targets\[p\]===null\?counts\[p\]:targets\[p\],counts\[p\]\+recoveryTarget\[p\]\)/);
});

test('recover target is based on the clean weekly template plus one recovery debt', () => {
  const app = read('App.js');
  assert.match(app, /const baseTarget=targets\[p\]===null\?baseTargetCounts\[p\]:targets\[p\]/);
  assert.match(app, /targets\[p\]\s*=\s*baseTarget\+recoveryTarget\s*;/);
});

test('generator uses a soft capacity limit instead of cancelling a valid partial schedule', () => {
  const app = read('App.js');
  assert.match(app, /const capacityWarnings=\[\];/);
  assert.match(app, /const maxAvailable=counts\[p\]\+availableDays\.size/);
  assert.match(app, /Math\.min\(requestedTarget,maxAvailable\)/);
  assert.match(app, /Nie udało się zaplanować wszystkich wymaganych zmian/);
  assert.match(app, /return result;/);
});

test('automatic capacity respects one-shift-per-day when calculating max available', () => {
  const app = read('App.js');
  assert.match(app, /const availableDays=new Set\(\);/);
  assert.match(app, /availableDays\.add\(slot\.di\)/);
  assert.match(app, /result\[slot\.di\]\.shifts\.some\(x=>x\.person===p\)/);
});

test('soft target clipping never lowers target below already realized assignments', () => {
  const app = read('App.js');
  assert.match(app, /Math\.max\(counts\[p\],Math\.min\(requestedTarget,maxAvailable\)\)/);
});


test('recovery ledger contract: recover OFF adds exactly one debt entry', () => {
  const app = read('App.js');
  assert.match(app, /recoveryBalances/);
  assert.match(app, /recoveryLedger/);
  assert.match(app, /offMode==='recover'/);
  assert.match(app, /appendRecoveryLedger\(recoveryPerson,1,'off-recover'/);
});

test('recovery ledger entry ids are not based on timestamp alone', () => {
  const app = read('App.js');
  const start = app.indexOf('const appendRecoveryLedger =');
  const end = app.indexOf('const confirmRecovery =', start);
  const block = app.slice(start, end);
  assert.match(block, /Date\.now\(\).*Math\.random\(\)\.toString\(36\)/s);
});

test('recovery ledger is read-only from the advanced generator', () => {
  const app = read('App.js');
  const start = app.indexOf('const generateAdvancedWeek = () => {');
  const end = app.indexOf('  const regenerate = () => {', start);
  const block = app.slice(start, end);
  assert.match(block, /recoveryBalances/);
  assert.doesNotMatch(block, /setRecoveryBalances/);
  assert.doesNotMatch(block, /setRecoveryLedger/);
  assert.doesNotMatch(block, /recoveryBalances\s*\[[^\]]+\]\s*=/);
});

test('repeated generation cannot mutate recovery ledger state', () => {
  const app = read('App.js');
  assert.match(app, /const recoveryBalancesSnapshot/);
  assert.match(app, /const recoveryTarget/);
  assert.match(app, /baseTarget\+recoveryTarget/);
  assert.doesNotMatch(app, /recoveryBalances\[[^\]]+\]\s*\+=/);
});

test('clearing the current week never clears or decrements recovery debt', () => {
  const app = read('App.js');
  const start = app.indexOf('const clearCurrentWeek = () => {');
  const end = app.indexOf('  const clearWholeWeekShift =', start);
  const block = app.slice(start, end);
  assert.doesNotMatch(block, /setRecoveryBalances|setRecoveryLedger/);
  assert.match(block, /setWeeks/);
});

test('confirmRecovery decrements debt with an auditable ledger entry', () => {
  const app = read('App.js');
  assert.match(app, /const confirmRecovery\s*=\s*\(?person\)?\s*=>/);
  assert.match(app, /Math\.max\(0,/);
  assert.match(app, /appendRecoveryLedger\(person,-1,'recovery-confirmed'\)/);
});

test('recovery repayment at zero is idempotent and cannot create negative balance', () => {
  const app = read('App.js');
  assert.match(app, /if\s*\(current\s*<=\s*0\)/);
  assert.match(app, /return\s*;/);
  assert.match(app, /Math\.max\(0,\(Number\(prev\[person\]\)\|\|0\)-1\)/);
});

test('manual negative recovery correction is clamped at zero and audited', () => {
  const app = read('App.js');
  assert.match(app, /adjustRecoveryBalance/);
  assert.match(app, /Math\.max\(0,/);
  assert.match(app, /appendRecoveryLedger\(person,applied,'manual-correction'/);
  assert.match(app, /appendRecoveryLedger\(person,applied,'manual-correction'/);
});

test('swap proposals snapshot the week and expected assignments', () => {
  const app = read('App.js');
  assert.match(app, /weekKey:wkKey/);
  assert.match(app, /fromExpectedPerson:swapModal\.person \|\| null/);
  assert.match(app, /toExpectedPerson:swapTarget/);
});

test('swap approval uses the proposal week and rejects stale or locked shifts', () => {
  const app = read('App.js');
  const start = app.indexOf('const approveProposal = async proposal => {');
  const end = app.indexOf('  const rejectProposal = async id => {', start);
  const block = app.slice(start, end);
  assert.match(block, /const proposalWeekKey=proposal\.weekKey \|\| wkKey/);
  assert.match(block, /const proposalWeek=weeks\[proposalWeekKey\]/);
  assert.match(block, /expectedA=proposal\.fromExpectedPerson/);
  assert.match(block, /expectedB=proposal\.toExpectedPerson/);
  assert.match(block, /Propozycja nieaktualna/);
  assert.match(block, /a\.locked \|\| b\.locked/);
  assert.match(block, /\[proposalWeekKey\]:next/);
});

test('manual negative recovery correction records the actually applied delta', () => {
  const app = read('App.js');
  const start = app.indexOf('const adjustRecoveryBalance =');
  const end = app.indexOf('  const saveOff =', start);
  const block = app.slice(start, end);
  assert.match(block, /const current = Number\(recoveryBalances\[person\]\) \|\| 0/);
  assert.match(block, /const next = Math\.max\(0,current \+ change\)/);
  assert.match(block, /const applied = next - current/);
  assert.match(block, /if \(applied === 0\) return/);
  assert.match(block, /appendRecoveryLedger\(person,applied,'manual-correction'/);
  assert.doesNotMatch(block, /appendRecoveryLedger\(person,change,'manual-correction'/);
});

test('backup contains all locally persisted schedule and business state', () => {
  const app = read('App.js');
  assert.match(app, /const buildBackupPayload = \(\) =>/);
  assert.match(app, /weekConfigs,autoGenerateWeeks/);
  assert.match(app, /conditions,proposals,myPerson/);
  assert.match(app, /vehicleRegistration,reportGroupLink,reportsEnabled,reportHistory,warehouseGeo/);
  assert.match(app, /recoveryBalances,recoveryLedger,chatMessages/);
});

test('restore rejects negative recovery balances and malformed ledger entries', () => {
  const app = read('App.js');
  const start = app.indexOf('const restoreBackup = () =>');
  const end = app.indexOf('  const shareFile =', start);
  const block = app.slice(start, end);
  assert.match(block, /Number\(value\[key\] \?\? 0\) >= 0/);
  assert.match(block, /value\.length <= 500/);
  assert.match(block, /PERSON_KEYS\.includes\(entry\.person\)/);
  assert.match(block, /Number\.isFinite\(Number\(entry\.delta\)\)/);
  assert.match(block, /typeof entry\.reason === 'string'/);
  assert.match(block, /String\(entry\.id \|\| ''\)\.length > 0/);
});

test('restore restores persisted state beyond the base schedule', () => {
  const app = read('App.js');
  assert.match(app, /setWeekConfigs\(data\.weekConfigs \|\| \{\}\)/);
  assert.match(app, /setAutoGenerateWeeks\(!!data\.autoGenerateWeeks\)/);
  assert.match(app, /setRecoveryBalances/);
  assert.match(app, /setRecoveryLedger/);
  assert.match(app, /setReportHistory/);
  assert.match(app, /setWarehouseGeo/);
  assert.match(app, /setChatMessages/);
});

test('reset clears local auxiliary state as well as the main schedule', () => {
  const app = read('App.js');
  assert.match(app, /AsyncStorage\.removeItem\(LEGACY_KEY\)/);
  assert.match(app, /AsyncStorage\.removeItem\(REPORT_HISTORY_KEY\)/);
  assert.match(app, /AsyncStorage\.removeItem\(LOCATION_CONFIG_KEY\)/);
  assert.match(app, /setWeekConfigs\(\{\}\)/);
  assert.match(app, /setRecoveryBalances\(\{P:0,M:0,L:0\}\)/);
  assert.match(app, /setChatMessages\(\[\]\)/);
});

test('PDF export headers use the displayed week time configuration', () => {
  const app = read('App.js');
  assert.match(app, /I · \$\{escapeHtml\(currentWeekTimes\.s1\)/);
  assert.match(app, /II · \$\{escapeHtml\(currentWeekTimes\.s2\)/);
  assert.doesNotMatch(app, /I · \$\{escapeHtml\(times\.s1\)/);
});


test('default Sunday Łukasz MUST conditions survive backup restore and full reset', () => {
  const app = read('App.js');
  const restoreStart = app.indexOf('const restoreBackup = () => {');
  const restoreEnd = app.indexOf('  const shareFile =', restoreStart);
  const restoreBlock = app.slice(restoreStart, restoreEnd);
  assert.match(restoreBlock, /const restoredConditions = Array\.isArray\(data\.conditions\)/);
  assert.match(restoreBlock, /DEFAULT_BUSINESS_CONDITIONS\[0\]/);
  assert.match(restoreBlock, /DEFAULT_BUSINESS_CONDITIONS\[1\]/);

  const resetStart = app.indexOf('const resetAll = () => {');
  const resetEnd = app.indexOf('  const buildBackupPayload =', resetStart);
  const resetBlock = app.slice(resetStart, resetEnd);
  assert.match(resetBlock, /setConditions\(\[\.\.\.DEFAULT_BUSINESS_CONDITIONS\]\)/);
});


test('locator role is available for account creation and accepted by backend/rules', () => {
  const panel = read('AdminUsersPanel.js');
  const fn = read('functions/index.js');
  const rules = read('firestore.rules');
  const app = read('App.js');
  assert.match(panel, /const ROLES=\['employee','locator','admin'\]/);
  assert.match(panel, /📍 LOKALIZATOR/);
  assert.match(fn, /new Set\(\['admin','employee','locator'\]\)/);
  assert.match(rules, /value == 'admin' \|\| value == 'employee' \|\| value == 'locator'/);
  assert.match(app, /role === 'locator' \? 'locator' : 'employee'/);
});


test('locator role is required for vehicle GPS writes', () => {
  const rules = read('firestore.rules');
  const gpsBlock = rules.slice(rules.indexOf("match /vehicleTracking/{vehicleId}"));
  assert.match(gpsBlock, /users\/\$\(request\.auth\.uid\)\)\.data\.role == 'locator'/);
  assert.match(gpsBlock, /match \/locations\/\{locationId\}/);
});

test('locator interface hides schedule, summary and chat navigation', () => {
  const app = read('App.js');
  assert.match(app, /cloudRole==='locator'\s*\?\s*\[\]\s*:\s*\[\['grafik','📅','Grafik'\]\]/);
  assert.match(app, /cloudRole==='locator'\s*\?\s*\[\]\s*:\s*\[\['summary','📊','Suma'\],\['chat','💬','Czat'\]\]/);
  assert.match(app, /cloudRole==='locator'\s*\?\s*locatorSettings\s*:\s*settings/);
});


test('live GPS dashboard does not claim the transmitter must be an employee account', () => {
  const live = read('LiveLocationDashboard.js');
  assert.doesNotMatch(live, /Telefon B musi być zalogowany do konta pracownika/);
  assert.match(live, /reguły dostępu do GPS/);
});

test('locator GPS UI uses the admin-assigned vehicle and cannot edit the registration locally', () => {
  const app = read('App.js');
  const start = app.indexOf('const locatorSettings = (');
  const end = app.indexOf('const settings = (', start);
  const block = app.slice(start, end);
  assert.match(app, /onSnapshot\(doc\(db,'locationConfig','main'\)/);
  assert.match(app, /if \(cloudRole === 'locator'\)/);
  assert.match(app, /const assigned = String\(data\.registration \|\| data\.vehicleId \|\| ''\)/);
  assert.match(block, /Auto przypisane przez administratora/);
  assert.match(block, /administrator nie przypisał jeszcze auta/);
  assert.doesNotMatch(block, /saveVehicleLocationAssignment\(/);
  assert.doesNotMatch(block, /onChangeText=\{v=>setVehicleRegistration/);
});

test('admin vehicle assignment is written to the central GPS config', () => {
  const app = read('App.js');
  const start = app.indexOf("await saveVehicleLocationAssignment(reg);");
  const end = app.indexOf("setVehicleRegistration(reg);", start);
  const block = app.slice(start, end);
  assert.match(block, /cloudRole === 'admin'/);
  assert.match(block, /setDoc\(doc\(db,'locationConfig','main'\)/);
  assert.match(block, /vehicleId:reg/);
  assert.match(block, /registration:reg/);
  assert.match(block, /updatedBy:cloudUser\.uid/);
});

test('locator syncs local GPS assignment when admin changes the vehicle', () => {
  const app = read('App.js');
  const start = app.indexOf("const data = snap.data() || {};");
  const end = app.indexOf("    });", start);
  const block = app.slice(start, end);
  assert.match(block, /if \(cloudRole === 'locator'\)/);
  assert.match(block, /const local = await getVehicleLocationConfig\(\)/);
  assert.match(block, /localAssigned\s*!==\s*assigned/);
  assert.match(block, /saveVehicleLocationAssignment\(assigned\)/);
});

test('live GPS dashboard clears stale vehicle data when central assignment is removed', () => {
  const live = read('LiveLocationDashboard.js');
  assert.match(live, /hasCentralAssignment=Object\.prototype\.hasOwnProperty\.call\(cloudConfig,'vehicleId'\)/);
  assert.match(live, /if \(!assignedValue\)/);
  assert.match(live, /setConfig\(prev=>\(\{\.\.\.prev,vehicleId:'',registration:''\}\)\)/);
  assert.match(live, /Brak centralnego przypisania pojazdu/);
});

test('live GPS dashboard subscribes only to the centrally assigned vehicle document', () => {
  const live = read('LiveLocationDashboard.js');
  assert.match(live, /const vehicleRef=doc\(db,'vehicleTracking',requestedId\)/);
  assert.doesNotMatch(live, /const vehicleRef=collection\(db,'vehicleTracking'\)/);
  assert.match(live, /const selected=snap\.exists\(\)\?\(\{id:snap\.id,\.\.\.snap\.data\(\)\}\):null/);
});

test('GPS dashboard subscribes to central vehicle assignment changes', () => {
  const live = read('LiveLocationDashboard.js');
  assert.match(live, /configUnsub=onSnapshot\(doc\(db,'locationConfig','main'\)/);
  assert.match(live, /subscribeVehicle\(snap\.exists\(\)\?snap\.data\(\)\|\|\{\}:\{\}\)/);
  assert.match(live, /if\(configUnsub\) configUnsub\(\)/);
});

test('Now dashboard scopes GPS reads to the assigned vehicle when one is configured', () => {
  const now = read('NowDashboard.js');
  assert.match(now, /const vehicleSource=requested \? doc\(db,'vehicleTracking',requested\) : collection\(db,'vehicleTracking'\)/);
  assert.match(now, /onSnapshot\(vehicleSource,snap=>handleSnapshot\(snap,Boolean\(requested\)\)/);
});

test('Now dashboard reacts to central vehicle assignment changes', () => {
  const now = read('NowDashboard.js');
  assert.match(now, /configUnsub=onSnapshot\(doc\(db,'locationConfig','main'\)/);
  assert.match(now, /subscribe\(snap\.exists\(\)\?snap\.data\(\)\|\|\{\}:\{\}\)/);
  assert.match(now, /if\(configUnsub\)configUnsub\(\)/);
});


test('locator cannot restart GPS from stale local assignment before central assignment is loaded', () => {
  const app = read('App.js');
  const start = app.indexOf('const refreshLocationState=async()=>');
  const end = app.indexOf('    };', start) + '    };'.length;
  const block = app.slice(start, end);
  assert.match(block, /if \(cloudRole === 'locator'\)/);
  assert.match(block, /setLocationTracking\(false\)/);
  assert.doesNotMatch(block, /cloudRole === 'locator'[\\s\\S]*ensureVehicleLocationTracking\(\)/);
});

test('removing central vehicle assignment stops an active locator GPS transmitter', () => {
  const app = read('App.js');
  const start = app.indexOf("if (!snap.exists())");
  const end = app.indexOf("        return;", start) + "        return;".length;
  const block = app.slice(start, end);
  assert.match(block, /cloudRole === 'locator'/);
  assert.match(block, /setVehicleRegistration\(''\)/);
  assert.match(block, /stopVehicleLocationTracking\(\)/);
});


test('recovery OFF keeps debt attached to the original employee, not the replacement', () => {
  const app = read('App.js');
  const start = app.indexOf('const saveOff = () =>');
  const end = app.indexOf('const submitSwap = async () =>', start);
  const block = app.slice(start, end);
  assert.match(block, /previousRecoveryPerson/);
  assert.match(block, /previousShift\.offOriginalPerson \|\| previousShift\.recoverPerson/);
  assert.match(block, /const recoveryPerson = offMode === 'recover'/);
  assert.match(block, /sh\.offOriginalPerson=recoveryPerson/);
  assert.match(block, /off-recover-reverted/);
});

test('changing recovery OFF back to plain OFF reverses the recovery ledger entry', () => {
  const app = read('App.js');
  const start = app.indexOf('const saveOff = () =>');
  const end = app.indexOf('const submitSwap = async () =>', start);
  const block = app.slice(start, end);
  assert.match(block, /if \(previousRecoveryPerson && previousRecoveryPerson !== recoveryPerson\)/);
  assert.match(block, /setRecoveryBalances\(prev =>/);
  assert.match(block, /appendRecoveryLedger\(previousRecoveryPerson,-1,'off-recover-reverted'/);
});


test('cloud recovery snapshots are sanitized before entering app state', () => {
  const app = read('App.js');
  assert.match(app, /const normalizeRecoveryBalances = value =>/);
  assert.match(app, /Number\.isFinite\(n\) && n >= 0/);
  assert.match(app, /const normalizeRecoveryLedger = value =>/);
  assert.match(app, /PERSON_KEYS\.includes\(entry\.person\)/);
  assert.match(app, /\.slice\(0,500\)/);
  assert.match(app, /setRecoveryBalances\(normalizeRecoveryBalances\(data\.recoveryBalances\)\)/);
  assert.match(app, /setRecoveryLedger\(normalizeRecoveryLedger\(data\.recoveryLedger\)\)/);
});

test('online schedule persistence includes recovery balance and ledger changes', () => {
  const app = read('App.js');
  const start = app.indexOf("const payload = {hours,rotation,warehouse,weeks,weekConfigs");
  const end = app.indexOf("},[ready,hours", start);
  const effect = app.slice(start, end);
  assert.match(effect, /recoveryBalances,recoveryLedger/);
  assert.match(effect, /runTransaction\(db,async tx=>/);
  assert.match(effect, /updatedBy:cloudUser\.uid/);
});

test('swap approval uses a Firestore transaction against the current proposal and schedule', () => {
  const app = read('App.js');
  const start = app.indexOf('const approveProposal = async proposal =>');
  const end = app.indexOf('const rejectProposal = async id =>', start);
  const block = app.slice(start, end);
  assert.match(block, /runTransaction\(db,async tx=>/);
  assert.match(block, /proposalSnap\.data\(\)\?\.status !== 'pending'/);
  assert.match(block, /scheduleSnap\.data\(\)\?\.weeks/);
  assert.match(block, /x\.person!==expectedA \|\| y\.person!==expectedB/);
  assert.match(block, /tx\.update\(scheduleRef/);
  assert.match(block, /tx\.update\(proposalRef/);
});


test('shared schedule save guards against stale remote updates', () => {
  const app = read('App.js');
  const start = app.indexOf("  useEffect(() => {\n    if (!FIREBASE_ENABLED || !db || !cloudUser || cloudRole !== 'admin' || !ready) return;");
  const end = app.indexOf("\n\n  const parseHM", start);
  const block = app.slice(start, end);
  assert.match(block, /cloudUpdatedAtRef\.current/);
  assert.match(block, /runTransaction\(db,async tx=>/);
  assert.match(block, /remoteUpdatedAt/);
  assert.match(block, /schedule-conflict/);
  assert.match(block, /tx\.set\(scheduleRef,payload/);
});


test('schedule conflict immediately reloads the authoritative remote snapshot', () => {
  const app = read('App.js');
  const start = app.indexOf("  useEffect(() => {\n    if (!FIREBASE_ENABLED || !db || !cloudUser || cloudRole !== 'admin' || !ready) return;");
  const end = app.indexOf("\n\n  const parseHM", start);
  const block = app.slice(start, end);
  assert.match(block, /if\(e\?\.message==='schedule-conflict'\)/);
  assert.match(block, /const latest=await getDoc\(scheduleRef\)/);
  assert.match(block, /cloudUpdatedAtRef\.current=data\.updatedAt/);
  assert.match(block, /setWeeks\(data\.weeks\)/);
  assert.match(block, /Pobrano najnowszą wersję bez jej nadpisania/);
});

test('schedule sync coalesces rapid local state changes into one write window', () => {
  const app = read('App.js');
  assert.match(app, /const cloudSaveTimerRef = useRef\(null\)/);
  const start = app.indexOf("  useEffect(() => {\n    if (!FIREBASE_ENABLED || !db || !cloudUser || cloudRole !== 'admin' || !ready) return;");
  const end = app.indexOf("\n\n  const parseHM", start);
  const block = app.slice(start, end);
  assert.match(block, /clearTimeout\(cloudSaveTimerRef\.current\)/);
  assert.match(block, /cloudSaveTimerRef\.current=setTimeout/);
  assert.match(block, /},250\)/);
  assert.match(block, /return \(\) =>/);
});

test('approved swaps are marked manual so the generator preserves them', () => {
  const app = read('App.js');
  const start = app.indexOf('const approveProposal = async proposal =>');
  const end = app.indexOf('const rejectProposal = async id =>', start);
  const block = app.slice(start, end);
  assert.match(block, /nx\.person=ny\.person; ny\.person=xp; nx\.manual=true; ny\.manual=true/);
});

test('manual shift editing uses immutable React state updates', () => {
  const app = read('App.js');
  const start = app.indexOf('const updateShift =');
  const end = app.indexOf('const removeShift =', start);
  const block = app.slice(start, end);
  assert.match(block, /setWeek\(w => w\.map/);
  assert.match(block, /shifts:\(day\.shifts \|\| \[\]\)\.map/);
  assert.doesNotMatch(block, /w\[dayIndex\]\.shifts\[shiftIndex\]\s*=/);
});

test('locking a shift uses immutable React state updates', () => {
  const app = read('App.js');
  const start = app.indexOf('const toggleLock =');
  const end = app.indexOf('const openOff =', start);
  const block = app.slice(start, end);
  assert.match(block, /setWeek\(w => w\.map/);
  assert.match(block, /locked:!shift\.locked/);
  assert.doesNotMatch(block, /s\.locked\s*=/);
});

test('advanced generator preserves manual and locked assignments including approved swaps', () => {
  const app = read('App.js');
  const start = app.indexOf('const generateAdvancedWeek = () =>');
  const end = app.indexOf('const generateSchedule =', start);
  const block = app.slice(start, end);
  assert.match(block, /if \(dayHasPassed\(di\) \|\| s\.locked \|\| s\.manual\) return;/);
  assert.match(block, /if \(s\.manual && !autoFillOff\) return;/);
  assert.match(block, /if\(s\.locked \|\| s\.manual \|\| dayHasPassed\(di\)\)/);
});

test('reset all stops active locator GPS before clearing local location config', () => {
  const app = read('App.js');
  const start = app.indexOf('const resetAll = () =>');
  const end = app.indexOf('const buildBackupPayload', start);
  const block = app.slice(start, end);
  assert.match(block, /await stopVehicleLocationTracking\(\)/);
  assert.match(block, /AsyncStorage\.removeItem\(LOCATION_CONFIG_KEY\)/);
});


test('backup restore validates version and core schedule schema before mutating state', () => {
  const app = read('App.js');
  const start = app.indexOf('const restoreBackup = () =>');
  const end = app.indexOf('const shareFile = async', start);
  const block = app.slice(start, end);
  assert.match(block, /Number\(data\.version\) !== 5/);
  assert.match(block, /validHours/);
  assert.match(block, /validRotation/);
  assert.match(block, /validWeeks/);
  assert.match(block, /validBalances/);
  assert.match(block, /validLedger/);
  assert.match(block, /setHours\(data\.hours\)/);
});


test('swap rejection is guarded by pending status', () => {
  const app = read('App.js');
  const start = app.indexOf('const rejectProposal = async id =>');
  const end = app.indexOf('const changeRotation', start);
  const block = app.slice(start, end);
  assert.match(block, /readOnly\) return/);
  assert.match(block, /runTransaction\(db,async tx=>/);
  assert.match(block, /proposal-not-pending/);
  assert.match(block, /status:'rejected'/);
});


test('swap proposal rejects identical source and target shifts and validates source assignment', () => {
  const app = read('App.js');
  const start = app.indexOf('const submitSwap = async () =>');
  const end = app.indexOf('const approveProposal', start);
  const block = app.slice(start, end);
  assert.match(block, /sourceDay === Number\(swapTargetDay\)/);
  assert.match(block, /sourceShift === Number\(swapTargetShift\)/);
  assert.match(block, /sourceShiftData/);
  assert.match(block, /Zmiana, z której tworzysz propozycję/);
});


test('employee swap proposal is restricted to the logged-in employee source shift', () => {
  const app = read('App.js');
  const start = app.indexOf('const submitSwap = async () =>');
  const end = app.indexOf('const approveProposal', start);
  const block = app.slice(start, end);
  assert.match(block, /cloudRole !== 'admin'/);
  assert.match(block, /sourceShiftData\.person !== myPerson/);
  assert.match(block, /swapModal\.person !== myPerson/);
});

test('Firestore proposal creation binds employee source person to the user profile', () => {
  const rules = read('firestore.rules');
  const start = rules.indexOf('match /proposals/{proposalId}');
  const end = rules.indexOf('match /chatMessages', start);
  const block = rules.slice(start, end);
  assert.match(block, /request\.resource\.data\.fromPerson == get\(/);
  assert.match(block, /data\.personKey/);
  assert.match(block, /isAdmin\(\)/);
});

test('Android report alarms use a dedicated MAX-importance channel with vibration and lock-screen visibility', () => {
  const app = read('App.js');
  assert.match(app, /const REPORT_NOTIFICATION_CHANNEL_ID = 'work-report-alarm'/);
  assert.match(app, /Notifications\.setNotificationChannelAsync\(REPORT_NOTIFICATION_CHANNEL_ID/);
  assert.match(app, /importance: Notifications\.AndroidImportance\.MAX/);
  assert.match(app, /vibrationPattern: \[0,700,250,700,500\]/);
  assert.match(app, /lockscreenVisibility: Notifications\.AndroidNotificationVisibility\.PUBLIC/);
  assert.match(app, /bypassDnd: true/);
  assert.match(app, /channelId: REPORT_NOTIFICATION_CHANNEL_ID/);
  assert.match(app, /priority: Notifications\.AndroidNotificationPriority\.MAX/);
  assert.match(app, /sticky: true/);
});

test('report alarm repeats vibration while open and cancels it when dismissed', () => {
  const app = read('App.js');
  const start = app.indexOf('useEffect(() => {\n    if (!reportAlarm)');
  const end = app.indexOf('  const ensureReportNotificationChannel', start);
  const block = app.slice(start, end);
  assert.match(block, /Vibration\.vibrate\(\[0,700,250,700,500\], true\)/);
  assert.match(block, /Vibration\.cancel\(\)/);
});

test('notification response handling ignores duplicate or stale last-response deliveries', () => {
  const app = read('App.js');
  assert.match(app, /REPORT_LAST_HANDLED_NOTIFICATION_KEY/);
  assert.match(app, /handledReportNotificationRef\.current === id/);
  assert.match(app, /AsyncStorage\.getItem\(REPORT_LAST_HANDLED_NOTIFICATION_KEY\)/);
});
