import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const config = readFileSync(new URL('../capacitor.config.ts', import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = readFileSync(new URL('../.github/workflows/main.yml', import.meta.url), 'utf8');
const buildScript = readFileSync(new URL('../scripts/build-android-debug.mjs', import.meta.url), 'utf8');
const mainActivity = readFileSync(new URL('../android/app/src/main/java/com/anbarian/app/MainActivity.java', import.meta.url), 'utf8');

test('Android WebView does not opt into mixed HTTP content', () => {
  assert.doesNotMatch(config, /allowMixedContent\s*:\s*true/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
});

test('Android app retains camera and internet capabilities for phone workflows', () => {
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(mainActivity, /registerPlugin\(SaveFilePlugin\.class\)/);
  assert.match(mainActivity, /registerPlugin\(DueNotificationsPlugin\.class\)/);
});

test('project exposes a cross-platform local debug APK build command', () => {
  assert.equal(packageJson.scripts['android:debug'], 'node scripts/build-android-debug.mjs');
  assert.match(buildScript, /npm', \['run', 'cap:sync'\]/);
  assert.match(buildScript, /assembleDebug/);
  assert.match(buildScript, /app-debug\.apk/);
  assert.ok(existsSync(new URL('../android/gradlew', import.meta.url)));
});

test('CI builds and uploads an Android APK after regression and web build checks', () => {
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run build/);
  assert.match(workflow, /npx cap sync android/);
  assert.match(workflow, /assembleDebug/);
  assert.match(workflow, /anbarin-debug-apk/);
});
