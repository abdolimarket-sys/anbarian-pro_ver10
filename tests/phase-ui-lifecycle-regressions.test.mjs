import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const scanner = fs.readFileSync(new URL('../src/modules/scanner.ts', import.meta.url), 'utf8');
const scannerController = fs.readFileSync(new URL('../src/modules/scanner-controller.ts', import.meta.url), 'utf8');
const count = fs.readFileSync(new URL('../src/modules/count.ts', import.meta.url), 'utf8');
const productList = fs.readFileSync(new URL('../src/modules/product-list-controller.ts', import.meta.url), 'utf8');
const reportEvents = fs.readFileSync(new URL('../src/modules/report-events.ts', import.meta.url), 'utf8');
const headerUpdater = fs.readFileSync(new URL('../src/modules/header-updater.ts', import.meta.url), 'utf8');

function functionBody(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing ${signature}`);
  const end = source.indexOf(nextSignature, start + signature.length);
  return source.slice(start, end < 0 ? source.length : end);
}

test('cardex product select refreshes after product mutations and preserves valid selection', () => {
  assert.match(main, /function refreshCardexProductSelect\(\): void/);
  assert.match(main, /select\.replaceChildren\(fragment\)/);
  assert.match(main, /products\.some\(\(product\) => product\.id === selectedId\) \? selectedId : ''/);
  assert.match(main, /function refreshLists\(\) \{[\s\S]*?refreshCardexProductSelect\(\);/);
  assert.match(productList, /setProductsChangeListener\(\(\) => \{[\s\S]*?callbacks\.refreshCardexProductSelect\(\);/);
  assert.match(productList, /callbacks\.refreshCardexProductSelect\(\)/);
  assert.match(reportEvents, /cardexSelect\.addEventListener\('change'/);
});

test('scanner capabilities refresh after lazy Html5Qrcode load settles', () => {
  assert.match(scanner, /anbarin:scanner-capabilities-changed/);
  assert.match(scannerController, /addEventListener\('anbarin:scanner-capabilities-changed', updateScannerCapabilities\)/);
  assert.match(scannerController, /export function updateScannerCapabilities\(\)/);
  assert.match(main, /updateScannerCapabilities\(\);/);
});

test('literal source IDs are unique and count listener is a replaceable singleton', () => {
  const srcRoot = new URL('../src/', import.meta.url);
  const ids = new Map();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.ts')) {
        const text = fs.readFileSync(full, 'utf8');
        for (const match of text.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) {
          const id = match[1];
          const list = ids.get(id) || [];
          list.push(`${full}:${text.slice(0, match.index).split('\n').length}`);
          ids.set(id, list);
        }
      }
    }
  }
  walk(srcRoot.pathname);
  // These IDs occur in alternative render templates, never in the same rendered tree.
  const mutuallyExclusiveTemplateIds = new Set([
    'invoiceLandedSummary', 'invoicePrintInternal', 'openInvoiceTypeSheet',
  ]);
  const duplicates = [...ids.entries()].filter(([id, locations]) =>
    locations.length > 1 && !mutuallyExclusiveTemplateIds.has(id)
  );
  assert.deepEqual(duplicates, [], `duplicate literal IDs: ${JSON.stringify(duplicates)}`);
  assert.equal((main.match(/setCountChangeListener\(/g) || []).length, 1);
  assert.match(count, /let onCountChanged: \(\(\) => void\) \| null = null/);
  assert.match(count, /onCountChanged = fn/);
});

test('dynamic report actions use one delegated listener, not updateHeader rebinding', () => {
  const updateHeader = functionBody(headerUpdater, 'export function updateHeader(root: Document = document): void {', '\n}');
  assert.doesNotMatch(updateHeader, /addEventListener\(/);
  assert.match(reportEvents, /let dynamicReportActionsBound = false/);
  assert.match(reportEvents, /if \(dynamicReportActionsBound\) return/);
  assert.match(reportEvents, /document\.addEventListener\('click'/);
});

test('session buttons use one delegated handler and suppress concurrent repeated clicks', () => {
  const access = fs.readFileSync(new URL('../src/modules/access-session-events.ts', import.meta.url), 'utf8');
  assert.match(access, /let sessionControlEventsBound = false/);
  assert.match(access, /if \(sessionControlEventsBound\) return/);
  assert.match(access, /closest<HTMLButtonElement>\('#btnStartSession, #btnCloseSession'\)/);
  assert.match(access, /target\.dataset\.actionPending === 'true'/);
  assert.doesNotMatch(main, /getElementById\('btnStartSession'\)\?\.addEventListener/);
  assert.doesNotMatch(main, /getElementById\('btnCloseSession'\)\?\.addEventListener/);
});
