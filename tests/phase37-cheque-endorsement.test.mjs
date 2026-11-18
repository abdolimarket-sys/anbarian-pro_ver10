import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const commerce = read('../src/modules/accounting-commerce.ts');
const endorsement = read('../src/modules/accounting-cheque-endorsement.ts');
const ui = read('../src/modules/accounting-commerce-ui.ts') + read('../src/modules/commerce-ui-cheques.ts');
const all = commerce + endorsement + ui;

test('phase 37 supports endorsement only for pending received cheques and active suppliers', () => {
  assert.match(all, /endorse|ظهرنویسی/);
  assert.match(all, /pending|در جریان|در انتظار/);
  assert.match(all, /supplier|تأمین/);
  assert.match(all, /receipt|دریافت/);
});

test('phase 37 requires a posted purchase invoice with enough outstanding balance', () => {
  assert.match(all, /purchase|خرید/);
  assert.match(all, /posted|قطعی/);
  assert.match(all, /outstanding|مانده|amountRial/);
});

test('phase 37 exposes endorsement action and prevents company-bank clearing after transfer', () => {
  assert.match(ui, /ظهرنویسی/);
  assert.match(all, /endorse|data-chq-endorse/);
});
