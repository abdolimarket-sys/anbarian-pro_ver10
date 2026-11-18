import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('web package, lockfile root, Android versionName and release notes agree', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const gradle = read('android/app/build.gradle');
  const serviceWorker = read('public/sw.js');
  let androidServiceWorker = null;
  try { androidServiceWorker = read('android/app/src/main/assets/public/sw.js'); }
  catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const appSource = read('src/main.ts') + read('src/bootstrap/app-shell.ts') + read('src/bootstrap/service-worker.ts');
  const notes = read('RELEASE_NOTES_2.1.10_FA.md');
  assert.equal(pkg.version, '2.1.10');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.match(gradle, /versionCode\s+37/);
  assert.ok(gradle.includes(`versionName '${pkg.version}'`) || gradle.includes(`versionName \"${pkg.version}\"`));
  assert.ok(serviceWorker.includes(`anbarin-v${pkg.version}`));
  if (androidServiceWorker !== null) {
    assert.ok(androidServiceWorker.includes(`anbarin-v${pkg.version}`));
  }
  assert.ok(appSource.includes(`v${pkg.version}`));
  assert.match(notes, /Android.*بازسازی نشده|Android.*rebuild/i);
  assert.ok(notes.includes(`Anbarin Pro ${pkg.version}`));
  assert.match(notes, /versionCode.*37/);
});
