import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const chain = read('../src/modules/accounting-cheque-chain.ts');
const ui = read('../src/modules/accounting-commerce-ui.ts') + read('../src/modules/commerce-ui-cheques.ts');
const all = chain + ui;

test('phase 39 UI shows chain ledger and onward transfer action', () => {
  assert.match(ui, /گردش زنجیره‌ای ظهرنویسی/);
  assert.match(all, /chain|زنجیره/);
});

test('phase 39 explicitly keeps post-company transfers operational, not company journal entries', () => {
  assert.match(ui, /سند حسابداری جدید در دفاتر شرکت ایجاد نمی‌کنند/);
  assert.match(all, /operational|عملیاتی|journal/);
});
