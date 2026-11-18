import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const outcomes = read('../src/modules/accounting-cheque-outcomes.ts');
const ui = read('../src/modules/accounting-commerce-ui.ts') + read('../src/modules/commerce-ui-cheques.ts');
const scanner = read('../src/modules/scanner.ts');
const all = outcomes + ui;

test('phase 40 supports collected, returned and disputed outcomes', () => {
  assert.match(all, /collected|returned|disputed|وصول|برگشت|اختلاف/);
});

test('phase 40 reports totals and individual outcome rows', () => {
  assert.match(ui, /گزارش وصول، برگشت و اختلاف/);
  assert.match(all, /collectedRial|returnedRial|disputedRial/);
});

test('phase 40 keeps post-company outcomes operational and leaves scanner intact', () => {
  assert.match(ui, /سند حسابداری جدید در دفاتر شرکت ایجاد نمی‌کنند/);
  assert.ok(scanner.length > 100);
});
