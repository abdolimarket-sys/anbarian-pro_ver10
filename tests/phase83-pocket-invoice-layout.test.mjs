import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/modules/accounting-commerce-ui.ts', import.meta.url), 'utf8');
const print = readFileSync(new URL('../src/modules/commerce-ui-print.ts', import.meta.url), 'utf8');
const wrapperStart = source.indexOf('function buildInvoiceHtmlThermalTemplate(');
const wrapperEnd = source.indexOf('function buildInvoiceHtmlThermal(invoiceId:string,widthMm:58|80)', wrapperStart);
const wrapper = source.slice(wrapperStart, wrapperEnd);

test('58mm and 80mm thermal invoices use one shared responsive template module', () => {
  assert.ok(wrapperStart >= 0 && wrapperEnd > wrapperStart, 'UI adapter must exist');
  assert.match(wrapper, /return buildThermalInvoiceHtml\(invoice,party,businessProfile\(\),widthMm/);
  assert.match(print, /export function buildThermalInvoiceHtml\(/);
  assert.match(print, /@page\{size:\$\{widthMm\}mm auto/);
  assert.match(print, /widthMm===58\?/);
  assert.match(print, /class="store-head"/);
  assert.match(print, /class="party-card"/);
  assert.match(print, /class="totals"/);
  assert.match(print, /line-height:1\.28/);
});

test('thermal public builder delegates both widths to the same template module', () => {
  const start = source.indexOf('function buildInvoiceHtmlThermal(invoiceId:string,widthMm:58|80)');
  const end = source.indexOf('function resolveInvoiceForPrint()', start);
  const body = source.slice(start, end);
  assert.match(body, /return buildInvoiceHtmlThermalTemplate\(invoiceId,widthMm\)/);
  assert.doesNotMatch(source, /function buildInvoiceHtmlThermal80\(/);
});

test('invoice items expose requested columns and stack line amount with discount', () => {
  for (const heading of ['ردیف', 'عنوان کالا', 'تعداد', 'قیمت واحد (مصرف‌کننده)', 'مبلغ بعد از تخفیف']) {
    assert.ok(print.includes(heading), `missing column ${heading}`);
  }
  assert.match(print, /class="amount-cell"/);
  assert.match(print, /تخفیف:/);
});

test('invoice totals and payment details are arranged in two columns', () => {
  assert.match(print, /class="totals"/);
  assert.match(print, /class="more-info"/);
  assert.match(print, /grid-template-columns:1fr 1fr/);
  assert.match(print, /مبلغ نهایی فاکتور/);
});

test('A5 invoice print applies a compact page box and fit scaling to reduce accidental second pages', () => {
  assert.match(print, /@page \{ size:\$\{a5\?'A5':'A4'\} portrait; margin:\$\{a5\?'5mm':'9mm'\}; \}/);
  assert.match(print, /body\.invoice-print \{ zoom:\.82!important; \}/);
});
