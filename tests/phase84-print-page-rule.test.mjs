import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const helpers = readFileSync(new URL('../src/utils/helpers.ts', import.meta.url), 'utf8');

test('print helper preserves a page rule authored by the invoice template', () => {
  assert.ok(helpers.includes('if (!/@page\\s*\\{/.test(finalHtml))'));
  assert.ok(helpers.includes('اگر خود قالب @page دارد، اندازه و حاشیه‌های دقیق همان قالب را حفظ کن.'));
  assert.ok(!helpers.includes('finalHtml = finalHtml.replace(/@page\\s*\\{[^}]*\\}/g, pageRule)'));
});

test('print helper still injects the selected paper rule when a document has none', () => {
  assert.ok(helpers.includes("pocket58: '@page{size:58mm auto;margin:1.5mm}'"));
  assert.ok(helpers.includes("label80: '@page{size:80mm auto;margin:2mm}'"));
  assert.ok(helpers.includes('finalHtml = finalHtml.replace(/<\\/head>/i, `<style>${pageRule}</style></head>`)'));
});
