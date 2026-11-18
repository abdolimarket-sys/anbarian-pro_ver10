import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const actions = fs.readFileSync('src/modules/commerce-ui-actions.ts', 'utf8');
const ui = fs.readFileSync('src/modules/accounting-commerce-ui.ts', 'utf8');

test('مرحله ۹: شش اقدام مدیریت چک به binder مستقل متصل هستند', () => {
  for (const selector of [
    '[data-chq-endorse]', '[data-chain-endorsement]', '[data-chain-outcome]',
    '[data-chq-extend]', '[data-chq-replace]', '[data-chq-deposit]',
  ]) assert.ok(actions.includes(selector), `missing delegated selector ${selector}`);
  assert.match(ui, /bindChequeManagementActions\(document,/);
});

test('مرحله ۹: اتصال مستقیم تکرارشونده querySelectorAll برای اقدامات چک باقی نمانده است', () => {
  for (const selector of [
    '[data-chq-endorse]', '[data-chain-endorsement]', '[data-chain-outcome]',
    '[data-chq-extend]', '[data-chq-replace]', '[data-chq-deposit]',
  ]) assert.ok(!ui.includes(`querySelectorAll<HTMLElement>('${selector}')`), `direct listener remains for ${selector}`);
});

test('مرحله ۹: جلوگیری از اتصال چندباره listener با WeakSet انجام می‌شود', () => {
  assert.match(actions, /chequeManagementBoundRoots\s*=\s*new WeakSet/);
  assert.match(actions, /if \(chequeManagementBoundRoots\.has\(root\)\) return/);
});
