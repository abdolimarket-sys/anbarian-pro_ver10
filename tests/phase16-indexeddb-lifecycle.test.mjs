import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storage = readFileSync(new URL('../src/modules/storage.ts', import.meta.url), 'utf8');
const openBody = storage.slice(storage.indexOf('function openDB()'), storage.indexOf('export async function idbPut('));

test('IndexedDB open cache is cleared after a transient open failure', () => {
  assert.match(openBody, /void pending\.catch\(\(\) => \{ if \(dbPromise === pending\) dbPromise = null; \}\)/);
  assert.match(openBody, /req\.onerror[\s\S]*?reject\(req\.error/);
});

test('IndexedDB connections close on version change and release cached connection', () => {
  assert.match(openBody, /db\.onversionchange = \(\) =>/);
  assert.match(openBody, /db\.close\(\)/);
  assert.match(openBody, /if \(dbPromise === pending\) dbPromise = null/);
});

test('blocked IndexedDB upgrades are observable without prematurely settling open request', () => {
  assert.match(openBody, /req\.onblocked = \(\) =>/);
  assert.match(openBody, /console\.warn\('IndexedDB upgrade is blocked/);
  assert.doesNotMatch(openBody.slice(openBody.indexOf('req.onblocked'), openBody.indexOf('req.onsuccess')), /reject\(/);
});

test('single-key writes and deletes reject on transaction abort as well as error', () => {
  const putBody = storage.slice(storage.indexOf('export async function idbPut('), storage.indexOf('/** Write related keys'));
  const deleteBody = storage.slice(storage.indexOf('export async function idbDelete('), storage.indexOf('// ——— تنظیمات'));
  assert.match(putBody, /tx\.onabort/);
  assert.match(deleteBody, /tx\.onabort/);
  assert.match(putBody, /tx\.onerror/);
  assert.match(deleteBody, /tx\.onerror/);
});
