import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('external backup writes are protected by a shared exclusive operation key', () => {
  const source = read('src/modules/device-auto-backup.ts');
  assert.match(source, /runExclusive\('backup-storage-mutation',\s*\(\)\s*=>\s*writeExternalAutoBackupUnlocked\(force\),\s*false\)/);
  assert.match(source, /async function writeExternalAutoBackupUnlocked/);
});

test('manual and selected-device restores share one mutual exclusion key', () => {
  const source = read('src/modules/device-auto-backup.ts');
  const matches = source.match(/runExclusive\('backup-storage-mutation'/g) || [];
  assert.equal(matches.length, 3, 'backup write and both restore entry points must share the same lock');
  assert.match(source, /restoreSelectedExternalBackupUnlocked/);
  assert.match(source, /restoreBackupFileUnlocked/);
  assert.match(source, /عملیات بازیابی دیگری در حال اجراست/);
});

test('exclusive operation lock releases its key in a finally block', () => {
  const source = read('src/modules/async-operation-lock.ts');
  assert.match(source, /if\s*\(activeOperations\.has\(key\)\)\s*return busyResult/);
  assert.match(source, /activeOperations\.add\(key\)/);
  assert.match(source, /finally\s*\{\s*activeOperations\.delete\(key\)/);
});
