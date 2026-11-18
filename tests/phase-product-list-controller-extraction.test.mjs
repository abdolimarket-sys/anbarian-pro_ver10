import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const moduleSource = readFileSync(new URL('../src/modules/product-list-controller.ts', import.meta.url), 'utf8');

test('product search, location filters, CRUD entry and virtual lists live outside main.ts', () => {
  assert.match(main, /createProductListController/);
  assert.match(main, /productListController\.bindEvents\(\{ updateHeader, refreshCardexProductSelect \}\)/);
  for (const marker of ['searchProducts', 'searchCount', 'locationFilterSelect', 'locationFilterSelectProducts', 'btnAddProduct', '.filter-chip']) {
    assert.ok(moduleSource.includes(marker), `missing extracted product-list behavior: ${marker}`);
    assert.ok(!main.includes(`getElementById('${marker}')?.addEventListener`), `event remains in main.ts: ${marker}`);
  }
  for (const fn of ['function renderProductRow', 'function renderCountRow', 'function setupVirtualLists']) {
    assert.ok(moduleSource.includes(fn), `missing extracted function: ${fn}`);
    assert.ok(!main.includes(fn), `function remains in main.ts: ${fn}`);
  }
});

test('product list module keeps debounce, location synchronization and idempotent registration', () => {
  assert.match(moduleSource, /setTimeout\(\(\) => refreshLists\(\), 180\)/);
  assert.match(moduleSource, /if \(productEventsBound\) return/);
  assert.match(moduleSource, /setLocationFilter\(val\)/);
  assert.match(moduleSource, /callbacks\.refreshCardexProductSelect\(\)/);
});
