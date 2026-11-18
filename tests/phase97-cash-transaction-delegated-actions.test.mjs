import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/modules/accounting-commerce-ui.ts', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../src/modules/commerce-ui-actions.ts', import.meta.url), 'utf8');

test('cash save and cheque status actions are delegated from the persistent document root', () => {
  assert.match(ui, /bindCashTransactionActions\(document,/);
  assert.doesNotMatch(ui, /el<HTMLButtonElement>\('#cashSave'\)\?\.addEventListener/);
  assert.doesNotMatch(ui, /querySelectorAll<HTMLElement>\('\[data-cheque-clear\]'\)/);
  assert.doesNotMatch(ui, /querySelectorAll<HTMLElement>\('\[data-cheque-bounce\]'\)/);
});

test('delegated cash actions preserve the existing business callbacks and are idempotent', () => {
  assert.match(actions, /const cashBoundRoots = new WeakSet/);
  assert.match(actions, /if \(cashBoundRoots\.has\(root\)\) return/);
  assert.match(actions, /target\.closest<HTMLElement>\('#cashSave'\)/);
  assert.match(actions, /target\.closest<HTMLElement>\('\[data-cheque-clear\]'\)/);
  assert.match(actions, /target\.closest<HTMLElement>\('\[data-cheque-bounce\]'\)/);
  assert.match(ui, /createCashTransaction\(/);
  assert.match(ui, /updateChequeStatus\(transactionId,'cleared'/);
  assert.match(ui, /updateChequeStatus\(transactionId,'bounced'/);
  assert.match(ui, /recordChequeEvent\(transactionId,'cleared_note'/);
  assert.match(ui, /recordChequeEvent\(transactionId,'bounced_note'/);
});
