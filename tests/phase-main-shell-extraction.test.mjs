import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const shell = await readFile(new URL('../src/bootstrap/app-shell.ts', import.meta.url), 'utf8');
const recovery = await readFile(new URL('../src/bootstrap/boot-recovery.ts', import.meta.url), 'utf8');

test('main delegates shell rendering to the dedicated app-shell module', () => {
  assert.match(main, /import\s*\{\s*renderShell\s*\}\s*from\s*['"]\.\/bootstrap\/app-shell['"]/);
  assert.match(main, /renderShell\(bindEvents,\s*setupVirtualLists\)/);
  assert.doesNotMatch(main, /function\s+renderShell\s*\(/);
});

test('extracted shell preserves required page roots and initialization callbacks', () => {
  for (const id of ['page-count', 'page-products', 'page-reports', 'page-accounting', 'page-health', 'page-audit', 'page-admin']) {
    assert.ok(shell.includes(`id="${id}"`), `missing shell root: ${id}`);
  }
  assert.match(shell, /compactAdminSections\(\)/);
  assert.match(shell, /compactReportSections\(\)/);
  assert.match(shell, /bindEvents\(\)/);
  assert.match(shell, /setupVirtualLists\(\)/);
});

test('boot order remains recovery, shell, local auth, then external backup scheduler', () => {
  const recoveryCall = main.indexOf('runBootRecovery()');
  const restore = recovery.indexOf('recoverInterruptedSelectedRestore()');
  const render = main.indexOf('renderShell(bindEvents, setupVirtualLists)');
  const auth = main.indexOf('initLocalAuth()', render);
  const scheduler = main.indexOf('initExternalAutoBackupScheduler()', auth);
  assert.ok(recoveryCall >= 0 && restore >= 0 && recoveryCall < render);
  assert.ok(render < auth && auth < scheduler);
});


test('boot recovery and service worker lifecycle are extracted from main', async () => {
  const serviceWorker = await readFile(new URL('../src/bootstrap/service-worker.ts', import.meta.url), 'utf8');
  assert.match(main, /import \{ runBootRecovery \} from ['"]\.\/bootstrap\/boot-recovery['"]/);
  assert.match(main, /import \{ initializeServiceWorker \} from ['"]\.\/bootstrap\/service-worker['"]/);
  assert.match(main, /initializeServiceWorker\(\)/);
  assert.match(recovery, /recoverInterruptedSelectedRestore\(\)/);
  assert.match(serviceWorker, /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);
});
