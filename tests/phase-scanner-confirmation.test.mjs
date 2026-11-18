import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('invoice scan state is encapsulated by scanner module, not window globals', () => {
  const scanner = read('../src/modules/scanner.ts');
  const scannerController = read('../src/modules/scanner-controller.ts');
  const commerce = read('../src/modules/commerce-ui-invoice-search.ts');
  assert.match(scanner, /let invoiceScanActive = false/);
  assert.match(scanner, /export function beginInvoiceScan\(/);
  assert.match(scanner, /export function endInvoiceScan\(/);
  assert.match(scannerController, /isInvoiceScanActive\(\)/);
  assert.match(commerce, /beginInvoiceScan\(\)/);
  for (const source of [scanner, scannerController, commerce]) {
    assert.doesNotMatch(source, /__anbarinInvoiceScanActive|__anbarinScannerContinuousBeforeInvoice/);
  }
});

test('application confirmation UI does not delegate to browser confirm()', () => {
  const ui = read('../src/modules/ui.ts');
  const sourceFiles = [
    '../src/main.ts', '../src/modules/device-auto-backup.ts', '../src/modules/local-auth.ts',
    '../src/modules/data-health.ts', '../src/modules/import-export.ts', '../src/modules/license.ts',
    '../src/modules/accounting-commerce-ui.ts', '../src/modules/session-settings.ts',
    '../src/modules/count.ts', '../src/modules/accounting-ui.ts', '../src/modules/labels.ts',
    '../src/modules/audit-ui.ts', '../src/modules/team-sync.ts', '../src/modules/products-ui.ts',
    '../src/modules/photos.ts',
  ];
  assert.match(ui, /export function confirmAction\(/);
  assert.match(ui, /role', 'alertdialog'/);
  for (const path of sourceFiles) {
    const source = read(path);
    assert.doesNotMatch(source, /\b(?:window\.)?confirm\s*\(/, `${path} still uses browser confirm()`);
  }
});
