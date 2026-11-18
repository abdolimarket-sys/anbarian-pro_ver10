import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const storage = fs.readFileSync(new URL('../src/modules/storage.ts', import.meta.url), 'utf8');
const accounting = fs.readFileSync(new URL('../src/modules/accounting.ts', import.meta.url), 'utf8');

test('guarded IndexedDB writer performs read-check-write in one readwrite transaction', () => {
  assert.match(storage, /db\.transaction\(STORE, 'readwrite'\)/);
  assert.match(storage, /const request = store\.get\(guardKey\)/);
  assert.match(storage, /guard\(request\.result\)/);
  assert.match(storage, /for \(const entry of entries\) store\.put\(entry\.value, entry\.key\)/);
});

test('accounting snapshots are committed only after comparing against latest persisted snapshot', () => {
  assert.match(accounting, /idbPutManyGuarded\(/);
  assert.match(accounting, /currentPosted\.get\(sourceId\)/);
  assert.match(accounting, /ثبت هم‌زمان شناسایی شد/);
  assert.match(accounting, /candidateSources\.get\(sourceId\)/);
});

test('guarded commit writes primary and backup snapshots in the same transaction', () => {
  assert.match(accounting, /\[\{ key: BACKUP_KEY, value: data \}, \{ key: DATA_KEY, value: data \}\]/);
});

test('atomic save rejects stale snapshots that downgrade or remove a committed posted journal', () => {
  assert.match(accounting, /candidateById\.get\(journal\.id\)/);
  assert.match(accounting, /!candidateVersion \|\| candidateVersion\.status !== 'posted'/);
  assert.match(accounting, /در نسخه ذخیره‌شده تغییر کرده است/);
});
