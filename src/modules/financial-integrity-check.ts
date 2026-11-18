/**
 * خودآزمایی یکپارچگی مالی — فقط‌خواندنی.
 * برای boot و صفحه سلامت داده.
 */
import { loadAccountingData } from './accounting';
import { loadCommerceData } from './accounting-commerce';
import { loadInventoryCostData } from './inventory-costing';
import { listStockDivergences } from './inventory-truth';
import { readPendingCommerceOperation, type PendingCommerceOperation } from './financial-commit';
import { auditPostedJournalEntries } from './accounting-integrity-audit';
import { buildAccountingReconciliation } from './accounting-reconciliation';

export type IntegrityFinding = {
  code: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
};

export type IntegrityReport = {
  ok: boolean;
  findings: IntegrityFinding[];
  checkedAt: string;
};

const OPERATION_KIND_LABEL: Record<string, string> = {
  'post-invoice': 'ثبت و قطعی‌سازی فاکتور',
  'cash-transaction': 'دریافت / پرداخت (نقدی یا چکی)',
  'cheque-status': 'تغییر وضعیت چک',
  'cheque-endorsement': 'ظهرنویسی چک',
  'nrv-write-down': 'کاهش ارزش موجودی (NRV)',
};

/**
 * ساخت پیام حرفه‌ای و ساختاریافته برای عملیات مالی نیمه‌تمام.
 * فقط خواندن — هیچ تغییری در داده ایجاد نمی‌کند.
 */
function formatPendingOperationMessage(
  pending: PendingCommerceOperation,
  commerce: Awaited<ReturnType<typeof loadCommerceData>>,
): string {
  const location = OPERATION_KIND_LABEL[pending.kind] || pending.kind;

  // شماره قابل‌خواندن (اولویت با شماره سند، سپس شناسه)
  const refs: string[] = [];
  if (pending.invoiceId) {
    const inv = commerce.invoices.find((i) => i.id === pending.invoiceId);
    refs.push(inv?.number ? `فاکتور ${inv.number}` : `فاکتور (${pending.invoiceId.slice(0, 8)}…)`);
  }
  if (pending.transactionId) {
    const tx = commerce.cashTransactions.find((t) => t.id === pending.transactionId);
    const label = tx?.number
      ? `تراکنش ${tx.number}`
      : `تراکنش (${pending.transactionId.slice(0, 8)}…)`;
    if (tx?.chequeNumber) {
      refs.push(`${label} — چک ${tx.chequeNumber}`);
    } else {
      refs.push(label);
    }
  }
  if (!refs.length && pending.id) {
    refs.push(`شناسه عملیات ${pending.id.slice(0, 12)}`);
  }
  const numberText = refs.length ? refs.join(' | ') : 'شماره ثبت‌نشده';

  // زمان شروع با قالب فارسی
  let timeText = 'نامشخص';
  if (pending.startedAt) {
    try {
      timeText = new Date(pending.startedAt).toLocaleString('fa-IR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      timeText = pending.startedAt;
    }
  }

  const attempts =
    typeof pending.attempts === 'number' && pending.attempts > 0
      ? ` · تلاش‌ها: ${pending.attempts}`
      : '';

  const errorPart = pending.lastError
    ? `\nآخرین خطا: ${pending.lastError}`
    : '';

  return [
    `شماره: ${numberText}`,
    `محل: ${location}`,
    `ساعت شروع: ${timeText}${attempts}`,
  ].join(' | ') + errorPart;
}

/**
 * بررسی‌های ساختاری سبک روی داده‌های فعلی دستگاه.
 */
export async function runFinancialIntegrityCheck(): Promise<IntegrityReport> {
  const findings: IntegrityFinding[] = [];
  const [accounting, commerce, costing, pending] = await Promise.all([
    loadAccountingData(),
    loadCommerceData(),
    loadInventoryCostData(),
    readPendingCommerceOperation(),
  ]);
  // از همان snapshot بارگذاری‌شده استفاده می‌کنیم تا دوباره از IndexedDB خوانده نشود.
  const stockDiv = listStockDivergences(costing);

  if (pending && pending.state !== 'completed') {
    findings.push({
      code: 'pending_operation',
      severity: 'warn',
      message: formatPendingOperationMessage(pending, commerce),
    });
  }

  // تطبیق دفتر معین اشخاص و گردش نقد/بانک با داده‌های عملیاتی.
  const reconciliation = buildAccountingReconciliation(accounting, commerce);
  findings.push(...reconciliation.findings.map((finding) => ({
    code: finding.code,
    severity: finding.severity,
    message: finding.message,
  })));

  // ممیزی ساختاری اسناد قطعی: تراز، مبالغ و حساب مرجع.
  findings.push(...auditPostedJournalEntries(accounting).filter((finding) => finding.code !== 'duplicate_posted_journal'));

  // یک منبع نباید بیش از یک سند حسابداری قطعی داشته باشد.
  const postedBySource = new Map<string, typeof accounting.journalEntries>();
  for (const journal of accounting.journalEntries) {
    if (journal.status !== 'posted' || !journal.sourceDocumentId?.trim()) continue;
    const sourceId = journal.sourceDocumentId.trim();
    const group = postedBySource.get(sourceId) || [];
    group.push(journal);
    postedBySource.set(sourceId, group);
  }
  for (const [sourceId, journals] of postedBySource) {
    if (journals.length < 2) continue;
    const numbers = journals.map((journal) => journal.number || journal.id).join('، ');
    findings.push({ code: 'duplicate_posted_journal', severity: 'error', message: `برای منبع ${sourceId} تعداد ${journals.length} سند حسابداری posted ثبت شده است: ${numbers}.` });
  }

  // فاکتور posted باید journal مرتبط داشته باشد
  for (const inv of commerce.invoices) {
    if (inv.status !== 'posted') continue;
    const je = accounting.journalEntries.find(
      (j) => j.sourceDocumentId === inv.id && j.status === 'posted',
    );
    if (!je) {
      findings.push({
        code: 'invoice_missing_journal',
        severity: 'error',
        message: `فاکتور قطعی ${inv.number} سند حسابداری posted ندارد.`,
      });
    }
    // کالای انباری باید movement داشته باشد
    for (const line of inv.lines || []) {
      if (!line.productId) continue;
      const mov = costing.movements.find(
        (m) => m.sourceDocumentId === inv.id && m.productId === line.productId,
      );
      if (!mov) {
        findings.push({
          code: 'invoice_missing_movement',
          severity: 'error',
          message: `فاکتور ${inv.number}: گردش انبار برای کالا ثبت نشده است.`,
        });
      }
    }
  }

  // تراکنش نقدی باید journal داشته باشد
  for (const tx of commerce.cashTransactions) {
    const je = accounting.journalEntries.find(
      (j) =>
        (j.id === tx.journalEntryId && j.status === 'posted') ||
        (j.sourceDocumentId === tx.id && j.status === 'posted'),
    );
    if (!je) {
      findings.push({
        code: 'cash_missing_journal',
        severity: 'error',
        message: `تراکنش ${tx.number || tx.id} سند حسابداری معتبر ندارد.`,
      });
    }
  }

  if (stockDiv.length) {
    findings.push({
      code: 'stock_card_divergence',
      severity: 'warn',
      message: `${stockDiv.length} کالا بین کارت و بهای تمام‌شده ناهم‌خوان است.`,
    });
  }

  const ok = !findings.some((f) => f.severity === 'error');
  return { ok, findings, checkedAt: new Date().toISOString() };
}
