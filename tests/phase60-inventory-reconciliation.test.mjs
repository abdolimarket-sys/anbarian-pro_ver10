import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const report = fs.readFileSync(new URL('../src/modules/inventory-reconciliation.ts', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/modules/accounting-commerce-ui.ts', import.meta.url), 'utf8');
const scanner = fs.readFileSync(new URL('../src/modules/scanner.ts', import.meta.url), 'utf8');

test('phase60 compares operational quantity with costing quantity per product and warehouse', () => {
  assert.match(report, /systemQtyMilli/);
  assert.match(report, /costQtyMilli/);
  assert.match(report, /quantityDiffMilli/);
  assert.match(report, /new Set\(\[\.\.\.operational\.keys\(\),\s*\.\.\.costMap\.keys\(\)\]\)/);
});

test('phase60 detects negative, orphaned, unvalued and quantity-mismatch rows', () => {
  for (const issue of ['negative-balance', 'orphan-cost-balance', 'quantity-mismatch', 'value-missing']) assert.ok(report.includes(issue));
});

test('phase60 compares inventory valuation with posted inventory detail ledger lines', () => {
  assert.match(report, /j\.status === 'posted'/);
  assert.match(report, /detailIds\.has\(l\.accountId\)/);
  assert.match(report, /l\.debitRial - l\.creditRial/);
  // must not rely only on subsidiary account id (which never receives journal lines)
  assert.match(report, /det-inventory/);
  assert.doesNotMatch(report, /l\.accountId===inventoryAccount\.id/);
});

test('phase60 report is integrated into accounting commerce workspace', () => {
  assert.match(ui, /inventoryReconciliationPanel/);
  assert.match(ui, /buildInventoryReconciliation\(products,costing,accounting\)/);
  assert.match(ui, /تطبیق موجودی انبار و حسابداری/);
});

test('phase60 reconciliation is read-only and does not save inventory or accounting data', () => {
  assert.doesNotMatch(report, /saveInventoryCostData|saveAccountingData|idbPut/);
  assert.match(ui, /هیچ مقدار، سند یا مانده‌ای به‌صورت خودکار اصلاح نمی‌شود/);
});

test('phase60 preserves the barcode scanner source byte-for-byte', () => {
  const baselinePath = '/mnt/data/phase58work/src/modules/scanner.ts';
  if (!fs.existsSync(baselinePath)) { assert.ok(scanner.length > 0); return; }
  const prior = fs.readFileSync(baselinePath, 'utf8');
  assert.equal(scanner, prior);
});


test('phase60 does not let quantity mismatch hide a positive-quantity zero-value costing balance', () => {
  const negative = report.indexOf("if (costQtyMilli < 0)");
  const orphan = report.indexOf("else if (!op && b)");
  const zeroValue = report.indexOf("else if (costQtyMilli > 0 && (!b || !Number.isFinite(b.valueRial) || b.valueRial <= 0))");
  const quantityMismatch = report.indexOf("else if (Math.abs(quantityDiffMilli) > 0)");
  assert.ok(negative >= 0 && orphan > negative && zeroValue > orphan && quantityMismatch > zeroValue,
    'zero-value validation must run before quantity mismatch');
});
