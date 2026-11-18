import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/modules/commerce-ui-sheet.ts', import.meta.url), 'utf8');
const moduleSource = fs.readFileSync(new URL('../src/modules/commerce-ui-panel-render.ts', import.meta.url), 'utf8');
const workspaceSource = fs.readFileSync(new URL('../src/modules/commerce-ui-workspace.ts', import.meta.url), 'utf8');
const commerceUi = fs.readFileSync(new URL('../src/modules/accounting-commerce-ui.ts', import.meta.url), 'utf8');

test('commerce panel shell rendering is delegated to the pure render module', () => {
  assert.match(source, /buildCommercePanelShellHtml\(section\)/);
  assert.match(source, /buildCommercePanelEmptyHtml\(\)/);
  assert.match(commerceUi, /commercePanelSectionKey\(section\)/);
  assert.doesNotMatch(source, /titles:Record<CommercePanelSection,string>/);
});

test('panel renderer preserves all panel titles and invoice type actions', () => {
  for (const title of ['فاکتور فروش', 'فاکتور خرید', 'دریافت / پرداخت', 'چک‌ها', 'سررسید', 'بانک', 'سودآوری', 'انبار', 'طرف حساب‌ها', 'هزینه و درآمد']) {
    assert.ok(moduleSource.includes(title), `missing panel title: ${title}`);
  }
  for (const type of ['sale', 'purchase', 'return-sale', 'return-purchase', 'proforma']) {
    assert.ok(moduleSource.includes(`data-new-invoice-type="${type}"`), `missing invoice action: ${type}`);
  }
});

test('sale and purchase panels continue to share the invoice mount key', () => {
  assert.match(moduleSource, /section === 'sale' \|\| section === 'purchase' \? 'invoices' : section/);
});
