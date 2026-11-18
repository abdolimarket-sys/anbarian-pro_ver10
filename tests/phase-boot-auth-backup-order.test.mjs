import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const backup = readFileSync(new URL('../src/modules/device-auto-backup.ts', import.meta.url), 'utf8');
const recovery = readFileSync(new URL('../src/bootstrap/boot-recovery.ts', import.meta.url), 'utf8');

test('boot restores interrupted state before rendering, then initializes auth before backup scheduler', () => {
  const boot = main.slice(main.indexOf('async function bootApp()'), main.indexOf('\nfunction ', main.indexOf('async function bootApp()') + 1));
  const recoveryCall = boot.indexOf('runBootRecovery()');
  const restore = recovery.indexOf('recoverInterruptedSelectedRestore()');
  const render = boot.indexOf('renderShell(bindEvents, setupVirtualLists);');
  const auth = boot.indexOf('initLocalAuth();');
  const scheduler = boot.indexOf('initExternalAutoBackupScheduler();');
  assert.ok(recoveryCall >= 0 && restore >= 0 && recoveryCall < render && auth > render && scheduler > auth);
});

test('scheduled external backups are gated until successful local authentication', () => {
  const scheduler = backup.slice(backup.indexOf('export function initExternalAutoBackupScheduler()'));
  assert.match(scheduler, /anbarin:auth-ready[\s\S]*externalAutoBackupAuthReady\s*=\s*true/);
  assert.match(scheduler, /if \(externalAutoBackupAuthReady && document\.visibilityState === 'hidden'\)/);
  assert.match(scheduler, /if \(externalAutoBackupAuthReady\) void writeExternalAutoBackup\(false\)/);
  assert.doesNotMatch(scheduler, /setTimeout\(\(\) => \{ void writeExternalAutoBackup/);
});
