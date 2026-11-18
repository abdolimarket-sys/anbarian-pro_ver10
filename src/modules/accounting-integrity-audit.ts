import type { AccountingData, JournalEntry } from './accounting';

export type AccountingAuditFinding = {
  code: string;
  severity: 'warn' | 'error';
  journalId: string;
  message: string;
};

/**
 * ممیزی فقط‌خواندنی اسناد قطعی ذخیره‌شده؛ برای کشف فساد/ناسازگاری داده‌های قدیمی.
 * این تابع داده را اصلاح نمی‌کند و جایگزین validateJournalEntry در زمان ثبت نیست.
 */
export function auditPostedJournalEntries(data: Pick<AccountingData, 'accounts' | 'journalEntries'>): AccountingAuditFinding[] {
  const findings: AccountingAuditFinding[] = [];
  const accountIds = new Set(data.accounts.map((account) => account.id));
  const seenSources = new Map<string, JournalEntry[]>();

  for (const entry of data.journalEntries) {
    if (entry.status !== 'posted') continue;

    if (!Array.isArray(entry.lines) || entry.lines.length === 0) {
      findings.push({ code: 'posted_journal_empty', severity: 'error', journalId: entry.id, message: `سند قطعی ${entry.number || entry.id} فاقد ردیف است.` });
      continue;
    }

    let debit = 0;
    let credit = 0;
    for (const line of entry.lines) {
      const d = line.debitRial;
      const c = line.creditRial;
      if (!Number.isSafeInteger(d) || !Number.isSafeInteger(c) || d < 0 || c < 0 || (d > 0 && c > 0) || (d === 0 && c === 0)) {
        findings.push({ code: 'posted_journal_invalid_line', severity: 'error', journalId: entry.id, message: `سند ${entry.number || entry.id} دارای ردیف با مبلغ نامعتبر است.` });
        continue;
      }
      if (!accountIds.has(line.accountId)) {
        findings.push({ code: 'posted_journal_missing_account', severity: 'error', journalId: entry.id, message: `سند ${entry.number || entry.id} به حساب ناموجود ${line.accountId} ارجاع می‌دهد.` });
      }
      debit += d;
      credit += c;
    }
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit !== credit) {
      findings.push({ code: 'posted_journal_unbalanced', severity: 'error', journalId: entry.id, message: `سند ${entry.number || entry.id} تراز نیست؛ بدهکار ${debit} و بستانکار ${credit} ریال.` });
    }

    const sourceId = entry.sourceDocumentId?.trim();
    if (sourceId) {
      const group = seenSources.get(sourceId) || [];
      group.push(entry);
      seenSources.set(sourceId, group);
    }
  }

  for (const [sourceId, entries] of seenSources) {
    if (entries.length > 1) {
      findings.push({ code: 'duplicate_posted_journal', severity: 'error', journalId: entries[0].id, message: `منبع ${sourceId} دارای ${entries.length} سند قطعی است.` });
    }
  }
  return findings;
}
