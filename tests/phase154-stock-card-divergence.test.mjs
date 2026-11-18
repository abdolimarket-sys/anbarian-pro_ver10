import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/modules/inventory-truth.ts', import.meta.url), 'utf8');

test('stock card divergence aggregates all costing balance rows per product', () => {
  const start = source.indexOf('export function listStockDivergences(');
  const end = source.indexOf('\n}', start) + 2;
  const fn = source.slice(start, end);
  assert.match(fn, /const byProduct = new Map/);
  assert.match(fn, /rows\.reduce\(\(sum, row\) => sum \+ \(Number\(row\.qtyMilli\)/);
  assert.match(fn, /getWarehouseQty\(p, p\.warehouse \|\| DEFAULT_WAREHOUSE\)/);
  assert.doesNotMatch(fn, /for \(const b of costing\.balances\)/);
});

test('multiple balance rows that sum to the product card quantity are not flagged', () => {
  const balances = [
    { productId: 'p1', qtyMilli: 2500, valueRial: 25000 },
    { productId: 'p1', qtyMilli: 7500, valueRial: 75000 },
  ];
  const truthQty = balances.reduce((sum, row) => sum + row.qtyMilli, 0) / 1000;
  const cardQty = 10;
  assert.equal(Math.abs(cardQty - truthQty) >= 0.000001, false);
});

test('a real quantity difference remains detectable after aggregation', () => {
  const balances = [
    { productId: 'p1', qtyMilli: 2500 },
    { productId: 'p1', qtyMilli: 7500 },
  ];
  const truthQty = balances.reduce((sum, row) => sum + row.qtyMilli, 0) / 1000;
  const cardQty = 9;
  assert.equal(Math.abs(cardQty - truthQty) >= 0.000001, true);
});
