import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('fiscal UI exposes the full existing close workflow rather than the legacy direct-close action', () => {
  const ui = read('src/modules/accounting-ui.ts');
  for (const id of ['fyClosingPreview','fyBuildClosing','fyBuildOpening','fyFinalizeClose']) assert.ok(ui.includes(id), `${id} missing`);
  assert.match(ui, /previewFiscalClosing/);
  assert.match(ui, /buildFiscalClosingEntry/);
  assert.match(ui, /buildFiscalOpeningEntry/);
  assert.match(ui, /finalizeFiscalYearClose/);
  assert.doesNotMatch(ui, /data-close-period/);
});

test('accounting service emits audit events for journal and fiscal lifecycle changes', () => {
  const accounting = read('src/modules/accounting.ts');
  for (const event of [
    'accounting.journal.draft_created','accounting.journal.draft_updated','accounting.journal.posted',
    'accounting.journal.reversal_linked','accounting.chart.account_created','accounting.chart.account_updated',
    'accounting.chart.account_removed','accounting.fiscal.period_created','accounting.fiscal.active_period_changed','accounting.fiscal.closing_draft_created',
    'accounting.fiscal.opening_draft_created','accounting.fiscal.year_finalized',
  ]) assert.ok(accounting.includes(event), `${event} missing`);
});

test('audit history UI explains the limits of local checksum verification', () => {
  const reports = read('src/modules/reports.ts');
  assert.match(reports, /verifyAuditIntegrity/);
  assert.match(reports, /امضای رمزنگاری‌شده/);
  assert.match(reports, /append-only/);
});
