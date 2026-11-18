import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/modules/accounting-commerce-ui.ts', import.meta.url), 'utf8');
const cache = readFileSync(new URL('../src/modules/commerce-ui-fiscal-cache.ts', import.meta.url), 'utf8');
const math = readFileSync(new URL('../src/modules/commerce-ui-invoice-math.ts', import.meta.url), 'utf8');

test('accounting updates refresh commerce fiscal-period cache without duplicate listeners', () => {
  assert.match(ui, /let fiscalCacheListenerBound=false/);
  const start = ui.indexOf('function bindFiscalCacheRefresh()');
  const end = ui.indexOf('\nfunction todayJalali()', start);
  const body = ui.slice(start, end);
  assert.match(body, /if\(fiscalCacheListenerBound\)return/);
  assert.match(body, /window\.addEventListener\('accounting:data-updated'/);
  assert.match(body, /void refreshFiscalCache\(\)\.then/);
  assert.match(body, /select\.innerHTML=periodOptions\(\)/);
  assert.match(cache, /refreshSequence/);
  assert.match(cache, /if\(request!==refreshSequence\)return/);
});

test('manual fiscal-period selection is retained only while its period remains open', () => {
  const start = ui.indexOf('function bindFiscalCacheRefresh()');
  const end = ui.indexOf('\nfunction todayJalali()', start);
  const body = ui.slice(start, end);
  assert.match(body, /periods\.some\(p=>p\.id===previous&&p\.status==='open'\)/);
  assert.match(body, /periods\.find\(p=>p\.status==='open'\)/);
});

test('invoice pack quantities convert to base units for stock and automatic discount', () => {
  assert.match(math, /return mode==='pack'\?quantity\*invoiceLineUnitFactor\(row,products\):quantity/);
  assert.match(math, /suggestedProductDiscountRial\(product:Product,baseQuantity:number\)/);
  assert.match(math, /discountPerBaseUnit\*Math\.max\(0,baseQuantity\)/);
  assert.match(ui, /suggestedProductDiscountRial\(product,qty\)/);
});
