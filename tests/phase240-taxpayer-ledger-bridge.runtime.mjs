import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bridge = readFileSync(new URL('../src/modules/taxpayer-ledger-bridge.ts', import.meta.url), 'utf8');
const ledger = readFileSync(new URL('../src/modules/taxpayer-submission-ledger.ts', import.meta.url), 'utf8');

test('phase 24 bridge defaults to disabled submission and depends on ledger types', () => {
  assert.match(bridge, /getTaxLedgerBridgeStatus|saveTaxLedgerBridgeConfig|tryReserveTaxLedger/);
  assert.match(bridge, /submissionDisabled|configured/);
  assert.match(ledger, /TaxLedgerEventKind/);
  assert.match(ledger, /transitionTaxLedgerRecord/);
  assert.match(ledger, /eventKindByState/);
});

test('phase 24 ledger event kinds remain assignable from connection states', () => {
  assert.match(ledger, /submission_started/);
  assert.match(ledger, /status_checked/);
  assert.match(ledger, /Partial<Record<TaxConnectionState, TaxLedgerEventKind>>/);
});
