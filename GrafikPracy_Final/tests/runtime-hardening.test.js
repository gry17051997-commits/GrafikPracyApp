import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);

async function read(file) {
  return fs.readFile(path.join(root, file), 'utf8');
}

test('entrypoint keeps native background registrations outside React lifecycle', async () => {
  const index = await read('index.js');
  const app = await read('App.js');

  assert.match(index, /import ['"]\.\/LocationService['"]/);
  assert.match(index, /Notifications\.setNotificationHandler\(/);
  assert.match(index, /registerRootComponent\(App\)/);
  assert.doesNotMatch(index, /useEffect\s*\(/);
  assert.doesNotMatch(app, /TaskManager\.defineTask|Notifications\.setNotificationHandler/);
});

test('LocationService defines its background task at module scope', async () => {
  const source = await read('LocationService.js');
  const taskIndex = source.indexOf('TaskManager.defineTask(');

  assert.ok(taskIndex >= 0, 'background location task must be defined');
  const taskRegistrationRegion = source.slice(Math.max(0, taskIndex - 1200), taskIndex);
  assert.doesNotMatch(taskRegistrationRegion, /useEffect\s*\(/);
  assert.match(source, /Location\.hasStartedLocationUpdatesAsync\(/);
  assert.match(source, /killServiceOnDestroy:\s*false/);
});

test('runtime dashboards use the shared animation-frame ticker instead of setInterval', async () => {
  for (const file of ['Dashboard.js', 'NowDashboard.js', 'LiveLocationDashboard.js']) {
    const source = await read(file);
    assert.doesNotMatch(source, /setInterval\s*\(/, file);
    assert.match(source, /useSecondTicker\(/, file);
  }

  const ticker = await read('hooks/useSecondTicker.js');
  assert.match(ticker, /requestAnimationFrame\(/);
  assert.match(ticker, /cancelAnimationFrame\(/);
});

test('security-sensitive PIN is not serialized by the primary local application state', async () => {
  const source = await read('AppRuntime.js');

  assert.doesNotMatch(source, /AsyncStorage\.setItem\(PIN_KEY/);
  assert.doesNotMatch(source, /AsyncStorage\.setItem\([^\n]*pin[^\n]*JSON\.stringify/is);
});

test('CI no longer depends on source-rewriting build fix scripts', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  const prWorkflow = await fs.readFile(path.resolve(root, '../.github/workflows/pr-validation.yml'), 'utf8');

  assert.equal(Object.hasOwn(packageJson.scripts, 'postinstall'), false);
  assert.doesNotMatch(prWorkflow, /fix-app-build\.js|fix-chat-build\.js|fix-rotation-switch\.js/);
});
