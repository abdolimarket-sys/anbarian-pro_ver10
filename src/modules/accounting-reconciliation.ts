/**
 * موتور تطبیق دفتر معین طرف‌حساب و گردش نقد/بانک با اسناد عملیاتی.
 * فقط‌خواندنی است؛ هیچ سند یا مانده‌ای را اصلاح نمی‌کند.
 * دامنه فعلی: مانده طرف‌حساب و گردش نقد/بانک مرتبط با تراکنش‌های عملیاتی؛
 * این گزارش به‌تنهایی تطبیق صورت‌حساب بانکی خارجی، ارزش موجودی انبار، بهای تمام‌شده و همه چرخه‌های چک نیست.
 */
import type { AccountingData } from './accounting';
import type { CommerceData } from './accounting-commerce';

export type ReconciliationFinding = {
  code: 'party_subledger_mismatch' | 'cash_ledger_mismatch' | 'unallocated_settlement' | 'missing_party_reference';
  severity: 'warn' | 'error';
  referenceId: string;
  operationalRial: number;
  ledgerRial: number;
  differenceRial: number;
  message: string;
};

export type ReconciliationReport = {
  findings: ReconciliationFinding[];
  partyRows: Array<{ partyId: string; partyName: string; kind: 'customer' | 'supplier'; operationalRial: number; ledgerRial: number; differenceRial: number }>;
  cashRows: Array<{ accountId: string; accountTitle: string; operationalRial: number; ledgerRial: number; differenceRial: number }>;
  checkedInvoices: number;
  checkedCashTransactions: number;
};

const money = (n: number) => Number.isSafeInteger(n) ? n : 0;

/**
 * تطبیق مانده باز فاکتورها با گردش posted روی حساب تفصیلی طرف‌حساب.
 * اسناد برگشت، تخصیص دریافت/پرداخت و ظهرنویسی خرید در مانده عملیاتی لحاظ می‌شوند.
 */
export function buildAccountingReconciliation(accounting: AccountingData, commerce: CommerceData): ReconciliationReport {
  const findings: ReconciliationFinding[] = [];
  const partyRows: ReconciliationReport['partyRows'] = [];
  const cashRows: ReconciliationReport['cashRows'] = [];
  const partyById = new Map(commerce.parties.map(p => [p.id, p]));
  const openByParty = new Map<string, { customer: number; supplier: number }>();

  for (const invoice of commerce.invoices) {
    if (invoice.status !== 'posted' || invoice.type === 'proforma') continue;
    const side = invoice.type === 'sale' || invoice.type === 'return-sale' ? 'customer' : 'supplier';
    const sign = invoice.type === 'return-sale' || invoice.type === 'return-purchase' ? -1 : 1;
    const current = openByParty.get(invoice.partyId) || { customer: 0, supplier: 0 };
    current[side] += sign * money(invoice.grossRial);
    openByParty.set(invoice.partyId, current);
  }

  // دریافت/پرداخت بر اساس همان حساب تفصیلی‌ای تطبیق می‌شود که سند حسابداری
  // در createCashTransactionExclusive انتخاب می‌کند؛ تخصیص‌نداشتن به فاکتور
  // به معنی بی‌اثر بودن تراکنش روی مانده طرف‌حساب نیست.
  for (const tx of commerce.cashTransactions) {
    if (tx.chequeStatus === 'bounced' || tx.chequeStatus === 'void') continue;
    const allocatedTypes = (tx.allocations || [])
      .map(allocation => commerce.invoices.find(invoice => invoice.id === allocation.invoiceId)?.type)
      .filter((type): type is NonNullable<typeof type> => !!type);
    for (const allocation of tx.allocations || []) {
      const invoice = commerce.invoices.find(i => i.id === allocation.invoiceId && i.status === 'posted');
      if (!invoice) {
        findings.push({ code: 'unallocated_settlement', severity: 'warn', referenceId: tx.id, operationalRial: money(allocation.amountRial), ledgerRial: 0, differenceRial: money(allocation.amountRial), message: `تخصیص تراکنش ${tx.number || tx.id} به فاکتور ناموجود یا غیرقطعی ارجاع می‌دهد.` });
      }
    }
    const firstType = allocatedTypes[0];
    const isReturnPurchase = firstType === 'return-purchase';
    const isReturnSale = firstType === 'return-sale';
    const usesCustomerAccount = allocatedTypes.length
      ? (tx.type === 'receipt' && !isReturnPurchase) || (tx.type === 'payment' && isReturnSale)
      : (() => {
          const party = partyById.get(tx.partyId);
          return party?.type === 'customer' || (party?.type === 'both' && tx.type === 'receipt');
        })();
    const kind = usesCustomerAccount ? 'customer' : 'supplier';
    const current = openByParty.get(tx.partyId) || { customer: 0, supplier: 0 };
    // علامت دقیقاً مطابق جهت بدهکار/بستانکار ردیف طرف‌حساب در سند تسویه است.
    const signedAmount = usesCustomerAccount
      ? (tx.type === 'receipt' ? -money(tx.amountRial) : money(tx.amountRial))
      : (tx.type === 'receipt' ? money(tx.amountRial) : -money(tx.amountRial));
    current[kind] += signedAmount;
    openByParty.set(tx.partyId, current);
  }
  for (const endorsement of commerce.chequeEndorsements || []) {
    const invoice = commerce.invoices.find(i => i.id === endorsement.invoiceId && i.status === 'posted' && i.type === 'purchase');
    const tx = commerce.cashTransactions.find(t => t.id === endorsement.transactionId && t.chequeStatus !== 'bounced' && t.chequeStatus !== 'void');
    if (!invoice || !tx) continue;
    const current = openByParty.get(invoice.partyId) || { customer: 0, supplier: 0 };
    current.supplier -= money(endorsement.amountRial);
    openByParty.set(invoice.partyId, current);
  }

  const partyAccountIds = new Set(['det-customers', 'det-suppliers']);
  const ledgerParty = new Map<string, { customer: number; supplier: number }>();
  for (const entry of accounting.journalEntries) {
    if (entry.status !== 'posted') continue;
    for (const line of entry.lines || []) {
      if (!partyAccountIds.has(line.accountId)) continue;
      if (!line.partyId) {
        findings.push({ code: 'missing_party_reference', severity: 'warn', referenceId: entry.id, operationalRial: 0, ledgerRial: money(line.debitRial) - money(line.creditRial), differenceRial: money(line.debitRial) - money(line.creditRial), message: `ردیف سند ${entry.number || entry.id} روی حساب اشخاص، شناسه طرف‌حساب ندارد.` });
        continue;
      }
      const current = ledgerParty.get(line.partyId) || { customer: 0, supplier: 0 };
      if (line.accountId === 'det-customers') current.customer += money(line.debitRial) - money(line.creditRial);
      else current.supplier += money(line.creditRial) - money(line.debitRial);
      ledgerParty.set(line.partyId, current);
    }
  }

  for (const partyId of new Set([...openByParty.keys(), ...ledgerParty.keys()])) {
    const amounts = openByParty.get(partyId) || { customer: 0, supplier: 0 };
    for (const kind of ['customer', 'supplier'] as const) {
      const operationalRial = amounts[kind];
      if (operationalRial === 0 && !ledgerParty.has(partyId)) continue;
      const ledgerRial = ledgerParty.get(partyId)?.[kind] || 0;
      const differenceRial = operationalRial - ledgerRial;
      const partyName = partyById.get(partyId)?.name || `طرف‌حساب حذف‌شده (${partyId})`;
      partyRows.push({ partyId, partyName, kind, operationalRial, ledgerRial, differenceRial });
      if (differenceRial !== 0) findings.push({ code: 'party_subledger_mismatch', severity: 'error', referenceId: partyId, operationalRial, ledgerRial, differenceRial, message: `مانده ${kind === 'customer' ? 'دریافتنی' : 'پرداختنی'} «${partyName}» با دفتر معین تطبیق ندارد؛ اختلاف ${differenceRial} ریال.` });
    }
  }

  // گردش نقد/بانک فقط برای روش‌های غیرچکی؛ چک در حساب‌های اسناد دریافتنی/پرداختنی گردش دارد.
  const operationalCash = new Map<string, number>();
  for (const tx of commerce.cashTransactions) {
    if (tx.method === 'cheque' || tx.chequeStatus === 'bounced' || tx.chequeStatus === 'void') continue;
    const signed = tx.type === 'receipt' ? money(tx.amountRial) : -money(tx.amountRial);
    operationalCash.set(tx.cashAccountId, (operationalCash.get(tx.cashAccountId) || 0) + signed);
  }
  const cashJournalIds = new Set(commerce.cashTransactions.map(tx => tx.journalEntryId));
  const ledgerCash = new Map<string, number>();
  for (const entry of accounting.journalEntries) {
    if (entry.status !== 'posted' || !cashJournalIds.has(entry.id)) continue;
    for (const line of entry.lines || []) {
      if (operationalCash.has(line.accountId)) ledgerCash.set(line.accountId, (ledgerCash.get(line.accountId) || 0) + money(line.debitRial) - money(line.creditRial));
    }
  }
  for (const accountId of new Set([...operationalCash.keys(), ...ledgerCash.keys()])) {
    const operationalRial = operationalCash.get(accountId) || 0;
    const ledgerRial = ledgerCash.get(accountId) || 0;
    const differenceRial = operationalRial - ledgerRial;
    const accountTitle = accounting.accounts.find(a => a.id === accountId)?.title || accountId;
    cashRows.push({ accountId, accountTitle, operationalRial, ledgerRial, differenceRial });
    if (differenceRial !== 0) findings.push({ code: 'cash_ledger_mismatch', severity: 'error', referenceId: accountId, operationalRial, ledgerRial, differenceRial, message: `گردش عملیاتی «${accountTitle}» با دفتر کل تطبیق ندارد؛ اختلاف ${differenceRial} ریال.` });
  }

  return { findings, partyRows, cashRows, checkedInvoices: commerce.invoices.filter(i => i.status === 'posted' && i.type !== 'proforma').length, checkedCashTransactions: commerce.cashTransactions.length };
}
