import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const moduleSource = readFileSync(new URL('../src/modules/backup-settings-events.ts', import.meta.url), 'utf8');

test('backup settings event bindings live in their dedicated module', () => {
  assert.match(main, /import \{ bindBackupSettingsEvents \} from '\.\/modules\/backup-settings-events';/);
  assert.equal((main.match(/bindBackupSettingsEvents\(\);/g) || []).length, 1);
  assert.match(moduleSource, /export function bindBackupSettingsEvents\(\): void/);
  for (const id of ['btnExportUnifiedBackup', 'btnImportUnifiedBackup', 'btnConnectGoogleDriveAccount', 'btnDisconnectGoogleDriveAccount', 'btnRunAutoBackupNow', 'btnSetupBackupPassword', 'btnGenerateOrgRecoveryKey', 'btnRefreshBackupList']) {
    assert.ok(moduleSource.includes(id), `missing backup control binding: ${id}`);
  }
});

test('backup event extraction does not move boot/auth ordering', () => {
  const render = main.indexOf('renderShell(bindEvents, setupVirtualLists);');
  const auth = main.indexOf('initLocalAuth();');
  const scheduler = main.indexOf('initExternalAutoBackupScheduler();');
  assert.ok(render >= 0 && auth > render && scheduler > auth);
});
