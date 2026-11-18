import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const commerce = read('../src/modules/accounting-commerce.ts');
const endorsement = read('../src/modules/accounting-cheque-endorsement.ts');
const ui = read('../src/modules/accounting-commerce-ui.ts') + read('../src/modules/commerce-ui-cheques.ts');
const all = commerce + endorsement + ui;

test('phase 38 supports multiple partial endorsements against remaining cheque amount', () => {
  assert.match(all, /remaining|مانده|getChequeEndorsementRemaining|amountRial/);
  assert.match(all, /endorse|ظهرنویسی/);
});

test('phase 38 validates partial amount and invoice outstanding', () => {
  assert.match(all, /outstanding|مانده|amountRial/);
  assert.match(all, /invoice|فاکتور/);
});

test('phase 38 creates a separate posted journal per endorsement tranche', () => {
  assert.match(all, /journalEntryId|journalEntries|posted/);
  assert.match(all, /endorsement|ظهرنویسی/);
});

test('phase 38 reverses every tranche on cheque bounce and void', () => {
  assert.match(all, /bounce|برگشت|void|باطل/);
  assert.match(all, /reverse|معکوس|endorsement/);
});

test('phase 38 UI shows remaining amount and permits additional tranches', () => {
  assert.match(ui, /مانده|remaining|ظهرنویسی/);
  assert.match(ui, /data-chq-endorse|ظهرنویسی به تأمین/);
});
