import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditPostedJournalEntries } from '../src/modules/accounting-integrity-audit.ts';

const account = { id: 'cash', code: '101', title: 'صندوق', level: 'general', nature: 'debit', parentId: null, isActive: true, isSystem: true, createdAt: '', updatedAt: '' };
const entry = (overrides = {}) => ({
  id: 'j1', number: '1001', fiscalPeriodId: 'fy1', date: '1405/01/01', description: 'test', status: 'posted', source: 'manual', createdAt: '', updatedAt: '',
  lines: [
    { id: 'l1', accountId: 'cash', description: '', debitRial: 100, creditRial: 0 },
    { id: 'l2', accountId: 'cash', description: '', debitRial: 0, creditRial: 100 },
  ],
  ...overrides,
});
const data = (...journalEntries) => ({ accounts: [account], journalEntries });

describe('phase 5 posted accounting integrity audit', () => {
  it('accepts a balanced posted journal', () => {
    assert.deepEqual(auditPostedJournalEntries(data(entry())), []);
  });
  it('detects unbalanced posted journals', () => {
    const findings = auditPostedJournalEntries(data(entry({ lines: [{ id: 'l1', accountId: 'cash', description: '', debitRial: 100, creditRial: 0 }] })));
    assert.ok(findings.some((x) => x.code === 'posted_journal_unbalanced'));
  });
  it('detects invalid fractional, negative, or two-sided lines', () => {
    for (const line of [
      { id: 'x', accountId: 'cash', description: '', debitRial: 1.5, creditRial: 0 },
      { id: 'x', accountId: 'cash', description: '', debitRial: -1, creditRial: 0 },
      { id: 'x', accountId: 'cash', description: '', debitRial: 1, creditRial: 1 },
    ]) {
      const findings = auditPostedJournalEntries(data(entry({ lines: [line] })));
      assert.ok(findings.some((x) => x.code === 'posted_journal_invalid_line'));
    }
  });
  it('detects references to missing accounts', () => {
    const findings = auditPostedJournalEntries(data(entry({ lines: [{ id: 'x', accountId: 'missing', description: '', debitRial: 100, creditRial: 0 }, { id: 'y', accountId: 'cash', description: '', debitRial: 0, creditRial: 100 }] })));
    assert.ok(findings.some((x) => x.code === 'posted_journal_missing_account'));
  });
  it('detects duplicate posted source ids but ignores drafts', () => {
    const first = entry({ sourceDocumentId: 'invoice-1' });
    const second = entry({ id: 'j2', sourceDocumentId: 'invoice-1' });
    const draft = entry({ id: 'j3', status: 'draft', sourceDocumentId: 'invoice-1' });
    assert.ok(auditPostedJournalEntries(data(first, second, draft)).some((x) => x.code === 'duplicate_posted_journal'));
    assert.deepEqual(auditPostedJournalEntries(data(first, draft)), []);
  });
  it('detects empty posted journals and ignores draft journals', () => {
    const findings = auditPostedJournalEntries(data(entry({ lines: [] }), entry({ id: 'draft', status: 'draft', lines: [] })));
    assert.equal(findings.filter((x) => x.code === 'posted_journal_empty').length, 1);
  });
});
