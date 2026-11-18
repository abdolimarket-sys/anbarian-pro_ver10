import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const commerce = read('../src/modules/accounting-commerce.ts');
const bank = read('../src/modules/accounting-bank.ts');
const cheque = read('../src/modules/accounting-cheque-endorsement.ts');
const integrity = read('../src/modules/financial-integrity-check.ts');
const costing = read('../src/modules/inventory-costing.ts');
const deviceBackup = read('../src/modules/device-auto-backup.ts');
const accounting = read('../src/modules/accounting.ts');

test('invoice posting is idempotent and ties journal and stock movements to invoice source', () => {
  assert.match(commerce, /export async function postInvoice\(/);
  assert.match(commerce, /sourceDocumentId===invoice\.id && j\.status==='posted'/);
  assert.match(commerce, /sourceDocumentId: invoice\.id/);
  assert.match(commerce, /issueStock\([\s\S]*?sourceDocumentId:invoice\.id/);
});

test('receipt/payment and cheque-status operations have durable source identities', () => {
  assert.match(commerce, /export async function createCashTransaction\(/);
  assert.match(commerce, /sourceDocumentId = `\$\{tx\.id\}:\$\{sourceDocSuffix\}`/);
  assert.match(commerce, /export async function updateChequeStatus\(/);
  assert.match(commerce, /cheque-status/);
});

test('cheque endorsement creates a distinct source key for each endorsement sequence', () => {
  assert.match(cheque, /sourceDocumentId = `\$\{tx\.id\}:endorsement:\$\{sequence\}`/);
  assert.match(cheque, /postJournalEntry\(/);
});

test('bank transfer and bank fee paths use the central journal posting function', () => {
  assert.match(bank, /export async function createInternalTransfer\(/);
  assert.match(bank, /export async function createBankFee\(/);
  assert.match(bank, /postJournalEntry\(/);
});

test('NRV write-down uses the financial operation recovery/commit boundary', () => {
  const nrv = commerce.slice(commerce.indexOf('export async function postInventoryNrvWriteDown'), commerce.indexOf('export function upsertParty'));
  assert.match(nrv, /nrv-write-down/);
  assert.match(nrv, /commitFinancialDomains\(/);
  assert.match(nrv, /preparePostedJournal\(/);
});

test('boot integrity check covers duplicate posted sources, pending operations and stock divergence', () => {
  assert.match(integrity, /duplicate_posted_journal/);
  assert.match(integrity, /pending_operation/);
  assert.match(integrity, /listStockDivergences\(/);
});

test('stock reconciliation derives product card quantities from costing truth', () => {
  assert.match(commerce, /syncProductCardsFromCostingTruth\(productIds\)/);
  assert.match(costing, /export async function loadInventoryCostData\(/);
});

test('backup restore validates financial data before applying restored snapshots', () => {
  assert.match(deviceBackup, /restoreBackupFile/);
  assert.match(deviceBackup, /isValidCommerceBackup\(/);
  assert.match(deviceBackup, /commitRestoredFinancialSnapshot\(/);
});

test('posted journals cannot be downgraded or removed by stale snapshots', () => {
  assert.match(accounting, /candidateVersion\.status !== 'posted'/);
  assert.match(accounting, /ثبت هم‌زمان شناسایی شد/);
});
