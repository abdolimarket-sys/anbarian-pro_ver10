import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const scanner = fs.readFileSync(new URL('../src/modules/scanner-controller.ts', import.meta.url), 'utf8');
const io = fs.readFileSync(new URL('../src/modules/import-export-events.ts', import.meta.url), 'utf8');

test('scanner orchestration is extracted and guarded against duplicate initialization', () => {
  assert.match(main, /initScannerController\(\)/);
  assert.doesNotMatch(main, /function initScannerModule/);
  assert.match(scanner, /let scannerInitialized = false/);
  assert.match(scanner, /if \(scannerInitialized\) return/);
  assert.match(scanner, /anbarin:invoice-barcode-scan/);
  assert.match(scanner, /handleScannedCode\(result\.code/);
  assert.match(scanner, /onFieldFill:/);
});

test('import and export UI events are isolated and idempotently bound', () => {
  assert.match(main, /bindImportExportEvents\(\{ updateHeader, refreshLists \}\)/);
  assert.doesNotMatch(main, /getElementById\('importFile'\)/);
  assert.match(io, /let eventsBound = false/);
  assert.match(io, /if \(eventsBound\) return/);
  assert.match(io, /processImportFile\(file\)/);
  assert.match(io, /exportExcel\(false\)/);
  assert.match(io, /exportExcel\(true\)/);
  assert.match(io, /exportCSV\(false\)/);
  assert.match(io, /finally \{[\s\S]*?input\.value = ''/);
});
