import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/modules/accounting-commerce-ui.ts', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../src/modules/commerce-ui-actions.ts', import.meta.url), 'utf8');

test('party edit and invoice settlement actions are delegated from one persistent root', () => {
  assert.match(ui, /bindCommercePanelActions\(document,/);
  assert.match(ui, /onEditParty:\s*\(partyId\)/);
  assert.match(ui, /onPostInvoice:\s*\(invoiceId\)\s*=>\s*openInvoiceSettlementSheet\(invoiceId\)/);
  assert.doesNotMatch(ui, /querySelectorAll<HTMLElement>\('\[data-post-invoice\]'\)/);
  assert.doesNotMatch(ui, /document\.querySelectorAll<HTMLButtonElement>\('\[data-edit-party\]'\)/);
});

test('delegated actions are idempotent and only invoke handlers for matching buttons', () => {
  assert.match(actions, /const boundRoots = new WeakSet/);
  assert.match(actions, /if \(boundRoots\.has\(root\)\) return/);
  assert.match(actions, /target\.closest<HTMLElement>\('\[data-edit-party\]'\)/);
  assert.match(actions, /target\.closest<HTMLElement>\('\[data-post-invoice\]'\)/);
  assert.match(actions, /if \(partyId\) handlers\.onEditParty\(partyId\)/);
  assert.match(actions, /if \(invoiceId\) handlers\.onPostInvoice\(invoiceId\)/);
});
