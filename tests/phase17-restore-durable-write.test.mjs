import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/modules/device-auto-backup.ts', import.meta.url), 'utf8');
const recoveryStart = source.indexOf('export async function recoverInterruptedSelectedRestore');
const recoveryEnd = source.indexOf('/** زمان‌بندی پشتیبان', recoveryStart);
const recovery = source.slice(recoveryStart, recoveryEnd);

function assertDurableGuard(block, variable, message) {
  const assignment = block.indexOf(`const ${variable} = await persistAppState(`);
  assert.ok(assignment >= 0, `missing persist result capture: ${variable}`);
  const guard = block.indexOf(`${variable} !== 'idb'`, assignment);
  assert.ok(guard > assignment, `missing durable IndexedDB guard: ${variable}`);
  return guard;
}

test('interrupted restore does not commit modules or clear journal unless app state is durably saved', () => {
  const guard = assertDurableGuard(recovery, 'recoveryStorageBackend');
  const financialCommit = recovery.indexOf('await commitRestoredFinancialSnapshot(', guard);
  const clearJournal = recovery.indexOf("localStorage.removeItem('anbarin_restore_journal_v1')", guard);
  assert.ok(financialCommit > guard);
  assert.ok(clearJournal > financialCommit);
  assert.match(recovery.slice(guard, clearJournal), /نشانگر بازیابی حفظ شد/);
});

test('all selected restore entry points reject partial localStorage fallback', () => {
  const selectedStart = source.indexOf('export async function restoreSelectedExternalBackup');
  const selectedEnd = source.indexOf('export async function restoreBackupFile', selectedStart);
  const selected = source.slice(selectedStart, selectedEnd);
  assertDurableGuard(selected, 'restoreStorageBackend');
  assertDurableGuard(selected, 'rollbackStorageBackend');

  const manualStart = source.indexOf('export async function restoreBackupFile');
  const manualEnd = source.indexOf('export async function recoverInterruptedSelectedRestore', manualStart);
  const manual = source.slice(manualStart, manualEnd);
  assertDurableGuard(manual, 'restoreStorageBackend');
  assertDurableGuard(manual, 'rollbackStorageBackend');
});

test('automatic external recovery rejects incomplete app-state persistence before financial writes', () => {
  const start = source.indexOf('// بازگردانی state اصلی از طریق بازنویسی و boot دوباره');
  const end = source.indexOf('await bootState();', start);
  const block = source.slice(start, end);
  assertDurableGuard(block, 'restoreStorageBackend');
  assert.ok(block.indexOf('restoreStorageBackend !== \'idb\'') < block.indexOf('await commitRestoredFinancialSnapshot('));
});
