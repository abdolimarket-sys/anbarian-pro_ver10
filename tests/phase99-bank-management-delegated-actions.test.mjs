import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const actions = fs.readFileSync('src/modules/commerce-ui-actions.ts', 'utf8');
const ui = fs.readFileSync('src/modules/accounting-commerce-ui.ts', 'utf8');

const selectors = [
  '#bankTransferSave', '#bankStatementImport', '#bankMoveSave',
  '#bankFeeSave', '#bankLedgerLoad',
];

test('مرحله ۱۰: پنج عملیات بانکی به binder مستقل متصل هستند', () => {
  for (const selector of selectors) assert.ok(actions.includes(selector), `missing ${selector}`);
  assert.match(ui, /bindBankManagementActions\(document,/);
});

test('مرحله ۱۰: اتصال مستقیم رویدادهای بانکی از فایل رابط حذف شده است', () => {
  for (const selector of selectors) {
    assert.ok(!ui.includes(`el<HTMLButtonElement>('${selector}')?.addEventListener`), `direct listener remains: ${selector}`);
  }
});

test('مرحله ۱۰: جلوگیری از اتصال چندباره با WeakSet انجام می‌شود', () => {
  assert.match(actions, /bankManagementBoundRoots\s*=\s*new WeakSet/);
  assert.match(actions, /if \(bankManagementBoundRoots\.has\(root\)\) return/);
});

test('مرحله ۱۰: callbackهای عملیات بانکی بدون تغییر قرارداد داده از binder فراخوانی می‌شوند', () => {
  for (const handler of ['onTransfer', 'onStatementImport', 'onMove', 'onFee', 'onLedgerLoad']) {
    assert.match(ui, new RegExp(`${handler}: async \\(\\) =>`));
  }
});
