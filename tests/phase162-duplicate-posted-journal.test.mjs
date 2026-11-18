import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const integrity = fs.readFileSync(new URL('../src/modules/financial-integrity-check.ts', import.meta.url), 'utf8');
const health = fs.readFileSync(new URL('../src/modules/data-health.ts', import.meta.url), 'utf8');

test('phase162 detects multiple posted journals sharing the same source document', () => {
  assert.match(integrity, /const postedBySource = new Map/);
  assert.match(integrity, /journal\.status !== 'posted'/);
  assert.match(integrity, /postedBySource\.get\(sourceId\)/);
  assert.match(integrity, /journals\.length < 2/);
  assert.match(integrity, /code: 'duplicate_posted_journal'/);
  assert.match(integrity, /severity: 'error'/);
});

test('phase162 excludes drafts and surfaces duplicate journals in data health report', () => {
  assert.match(integrity, /journal\.status !== 'posted' \|\| !journal\.sourceDocumentId/);
  assert.match(health, /duplicate_posted_journal: 'سند حسابداری قطعی تکراری برای یک منبع'/);
});

test('phase162 reports source identity, duplicate count and journal numbers', () => {
  assert.match(integrity, /برای منبع \$\{sourceId\} تعداد \$\{journals\.length\}/);
  assert.match(integrity, /journals\.map\(\(journal\) => journal\.number \|\| journal\.id\)/);
});
