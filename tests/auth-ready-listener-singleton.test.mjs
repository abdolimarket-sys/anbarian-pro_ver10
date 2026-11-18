import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainSource = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const backupSource = await readFile(new URL('../src/modules/device-auto-backup.ts', import.meta.url), 'utf8');

test('UI auth-ready listener is registered once even when bootApp is called repeatedly', () => {
  assert.match(mainSource, /let authReadyUiListenerRegistered = false;/);
  assert.match(mainSource, /if \(authReadyUiListenerRegistered\) return;/);
  assert.match(mainSource, /authReadyUiListenerRegistered = true;/);
  assert.equal((mainSource.match(/addEventListener\('anbarin:auth-ready'/g) || []).length, 1);
  assert.match(mainSource, /registerAuthReadyUiListener\(\);/);
});

test('external auto-backup scheduler does not duplicate auth-ready or lifecycle listeners', () => {
  assert.match(backupSource, /let externalAutoBackupSchedulerInitialized = false;/);
  assert.match(backupSource, /if \(!isNativeAndroid\(\) \|\| externalAutoBackupSchedulerInitialized\) return;/);
  assert.match(backupSource, /externalAutoBackupSchedulerInitialized = true;/);
});
