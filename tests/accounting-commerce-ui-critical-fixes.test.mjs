import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../src/modules/accounting-commerce-ui.ts', import.meta.url), 'utf8');

test('party edit sheet preserves the selected party id and labels edit mode', () => {
  const start = ui.indexOf('function openPartyFormSheet(');
  const end = ui.indexOf('\nfunction periodOptions()', start);
  const body = ui.slice(start, end);
  assert.match(body, /const editingNow=!!editingPartyId/);
  assert.match(body, /if\(!editingNow\) editingPartyId=null/);
  assert.match(body, /editingNow\?'ویرایش طرف حساب':'تعریف شخص جدید'/);
});

test('invoice date must belong to an open fiscal period; no last-open-period fallback', () => {
  const start = ui.indexOf('async function invoicePeriodForDate(');
  const end = ui.indexOf('\nasync function refreshFiscalCache()', start);
  const body = ui.slice(start, end);
  assert.match(body, /if\(exact\) return exact\.id/);
  assert.match(body, /هیچ دوره مالی بازی وجود ندارد/);
  assert.doesNotMatch(body, /open\[open\.length-1\]/);
  assert.doesNotMatch(body, /activeFiscalPeriodId\(\)/);
});

test('fiscal refresh also refreshes period option markup', () => {
  const start = ui.indexOf('async function refreshFiscalCache()');
  const end = ui.indexOf('\nfunction todayJalali()', start);
  assert.match(ui.slice(start, end), /refreshCommerceFiscalCache/);
  assert.match(ui, /select\.innerHTML=periodOptions\(\)/);
});

test('manual invoice tax is protected from automatic recalculation', () => {
  assert.match(ui, /taxInput\.dataset\.autoFilled!=='false'/);
  assert.match(ui, /dataset\.autoFilled='false';updateInvoiceTotals\(\)/);
  assert.match(ui, /taxInput\.dataset\.autoFilled='true'/);
});

test('invoice line numbers are refreshed after append and removal', () => {
  assert.match(ui, /function updateInvoiceLineNumbers\(host:HTMLElement\)/);
  assert.match(ui, /row\.remove\(\);updateInvoiceLineNumbers\(host\)/);
  assert.match(ui, /host\.appendChild\(row\);\s*updateInvoiceLineNumbers\(host\)/);
});

test('settlement failure reloads persisted commerce state before reporting the error', () => {
  const start = ui.indexOf('function openInvoiceSettlementSheet(');
  const end = ui.indexOf('\n/** محاسبات تعداد', start);
  const body = ui.slice(start, end);
  assert.match(body, /const recovered=await loadCommerceData\(\)/);
  assert.match(body, /if\(recovered\) commerce=recovered/);
});


test('cash receipt/payment UI does not overwrite the atomic financial commit with a stale snapshot', () => {
  const start = ui.indexOf("onSave: async () =>");
  const end = ui.indexOf("onChequeClear:", start);
  const handler = ui.slice(start, end);
  assert.ok(start >= 0 && end > start, 'delegated cash save callback must be present');
  assert.match(handler, /createCashTransaction\(/);
  assert.match(handler, /commerce=result\.commerce;render\(\);refreshAccounting\(\)/);
  assert.doesNotMatch(handler, /saveCommerceData\(commerce\)/);
});


test('invoice settlement sheet does not rewrite commerce after atomic invoice and payment commits', () => {
  const start = ui.indexOf("overlay.querySelector<HTMLButtonElement>('#settlementConfirm')");
  const end = ui.indexOf('\n/** محاسبات تعداد', start);
  const body = ui.slice(start, end);
  assert.ok(start >= 0 && end > start, 'invoice settlement sheet must be present');
  assert.match(body, /await postInvoice\(target\.id,commerce\)/);
  assert.match(body, /createCashTransaction\(/);
  assert.doesNotMatch(body, /await saveCommerceData\(commerce!\)/);
});
