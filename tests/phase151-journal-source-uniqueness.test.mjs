import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/modules/accounting.ts', import.meta.url), 'utf8');

test('central posting guard rejects a second posted journal for the same source document', () => {
  assert.match(source, /const sourceDocumentId = entry\.sourceDocumentId\?\.trim\(\)/);
  assert.match(source, /item\.id !== entry\.id[\s\S]*item\.status === 'posted'[\s\S]*item\.sourceDocumentId\?\.trim\(\) === sourceDocumentId/);
  assert.match(source, /برای این منبع قبلاً سند قطعی/);
});

test('central source uniqueness guard preserves idempotent repost and source-less manual journals', () => {
  assert.match(source, /if \(entry\.status === 'posted'\) return data/);
  assert.match(source, /if \(sourceDocumentId\) \{/);
});

test('reversing journals retain their independent reverse source key', () => {
  assert.match(source, /sourceDocumentId: `reverse:\$\{original\.id\}`/);
});
