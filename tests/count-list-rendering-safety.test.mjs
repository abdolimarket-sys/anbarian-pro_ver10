import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const productLists = readFileSync(new URL('../src/modules/product-list-controller.ts', import.meta.url), 'utf8');
const filters = readFileSync(new URL('../src/modules/filters-roles.ts', import.meta.url), 'utf8');

function extractFunction(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing function: ${signature}`);
  const end = source.indexOf(nextSignature, start);
  assert.notEqual(end, -1, `missing function boundary: ${nextSignature}`);
  return source.slice(start, end);
}

test('count list forwards countFilter and advanced filter implements all count states', () => {
  assert.match(productLists, /const getFilteredCountList = \(\): Product\[\] => filterProductsAdvanced\(\{ query: productSearchQuery, location: locationFilter, countFilter \}\)/);
  assert.match(filters, /cf === 'counted'[\s\S]*countedQty != null/);
  assert.match(filters, /cf === 'uncounted'[\s\S]*countedQty == null/);
  assert.match(filters, /cf === 'diff'[\s\S]*!qtyEqual\(p\.countedQty, p\.systemQty\)/);
});

test('product and count row renderers do not interpolate product data into innerHTML', () => {
  const productRow = extractFunction(productLists, 'function renderProductRow(p: Product)', '\n  function renderCountRow');
  const countRow = extractFunction(productLists, 'function renderCountRow(p: Product)', '\n  function setupVirtualLists');
  assert.doesNotMatch(productRow, /innerHTML\s*=/);
  assert.doesNotMatch(countRow, /innerHTML\s*=/);
  assert.match(productRow, /name\.textContent\s*=\s*p\.name/);
  assert.match(productRow, /meta\.textContent\s*=/);
  assert.match(countRow, /name\.textContent\s*=\s*p\.name/);
  assert.match(countRow, /meta\.textContent\s*=/);
});
