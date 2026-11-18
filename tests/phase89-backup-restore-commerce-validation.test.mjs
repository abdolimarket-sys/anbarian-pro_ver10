import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidCommerceBackup } from '../src/modules/backup-commerce-validation.js';
import fs from 'node:fs';

const restoreSource = fs.readFileSync(new URL('../src/modules/device-auto-backup.ts', import.meta.url), 'utf8');

test('shared runtime validator accepts invoices with more than 500 line rows (field: lines)', () => {
  const lines = Array.from({ length: 501 }, (_, index) => ({
    id: `l-${index + 1}`,
    productId: `p-${index + 1}`,
    quantityMilli: 1000,
    unitPriceRial: 1000,
    totalRial: 1000,
  }));
  const commerce = { schemaVersion: 1, invoices: [{ id: 'large-invoice', lines }], parties: [], cashTransactions: [] };
  assert.equal(isValidCommerceBackup(commerce), true);
  assert.equal(commerce.invoices[0].lines.length, 501);
  assert.equal(commerce.invoices[0].lines[500].productId, 'p-501');
});

test('shared runtime validator rejects malformed invoice lines before restore writes', () => {
  assert.equal(isValidCommerceBackup({ schemaVersion: 1, invoices: [{ lines: 'not-an-array' }], parties: [] }), false);
  assert.equal(isValidCommerceBackup({ schemaVersion: 1, invoices: [{ lines: [null] }], parties: [] }), false);
  assert.equal(isValidCommerceBackup({ schemaVersion: 1, invoices: [{ items: 'not-an-array' }], parties: [] }), false);
});

test('shared runtime validator rejects non-array cashTransactions when present', () => {
  assert.equal(isValidCommerceBackup({ schemaVersion: 1, invoices: [], parties: [], cashTransactions: 'bad' }), false);
  assert.equal(isValidCommerceBackup({ schemaVersion: 1, invoices: [], parties: [], cashTransactions: [] }), true);
});

test('manual and selected external restore both use the same commerce validator', () => {
  assert.match(restoreSource, /import \{ isValidCommerceBackup \} from '\.\/backup-commerce-validation\.js'/);
  assert.equal((restoreSource.match(/!isValidCommerceBackup\(parsed\.commerce\)/g) || []).length, 3);
});
