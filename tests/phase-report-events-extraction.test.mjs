import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const moduleSource = fs.readFileSync(new URL('../src/modules/report-events.ts', import.meta.url), 'utf8');

test('report and cardex event handlers are extracted from main.ts', () => {
  assert.match(main, /import \{ bindReportEvents \} from '\.\/modules\/report-events'/);
  assert.match(main, /bindReportEvents\(\{ updateHeader, refreshCardexProductSelect \}\)/);
  assert.doesNotMatch(main, /bindDynamicReportActions/);
  assert.doesNotMatch(main, /btnCopyReport/);
  assert.doesNotMatch(main, /btnCardexExcel/);
});

test('report module preserves static exports, cardex selection and delegated dynamic actions', () => {
  for (const id of ['btnCopyReport', 'btnExportDiffs', 'btnExportCountedProducts', 'btnAccGeneric', 'btnAccHeloo', 'btnAccSepidar', 'btnDoubleDiff', 'btnStockAlerts', 'btnCardexExcel', 'btnCardexPdf']) {
    assert.ok(moduleSource.includes(id), `missing report action ${id}`);
  }
  assert.match(moduleSource, /cardexSelect\.addEventListener\('change'/);
  assert.match(moduleSource, /let reportEventsBound = false/);
  assert.match(moduleSource, /let dynamicReportActionsBound = false/);
  assert.match(moduleSource, /document\.addEventListener\('click'/);
  assert.match(moduleSource, /document\.addEventListener\('change'/);
  assert.match(moduleSource, /callbacks\.updateHeader\(\)/);
  assert.match(moduleSource, /callbacks\.refreshCardexProductSelect\(\)/);
});
