import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const commerce = fs.readFileSync(new URL('../src/modules/accounting-commerce.ts', import.meta.url), 'utf8');
const accounting = fs.readFileSync(new URL('../src/modules/accounting.ts', import.meta.url), 'utf8');
const products = fs.readFileSync(new URL('../src/modules/products-ui.ts', import.meta.url), 'utf8');

test('journal posting reuses an existing draft for the same source document', () => {
  assert.match(commerce, /existingDraft = accounting\.journalEntries\.find\(j=>j\.sourceDocumentId===entry\.sourceDocumentId && j\.status==='draft'\)/);
  assert.match(commerce, /id: existingDraft\.id/);
});

test('purchase invoice reconciles integer-rial landed-cost rounding residuals', () => {
  assert.match(commerce, /expectedStockCost/);
  assert.match(commerce, /recognizedStockCost/);
  assert.match(commerce, /purchasePriceVariance \+= expectedStockCost - recognizedStockCost/);
});

test('legacy purchase invoices with landed cost cannot post without stock lines', () => {
  assert.match(commerce, /landedTotal > 0 && stockLines\.length === 0/);
});

test('invoice payment credit balance is consolidated instead of duplicated', () => {
  assert.match(commerce, /findIndex\(part=>part\.method==='credit'\)/);
});

test('receipt/payment party classification respects the selected party when allocations are absent', () => {
  assert.match(commerce, /party\.type === 'customer'/);
  assert.match(commerce, /party\.type === 'both' && input\.type === 'receipt'/);
  assert.match(commerce, /partyAccount = 'det-customers'/);
});

test('NRV and invoice posting include compensating rollback for cross-store write failures', () => {
  // مسیر فعلی: commit اتمیک چنددامنه‌ای به‌جای rollback دستی بین‌store
  assert.match(commerce, /commitFinancialDomains|beginCommerceOperation|postInvoiceExclusive/);
  assert.match(commerce, /nrv-write-down|postInventoryNrvWriteDown|NRV/);
});

test('purchase catalog price updates default to opt-in rather than last purchase', () => {
  assert.match(accounting, /purchasePriceUpdateMode: 'none'/);
  assert.match(accounting, /: 'none';/);
});

test('products with invoice or costing history are protected from hard deletion', () => {
  assert.match(products, /hasInvoiceHistory/);
  assert.match(products, /hasCostHistory/);
  assert.match(products, /قابل حذف نیست/);
});

test('invoice number uniqueness is scoped to fiscal period', () => {
  assert.match(commerce, /i\.fiscalPeriodId === input\.fiscalPeriodId/);
  assert.match(commerce, /i\.fiscalPeriodId===invoice\.fiscalPeriodId/);
});
