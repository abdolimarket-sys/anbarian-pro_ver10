import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountingReconciliation } from '../src/modules/accounting-reconciliation.ts';

const accounting = (entries = []) => ({
  schemaVersion: 1, settings: {},
  accounts: [
    { id: 'det-customers', title: 'اشخاص دریافتنی' },
    { id: 'det-suppliers', title: 'اشخاص پرداختنی' },
    { id: 'det-cash', title: 'صندوق' },
    { id: 'det-bank', title: 'بانک' },
  ], fiscalPeriods: [], journalEntries: entries,
});
const commerce = (overrides = {}) => ({
  schemaVersion: 1,
  parties: [{ id: 'c1', type: 'customer', name: 'مشتری یک' }, { id: 's1', type: 'supplier', name: 'تأمین‌کننده یک' }],
  invoices: [{ id: 'i1', type: 'sale', number: 'S1', partyId: 'c1', grossRial: 1000, status: 'posted' }],
  cashTransactions: [], ...overrides,
});
const entry = (id, lines) => ({ id, number: id, status: 'posted', lines });
const line = (accountId, debitRial, creditRial, partyId) => ({ accountId, debitRial, creditRial, partyId });

describe('phase 6 accounting reconciliation', () => {
  it('reports no mismatch when customer subledger agrees with posted journal', () => {
    const report = buildAccountingReconciliation(accounting([entry('j1', [line('det-customers', 1000, 0, 'c1')])]), commerce());
    assert.equal(report.findings.length, 0);
    assert.equal(report.partyRows[0].differenceRial, 0);
  });
  it('detects customer balance mismatch', () => {
    const report = buildAccountingReconciliation(accounting([entry('j1', [line('det-customers', 700, 0, 'c1')])]), commerce());
    assert.ok(report.findings.some(x => x.code === 'party_subledger_mismatch' && x.differenceRial === 300));
  });
  it('compares non-cheque cash transactions only against their linked journal entries', () => {
    const c = commerce({ cashTransactions: [{ id: 't1', type: 'receipt', number: 'R1', cashAccountId: 'det-cash', amountRial: 500, method: 'cash', journalEntryId: 'j2' }] });
    const a = accounting([entry('j2', [line('det-cash', 500, 0)])]);
    const report = buildAccountingReconciliation(a, c);
    assert.ok(!report.findings.some(x => x.code === 'cash_ledger_mismatch'));
  });
  it('detects cash ledger mismatch', () => {
    const c = commerce({ cashTransactions: [{ id: 't1', type: 'receipt', number: 'R1', cashAccountId: 'det-cash', amountRial: 500, method: 'cash', journalEntryId: 'j2' }] });
    const a = accounting([entry('j2', [line('det-cash', 400, 0)])]);
    const report = buildAccountingReconciliation(a, c);
    assert.ok(report.findings.some(x => x.code === 'cash_ledger_mismatch' && x.differenceRial === 100));
  });
});


describe('settlement reconciliation edge cases', () => {
  it('includes unallocated receipts in the customer subledger balance', () => {
    const c = commerce({
      cashTransactions: [{ id: 't-unallocated', type: 'receipt', number: 'R2', partyId: 'c1', cashAccountId: 'det-cash', amountRial: 200, method: 'cash', journalEntryId: 'j2', allocations: [] }],
    });
    const a = accounting([
      entry('j1', [line('det-customers', 1000, 0, 'c1')]),
      entry('j2', [line('det-cash', 200, 0), line('det-customers', 0, 200, 'c1')]),
    ]);
    const report = buildAccountingReconciliation(a, c);
    assert.equal(report.partyRows.find(row => row.partyId === 'c1' && row.kind === 'customer')?.differenceRial, 0);
    assert.ok(!report.findings.some(finding => finding.code === 'party_subledger_mismatch'));
  });

  it('reconciles user-defined detail bank accounts, not only the two default cash accounts', () => {
    const c = commerce({
      cashTransactions: [{ id: 't-bank-detail', type: 'receipt', number: 'R3', partyId: 'c1', cashAccountId: 'det-bank-iran', amountRial: 350, method: 'bank', journalEntryId: 'j3', allocations: [] }],
    });
    const a = accounting([
      entry('j3', [line('det-bank-iran', 350, 0), line('det-customers', 0, 350, 'c1')]),
    ]);
    a.accounts.push({ id: 'det-bank-iran', title: 'بانک نمونه' });
    const report = buildAccountingReconciliation(a, c);
    assert.equal(report.cashRows.find(row => row.accountId === 'det-bank-iran')?.differenceRial, 0);
    assert.ok(!report.findings.some(finding => finding.code === 'cash_ledger_mismatch'));
  });
});
