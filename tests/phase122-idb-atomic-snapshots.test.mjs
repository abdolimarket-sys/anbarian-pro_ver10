import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('IndexedDB can persist related snapshot keys in one readwrite transaction', () => {
  const storage = read('../src/modules/storage.ts');
  assert.match(storage, /export async function idbPutMany\(/);
  const body = storage.slice(storage.indexOf('export async function idbPutMany('), storage.indexOf('export async function idbGet'));
  assert.match(body, /db\.transaction\(STORE, 'readwrite'\)/);
  assert.match(body, /for \(const entry of entries\) store\.put\(entry\.value, entry\.key\)/);
  assert.match(body, /tx\.oncomplete/);
  assert.match(body, /tx\.onabort/);
});

test('accounting primary and backup snapshots are committed together', () => {
  const source = read('../src/modules/accounting.ts');
  assert.match(source, /idbPutManyGuarded\([\s\S]*?\[\{ key: BACKUP_KEY, value: data \}, \{ key: DATA_KEY, value: data \}\]/);
});

test('commerce and costing primary/backup snapshots are committed together', () => {
  const commerce = read('../src/modules/accounting-commerce.ts');
  const costing = read('../src/modules/inventory-costing.ts');
  assert.match(commerce, /idbPutMany\(\[\{ key: BACKUP, value: v \}, \{ key: KEY, value: v \}\]\)/);
  assert.match(costing, /idbPutMany\(\[\{key:BACKUP,value:x\},\{key:KEY,value:x\}\]\)/);
});
