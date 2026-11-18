/** ظهرنویسی و واگذاری چک دریافتی به تأمین‌کننده */
import {
  loadAccountingData,
  upsertJournalEntry,
  postJournalEntry,
  type JournalEntry,
  type JournalLine,
} from './accounting';
import {
  loadCommerceData,
  invoiceOutstanding,
  withCommerceMutationLock,
  type CommerceData,
} from './accounting-commerce';
import { logAudit } from './state';
import {
  beginCommerceOperation,
  commitFinancialDomains,
  writePendingCommerceOperation,
} from './financial-commit';
import { digits, latinDigits } from './commerce-ui-shared';

const now = () => new Date().toISOString();
const id = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
const normalizeJalaliDate = (raw: string): string => {
  const d = digits(String(raw || '').trim()).replace(/-/g, '/').replace(/\./g, '/');
  const m = d.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return '';
  return `${m[1]}/${m[2].padStart(2, '0')}/${m[3].padStart(2, '0')}`;
};
const validDate = (v: string) => /^\d{4}\/\d{2}\/\d{2}$/.test(normalizeJalaliDate(v));

function line(
  accountId: string,
  description: string,
  debitRial: number,
  creditRial: number,
  partyId?: string,
): JournalLine {
  return {
    id: id('line'),
    accountId,
    description,
    debitRial,
    creditRial,
    ...(partyId ? { partyId } : {}),
  };
}

function assertAccount(
  data: Awaited<ReturnType<typeof loadAccountingData>>,
  accountId: string,
  label: string,
) {
  if (!data.accounts.some((a) => a.id === accountId && a.isActive && a.level === 'detail')) {
    throw new Error(`حساب تفصیلی فعال «${label}» در کدینگ پیدا نشد.`);
  }
}

/**
 * ظهرنویسی جزئی/کامل چک دریافتی به تأمین‌کننده.
 * accounting + commerce در یک تراکنش IndexedDB نوشته می‌شوند.
 */
export async function endorseCheque(
  transactionId: string,
  toPartyId: string,
  invoiceId: string,
  date: string,
  note: string,
  amountRial?: number,
): Promise<CommerceData> {
  return withCommerceMutationLock(() =>
    endorseChequeExclusive(transactionId, toPartyId, invoiceId, date, note, amountRial),
  );
}

async function endorseChequeExclusive(
  transactionId: string,
  toPartyId: string,
  invoiceId: string,
  date: string,
  note: string,
  amountRial?: number,
): Promise<CommerceData> {
  const commerce = await loadCommerceData();
  const tx = commerce.cashTransactions.find((t) => t.id === transactionId);
  if (!tx || tx.method !== 'cheque' || tx.type !== 'receipt' || tx.chequeStatus !== 'pending') {
    throw new Error('فقط چک دریافتیِ در انتظار قابل ظهرنویسی است.');
  }
  const prior = (commerce.chequeEndorsements || []).filter((e) => e.transactionId === tx.id);
  const alreadyEndorsed = prior.reduce((sum, e) => sum + e.amountRial, 0);
  const remaining = tx.amountRial - alreadyEndorsed;
  if (remaining <= 0) {
    throw new Error('این چک قبلاً ظهرنویسی شده است؛ مانده‌ای برای واگذاری باقی نمانده است.');
  }
  const endorseDate = normalizeJalaliDate(date);
  if (!validDate(endorseDate)) {
    throw new Error('تاریخ ظهرنویسی باید شمسی و به شکل YYYY/MM/DD باشد.');
  }
  const party = commerce.parties.find(
    (p) => p.id === toPartyId && p.isActive && (p.type === 'supplier' || p.type === 'both'),
  );
  if (!party) throw new Error('ذی‌نفع باید تأمین‌کننده فعال باشد.');
  const invoice = commerce.invoices.find(
    (i) =>
      i.id === invoiceId &&
      i.status === 'posted' &&
      i.type === 'purchase' &&
      i.partyId === party.id,
  );
  if (!invoice) {
    throw new Error('فاکتور خرید قطعی متعلق به همین تأمین‌کننده را انتخاب کنید.');
  }
  const amount = amountRial ?? remaining;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining) {
    throw new Error('مبلغ واگذاری باید مثبت و حداکثر برابر مانده چک باشد.');
  }
  if (invoiceOutstanding(invoice.id, commerce) < amount) {
    throw new Error('مانده فاکتور خرید برای مبلغ واگذاری کافی نیست.');
  }

  const sequence = prior.length + 1;
  const sourceDocumentId = `${tx.id}:endorsement:${sequence}`;
  const endorsementId = id(`endorse_${tx.id.slice(-6)}_${sequence}`);

  let accounting = await loadAccountingData();
  const already = accounting.journalEntries.find(
    (j) => j.sourceDocumentId === sourceDocumentId && j.status === 'posted',
  );
  if (already) {
    const exists = (commerce.chequeEndorsements || []).some(
      (e) => e.journalEntryId === already.id,
    );
    if (exists) return commerce;
  }

  const operation = await beginCommerceOperation({
    id: `endorse:${sourceDocumentId}`,
    kind: 'cheque-endorsement',
    transactionId: tx.id,
    inputSnapshot: {
      transactionId,
      toPartyId,
      invoiceId,
      date,
      note,
      amountRial: amount,
      sequence,
      sourceDocumentId,
      endorsementId,
    },
  });

  try {
    let journalId = already?.id;
    let workingAccounting = accounting;

    if (!already) {
      const period = accounting.fiscalPeriods.find(
        (p) => {
          if (p.status !== 'open') return false;
          const start = latinDigits(p.startDate);
          const end = latinDigits(p.endDate);
          const d = latinDigits(endorseDate);
          return (!start || d >= start) && (!end || d <= end);
        },
      );
      if (!period) {
        throw new Error('برای تاریخ ظهرنویسی، سال مالی باز و معتبر پیدا نشد.');
      }
      assertAccount(accounting, 'det-cheques-receivable', 'چک‌های دریافتنی');
      assertAccount(accounting, 'det-suppliers', 'حساب پرداختنی تأمین‌کنندگان');
      const lines = [
        line(
          'det-suppliers',
          'تسویه بدهی تأمین‌کننده از محل ظهرنویسی چک',
          amount,
          0,
          party.id,
        ),
        line(
          'det-cheques-receivable',
          'خروج چک از اسناد دریافتنی بابت واگذاری جزئی',
          0,
          amount,
        ),
      ];
      journalId = journalId || id(`je_${tx.id.slice(-6)}_${sequence}`);
      const entry: JournalEntry = {
        id: journalId,
        number: `EN-${String(tx.number || tx.id).replace(/[^A-Za-z0-9]/g, '').slice(-8)}-${sequence}-${Date.now().toString(36).slice(-5)}`,
        fiscalPeriodId: period.id,
        date: endorseDate,
        description: `ظهرنویسی چک ${tx.chequeNumber || tx.number} به ${party.name}`,
        status: 'draft',
        source: 'payment',
        sourceDocumentId,
        lines,
        createdAt: now(),
        updatedAt: now(),
      };
      workingAccounting = postJournalEntry(upsertJournalEntry(accounting, entry), entry.id);
    }

    const endorsement = {
      id: endorsementId,
      transactionId: tx.id,
      toPartyId: party.id,
      invoiceId: invoice.id,
      date: endorseDate,
      amountRial: amount,
      note: note.trim(),
      journalEntryId: journalId!,
      createdAt: now(),
    };
    const nextCommerce: CommerceData = {
      ...commerce,
      chequeEndorsements: [...(commerce.chequeEndorsements || []), endorsement],
    };

    await commitFinancialDomains({
      accounting: workingAccounting,
      commerce: nextCommerce,
      completedOperation: operation,
    });

    logAudit('cheque_endorsed', {
      transactionId: tx.id,
      toPartyId: party.id,
      invoiceId: invoice.id,
      amountRial: amount,
      remainingRial: remaining - amount,
      journalEntryId: journalId,
    });
    return nextCommerce;
  } catch (error) {
    await writePendingCommerceOperation({
      ...operation,
      lastError: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    throw error;
  }
}

/** بازیابی ظهرنویسی از operation journal */
export async function recoverChequeEndorsementFromSnapshot(
  snapshot: {
    transactionId: string;
    toPartyId: string;
    invoiceId: string;
    date: string;
    note: string;
    amountRial: number;
  },
): Promise<CommerceData> {
  const commerce = await loadCommerceData();
  const prior = (commerce.chequeEndorsements || []).filter(
    (e) => e.transactionId === snapshot.transactionId,
  );
  if (
    prior.some(
      (e) =>
        e.toPartyId === snapshot.toPartyId &&
        e.invoiceId === snapshot.invoiceId &&
        e.amountRial === snapshot.amountRial,
    )
  ) {
    return commerce;
  }
  return endorseCheque(
    snapshot.transactionId,
    snapshot.toPartyId,
    snapshot.invoiceId,
    snapshot.date,
    snapshot.note || '',
    snapshot.amountRial,
  );
}

export function getChequeEndorsements(transactionId: string, commerce: CommerceData) {
  return (commerce.chequeEndorsements || []).filter((e) => e.transactionId === transactionId);
}
export function getChequeEndorsement(transactionId: string, commerce: CommerceData) {
  return getChequeEndorsements(transactionId, commerce)[0];
}
export function getChequeEndorsementRemaining(transactionId: string, commerce: CommerceData) {
  const tx = commerce.cashTransactions.find((t) => t.id === transactionId);
  if (!tx) return 0;
  return Math.max(
    0,
    tx.amountRial -
      getChequeEndorsements(transactionId, commerce).reduce((sum, e) => sum + e.amountRial, 0),
  );
}
