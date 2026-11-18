import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyRestoredIdentityMetadata } from '../src/modules/restore-identity-metadata.ts';

function createStorage(initial = {}, failOnWrite = null) {
  const values = new Map(Object.entries(initial));
  let writes = 0;
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      writes += 1;
      if (writes === failOnWrite) throw new Error('simulated quota/write failure');
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); },
  };
}

test('identity metadata updates both keys on success', () => {
  const storage = createStorage({ anbarin_local_users_v1: 'old-users', anbar_operator: 'old-op' });
  applyRestoredIdentityMetadata(storage, { localUsers: [{ id: 'u2' }], operator: 'operator-2' });
  assert.deepEqual(storage.snapshot(), {
    anbarin_local_users_v1: '[{"id":"u2"}]',
    anbar_operator: 'operator-2',
  });
});

test('failed second metadata write restores the first key and leaves prior values intact', () => {
  const storage = createStorage({ anbarin_local_users_v1: 'old-users', anbar_operator: 'old-op' }, 2);
  assert.throws(() => applyRestoredIdentityMetadata(storage, {
    localUsers: [{ id: 'u2' }], operator: 'operator-2',
  }), /simulated quota\/write failure/);
  assert.deepEqual(storage.snapshot(), {
    anbarin_local_users_v1: 'old-users',
    anbar_operator: 'old-op',
  });
});

test('automatic recovery applies identity metadata only after durable app and financial commits', async () => {
  const source = await readFile(new URL('../src/modules/device-auto-backup.ts', import.meta.url), 'utf8');
  const start = source.indexOf('// بازگردانی state اصلی از طریق بازنویسی و boot دوباره');
  const end = source.indexOf('await bootState();', start);
  const block = source.slice(start, end);
  const appWrite = block.indexOf('await persistAppState(');
  const appGuard = block.indexOf("restoreStorageBackend !== 'idb'", appWrite);
  const financialWrite = block.indexOf('await commitRestoredFinancialSnapshot(', appGuard);
  const metadataWrite = block.indexOf('applyRestoredIdentityMetadata(localStorage, parsed)');
  assert.ok(appWrite >= 0 && appGuard > appWrite);
  assert.ok(financialWrite > appGuard);
  assert.ok(metadataWrite > financialWrite);
});
