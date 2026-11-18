import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const accounting = fs.readFileSync(new URL('../src/modules/accounting.ts', import.meta.url), 'utf8');

test('phase 7 prevents bypassing formal close for periods with posted journals', () => {
  assert.match(accounting, /const posted = data\.journalEntries\.filter\(\(entry\) => entry\.fiscalPeriodId === periodId && entry\.status === 'posted'\)/);
  assert.match(accounting, /برای بستن صحیح، سند اختتامیه و افتتاحیه را تهیه/);
});
test('phase 7 keeps draft and empty-period handling explicit', () => {
  assert.match(accounting, /برای بستن سال مالی، ابتدا اسناد پیش‌نویس را تعیین تکلیف کنید/);
  assert.match(accounting, /export function closeFiscalPeriod/);
});
test('closing preview checks period boundaries and each posted journal balance', () => {
  assert.match(accounting, /تاریخ سند قطعی \$\{entry\.number\} خارج از محدوده دوره است/);
  assert.match(accounting, /سند قطعی \$\{entry\.number\} تراز یا معتبر نیست/);
  assert.match(accounting, /تراز گردش اسناد قطعی این دوره برقرار نیست/);
});
test('closing preview validates referenced accounts and line amounts', () => {
  assert.match(accounting, /حساب یکی از ردیف‌های سند \$\{entry\.number\} وجود ندارد/);
  assert.match(accounting, /مبلغ یا ماهیت ردیف سند \$\{entry\.number\} نامعتبر است/);
});
test('final close requires a valid open successor period in chronological order', () => {
  assert.match(accounting, /const next = data\.fiscalPeriods\.find\(\(period\) => period\.id === nextPeriodId\)/);
  assert.match(accounting, /سال مالی مقصد معتبر نیست یا تاریخ آن پس از دوره مبدأ قرار ندارد/);
});
test('final close validates posted closing and opening voucher period, date and balance', () => {
  assert.match(accounting, /سند اختتامیه با دوره مبدأ یا تراز مالی آن مطابقت ندارد/);
  assert.match(accounting, /سند افتتاحیه با دوره مقصد یا تراز مالی آن مطابقت ندارد/);
  assert.match(accounting, /const isBalanced = \(entry: JournalEntry\)/);
});
