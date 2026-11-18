/** گردش تجاری حسابداری و اتصال فاکتور به موجودی و بهای تمام‌شده. */
import { idbGet, idbPut, idbPutMany } from './storage';
import { products, save as saveAppState, flushSave, logAudit } from './state';
import { loadInventoryCostData, saveInventoryCostData, receiveStock, issueStock, seedOpeningStock, getCostBalance, applyNrvWriteDown, buildNrvAnalysis } from './inventory-costing';
import { ensureProductStock, getWarehouseQty, setWarehouseQty, warehouseName } from './warehouse-stock';
import {
  loadAccountingData, saveAccountingData, upsertJournalEntry, postJournalEntry,
  type AccountingData, type JournalEntry, type JournalLine,
} from './accounting';
import {
  beginCommerceOperation,
  commitFinancialDomains,
  readPendingCommerceOperation,
  writePendingCommerceOperation,
  markOperationCompleted,
  type PendingCommerceOperation,
} from './financial-commit';
import { applyCostingBalancesToProducts, syncProductCardsFromCostingTruth } from './inventory-truth';

export type PartyType = 'customer' | 'supplier' | 'both';
export type InvoiceType = 'sale' | 'purchase' | 'return-sale' | 'return-purchase' | 'proforma';
export const isSaleInvoiceType = (type: InvoiceType): boolean => type === 'sale' || type === 'return-sale' || type === 'proforma';
export const isPurchaseInvoiceType = (type: InvoiceType): boolean => type === 'purchase' || type === 'return-purchase';
export const isReturnInvoiceType = (type: InvoiceType): boolean => type === 'return-sale' || type === 'return-purchase';
export type CommercialStatus = 'draft' | 'posted';
export interface AccountingParty {
  id: string; type: PartyType; name: string; nationalId: string; phone: string; address: string;
  economicCode?: string; registrationNumber?: string; postalCode?: string;
  isActive: boolean; createdAt: string; updatedAt: string;
}
export interface CommercialInvoiceLine {
  id: string; description: string; quantityMilli: number; unitPriceRial: number; totalRial: number; productId?: string; warehouse?: string; unit?: string; discountRial?: number;
  /** سهم تخصیص‌یافته از هزینه‌های جانبی خرید (ریال) — فقط پس از ثبت/قطعی‌سازی پر می‌شود */
  allocatedLandedRial?: number;
}
export interface InvoicePaymentPart { method:'cash'|'card'|'cheque'|'credit'; amountRial:number; chequeNumber?:string; chequeBank?:string; chequeAccount?:string; chequeDueDate?:string; note?:string; }
/** هزینه‌های جانبی خرید (Landed Cost) طبق IAS 2 — به بهای موجودی اضافه می‌شود */
export interface InvoiceLandedCosts {
  freightRial?: number;
  customsRial?: number;
  insuranceRial?: number;
  otherRial?: number;
  note?: string;
}
export interface CommercialInvoice {
  id: string; type: InvoiceType; number: string; date: string; fiscalPeriodId: string; partyId: string;
  description: string; lines: CommercialInvoiceLine[]; netRial: number; taxRial: number; grossRial: number; taxRateBps?: number;
  dueDate?: string; paymentTerms?: string; paymentParts?:InvoicePaymentPart[]; notes?: string;
  /** فقط برای فاکتور خرید معنادار است */
  landedCosts?: InvoiceLandedCosts;
  status: CommercialStatus; journalEntryId?: string; createdAt: string; updatedAt: string;
}
export function totalLandedCostRial(lc?: InvoiceLandedCosts | null): number {
  if (!lc) return 0;
  const parts = [lc.freightRial, lc.customsRial, lc.insuranceRial, lc.otherRial].map(n => Math.max(0, Math.round(Number(n) || 0)));
  return parts.reduce((s, n) => s + n, 0);
}
export type SettlementMethod = 'cash'|'bank'|'card'|'transfer'|'cheque';
export type ChequeStatus = 'pending'|'cleared'|'bounced'|'void';
export interface InvoiceAllocation { invoiceId: string; amountRial: number; }
export interface CashTransaction {
  id: string; type: 'receipt' | 'payment'; number: string; date: string; fiscalPeriodId: string;
  partyId: string; cashAccountId: string; amountRial: number; description: string;
  journalEntryId: string; createdAt: string;
  method?: SettlementMethod; allocations?: InvoiceAllocation[];
  chequeNumber?: string; chequeBank?: string; chequeAccount?:string; chequeNote?:string; chequeDueDate?: string; chequeStatus?: ChequeStatus;
  clearingJournalEntryId?: string;
}
export interface ChequeEndorsement { id:string; transactionId:string; toPartyId:string; invoiceId:string; date:string; amountRial:number; note:string; journalEntryId:string; createdAt:string; }
export interface CommerceData {
  schemaVersion: 1; parties: AccountingParty[]; invoices: CommercialInvoice[]; cashTransactions: CashTransaction[]; chequeEndorsements?: ChequeEndorsement[];
  companyProfile?: { name:string; nationalId:string; economicCode:string; registrationNumber:string; phone:string; address:string; postalCode:string };
}

const KEY = 'accounting_phase22_commerce';
const BACKUP = 'accounting_phase22_commerce_backup';
const now = () => new Date().toISOString();
const makeId = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
const isSafeMoney = (n: number) => Number.isSafeInteger(n) && n >= 0;

// سری‌سازی عملیات حساس در یک تب برای جلوگیری از ثبت هم‌زمان تکراری.
let commerceMutationTail: Promise<void> = Promise.resolve();
/** قفل سری‌سازی عملیات مالی — از ماژول‌های مرتبط (ظهرنویسی و …) هم استفاده شود. */
export async function withCommerceMutationLock<T>(work: () => Promise<T>): Promise<T> {
  const previous = commerceMutationTail;
  let release!: () => void;
  commerceMutationTail = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { return await work(); } finally { release(); }
}

export const DEFAULT_CUSTOMER_PARTY_ID = 'party_default_customer';
export const DEFAULT_SUPPLIER_PARTY_ID = 'party_default_supplier';

export function emptyCommerceData(): CommerceData { return { schemaVersion: 1, parties: [], invoices: [], cashTransactions: [] }; }

/** اطمینان از وجود طرف‌حساب‌های پیش‌فرض (خریدار / فروشنده) */
export function ensureDefaultParties(data: CommerceData): CommerceData {
  const parties = [...(data.parties || [])];
  let changed = false;
  const stamp = now();
  if (!parties.some(p => p.id === DEFAULT_CUSTOMER_PARTY_ID)) {
    parties.unshift({
      id: DEFAULT_CUSTOMER_PARTY_ID,
      type: 'customer',
      name: 'خریدار پیش‌فرض',
      nationalId: '',
      phone: '',
      address: '',
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
    });
    changed = true;
  }
  if (!parties.some(p => p.id === DEFAULT_SUPPLIER_PARTY_ID)) {
    parties.unshift({
      id: DEFAULT_SUPPLIER_PARTY_ID,
      type: 'supplier',
      name: 'فروشنده پیش‌فرض',
      nationalId: '',
      phone: '',
      address: '',
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
    });
    changed = true;
  }
  return changed ? { ...data, parties } : data;
}


export function checkDefaultPartyPolicy(type: InvoiceType, partyId: string, settings: { allowDefaultCustomerSales?: boolean; allowDefaultSupplierPurchases?: boolean }): void {
  if (isSaleInvoiceType(type) && partyId === DEFAULT_CUSTOMER_PARTY_ID && settings.allowDefaultCustomerSales === false) {
    throw new Error('فروش به «خریدار پیش‌فرض» در تنظیمات حسابداری غیرفعال است.');
  }
  if (isPurchaseInvoiceType(type) && partyId === DEFAULT_SUPPLIER_PARTY_ID && settings.allowDefaultSupplierPurchases === false) {
    throw new Error('خرید از «فروشنده پیش‌فرض» در تنظیمات حسابداری غیرفعال است.');
  }
}

export async function assertDefaultPartyAllowed(type: InvoiceType, partyId: string): Promise<void> {
  const acc = await loadAccountingData();
  checkDefaultPartyPolicy(type, partyId, acc.settings);
}

function validCommerceData(v: unknown): v is CommerceData {
  if (!v || typeof v !== 'object') return false;
  const x = v as Partial<CommerceData>;
  return x.schemaVersion === 1 && Array.isArray(x.parties) && Array.isArray(x.invoices) && Array.isArray(x.cashTransactions);
}
export async function loadCommerceData(): Promise<CommerceData> {
  let data: CommerceData | null = null;
  try { const v = await idbGet<unknown>(KEY); if (validCommerceData(v)) data = v; } catch (e) { console.warn('commerce read failed', e); }
  if (!data) {
    try { const v = await idbGet<unknown>(BACKUP); if (validCommerceData(v)) data = v; } catch (e) { console.warn('commerce backup read failed', e); }
  }
  if (!data) data = emptyCommerceData();
  const withDefaults = ensureDefaultParties(data);
  if (withDefaults !== data) {
    try { await saveCommerceData(withDefaults); } catch (e) { console.warn('persist default parties failed', e); }
  }
  return withDefaults;
}
export async function saveCommerceData(v: CommerceData): Promise<void> {
  if (!validCommerceData(v)) throw new Error('ساختار اطلاعات فاکتور و دریافت‌وپرداخت معتبر نیست.');
  await idbPutMany([{ key: BACKUP, value: v }, { key: KEY, value: v }]);
}

/** افزودن حساب‌های سیستمی حتی اگر کدینگ قبلاً مقداردهی شده باشد. */
export async function ensureCommerceAccounts(): Promise<AccountingData> {
  const data = await loadAccountingData();
  // همه حساب‌های لازم برای فاکتور/تسویه/چک — با والدین به‌ترتیب از بالا به پایین
  const additions: Array<{id:string;code:string;title:string;level:'group'|'general'|'subsidiary'|'detail';nature:'debit'|'credit';parentId:string|null}> = [
    // دارایی‌ها
    { id:'grp-assets', code:'1', title:'دارایی‌ها', level:'group', nature:'debit', parentId:null },
    { id:'acc-current-assets', code:'11', title:'دارایی‌های جاری', level:'general', nature:'debit', parentId:'grp-assets' },
    { id:'sub-cash-bank', code:'1101', title:'موجودی نقد و بانک', level:'subsidiary', nature:'debit', parentId:'acc-current-assets' },
    { id:'det-cash', code:'110101', title:'صندوق', level:'detail', nature:'debit', parentId:'sub-cash-bank' },
    { id:'det-bank', code:'110102', title:'بانک', level:'detail', nature:'debit', parentId:'sub-cash-bank' },
    { id:'sub-receivables', code:'1102', title:'حساب‌ها و اسناد دریافتنی', level:'subsidiary', nature:'debit', parentId:'acc-current-assets' },
    { id:'det-customers', code:'110201', title:'اشخاص دریافتنی', level:'detail', nature:'debit', parentId:'sub-receivables' },
    { id:'sub-inventory', code:'1103', title:'موجودی کالا', level:'subsidiary', nature:'debit', parentId:'acc-current-assets' },
    { id:'det-inventory', code:'110301', title:'موجودی کالای انبار', level:'detail', nature:'debit', parentId:'sub-inventory' },
    { id:'sub-input-tax', code:'1104', title:'مالیات و عوارض ارزش افزوده خرید', level:'subsidiary', nature:'debit', parentId:'acc-current-assets' },
    { id:'det-input-tax', code:'110401', title:'مالیات ارزش افزوده خرید', level:'detail', nature:'debit', parentId:'sub-input-tax' },
    { id:'sub-cheques-receivable', code:'1105', title:'اسناد دریافتنی', level:'subsidiary', nature:'debit', parentId:'acc-current-assets' },
    { id:'det-cheques-receivable', code:'110501', title:'چک‌های دریافتنی نزد صندوق', level:'detail', nature:'debit', parentId:'sub-cheques-receivable' },
    // بدهی‌ها
    { id:'grp-liabilities', code:'2', title:'بدهی‌ها', level:'group', nature:'credit', parentId:null },
    { id:'acc-current-liabilities', code:'21', title:'بدهی‌های جاری', level:'general', nature:'credit', parentId:'grp-liabilities' },
    { id:'sub-payables', code:'2101', title:'حساب‌ها و اسناد پرداختنی', level:'subsidiary', nature:'credit', parentId:'acc-current-liabilities' },
    { id:'det-suppliers', code:'210101', title:'اشخاص پرداختنی', level:'detail', nature:'credit', parentId:'sub-payables' },
    { id:'det-landed-payable', code:'210102', title:'هزینه‌های جانبی خرید پرداختنی', level:'detail', nature:'credit', parentId:'sub-payables' },
    { id:'sub-output-tax', code:'2102', title:'مالیات و عوارض ارزش افزوده فروش', level:'subsidiary', nature:'credit', parentId:'acc-current-liabilities' },
    { id:'det-output-tax', code:'210201', title:'مالیات ارزش افزوده فروش', level:'detail', nature:'credit', parentId:'sub-output-tax' },
    { id:'sub-cheques-payable', code:'2103', title:'اسناد پرداختنی', level:'subsidiary', nature:'credit', parentId:'acc-current-liabilities' },
    { id:'det-cheques-payable', code:'210301', title:'چک‌های پرداختنی', level:'detail', nature:'credit', parentId:'sub-cheques-payable' },
    // درآمد / فروش
    { id:'grp-revenue', code:'4', title:'درآمدها', level:'group', nature:'credit', parentId:null },
    { id:'acc-sales', code:'41', title:'فروش کالا و خدمات', level:'general', nature:'credit', parentId:'grp-revenue' },
    { id:'sub-sales-goods', code:'4101', title:'فروش کالا', level:'subsidiary', nature:'credit', parentId:'acc-sales' },
    { id:'det-sales-goods', code:'410101', title:'فروش کالای اصلی', level:'detail', nature:'credit', parentId:'sub-sales-goods' },
    // بهای تمام‌شده / خرید
    { id:'grp-cogs', code:'5', title:'بهای تمام‌شده', level:'group', nature:'debit', parentId:null },
    { id:'acc-cogs', code:'51', title:'بهای تمام‌شده کالای فروش‌رفته', level:'general', nature:'debit', parentId:'grp-cogs' },
    { id:'sub-cogs-goods', code:'5101', title:'بهای تمام‌شده کالای فروش‌رفته', level:'subsidiary', nature:'debit', parentId:'acc-cogs' },
    { id:'det-cogs-goods', code:'510101', title:'بهای تمام‌شده کالای اصلی', level:'detail', nature:'debit', parentId:'sub-cogs-goods' },
    { id:'sub-purchases', code:'5102', title:'خرید کالا', level:'subsidiary', nature:'debit', parentId:'acc-cogs' },
    { id:'det-purchases', code:'510201', title:'خرید کالا و مواد', level:'detail', nature:'debit', parentId:'sub-purchases' },
    { id:'det-purchase-discounts', code:'510202', title:'تخفیفات خرید کالا', level:'detail', nature:'credit', parentId:'sub-purchases' },
    // هزینه‌ها
    { id:'grp-expenses', code:'6', title:'هزینه‌ها', level:'group', nature:'debit', parentId:null },
    { id:'acc-operating-expenses', code:'61', title:'هزینه‌های عملیاتی', level:'general', nature:'debit', parentId:'grp-expenses' },
    { id:'sub-bank-expenses', code:'6102', title:'هزینه‌های بانکی', level:'subsidiary', nature:'debit', parentId:'acc-operating-expenses' },
    { id:'det-bank-fees', code:'610201', title:'کارمزد و هزینه خدمات بانکی', level:'detail', nature:'debit', parentId:'sub-bank-expenses' },
    // درآمد/هزینه مالی و مالیات بر درآمد (برای صورت سود و زیان استاندارد)
    { id:'acc-finance-income', code:'43', title:'درآمدهای مالی', level:'general', nature:'credit', parentId:'grp-revenue' },
    { id:'sub-finance-income', code:'4301', title:'سود و درآمدهای مالی', level:'subsidiary', nature:'credit', parentId:'acc-finance-income' },
    { id:'det-finance-income', code:'430101', title:'درآمد سود سپرده و تسهیلات', level:'detail', nature:'credit', parentId:'sub-finance-income' },
    { id:'acc-finance-expenses', code:'62', title:'هزینه‌های مالی', level:'general', nature:'debit', parentId:'grp-expenses' },
    { id:'sub-finance-expenses', code:'6201', title:'سود و کارمزد تسهیلات', level:'subsidiary', nature:'debit', parentId:'acc-finance-expenses' },
    { id:'det-finance-interest', code:'620101', title:'هزینه سود تسهیلات بانکی', level:'detail', nature:'debit', parentId:'sub-finance-expenses' },
    { id:'det-finance-fees', code:'620102', title:'کارمزد و هزینه خدمات مالی', level:'detail', nature:'debit', parentId:'sub-finance-expenses' },
    { id:'acc-income-tax', code:'63', title:'مالیات بر درآمد', level:'general', nature:'debit', parentId:'grp-expenses' },
    { id:'sub-income-tax', code:'6301', title:'مالیات عملکرد', level:'subsidiary', nature:'debit', parentId:'acc-income-tax' },
    { id:'det-income-tax', code:'630101', title:'هزینه مالیات بر درآمد', level:'detail', nature:'debit', parentId:'sub-income-tax' },
    { id:'sub-inventory-impairment', code:'6104', title:'کاهش ارزش موجودی', level:'subsidiary', nature:'debit', parentId:'acc-operating-expenses' },
    { id:'det-inventory-impairment', code:'610401', title:'زیان کاهش ارزش موجودی کالا', level:'detail', nature:'debit', parentId:'sub-inventory-impairment' },
    { id:'sub-cost-variances', code:'5103', title:'انحرافات بهای تمام‌شده', level:'subsidiary', nature:'debit', parentId:'acc-cogs' },
    { id:'det-purchase-price-variance', code:'510301', title:'انحراف قیمت خرید (بهای استاندارد)', level:'detail', nature:'debit', parentId:'sub-cost-variances' },
  ];
  const timestamp = now();
  let changed = false;
  for (const a of additions) {
    const existing = data.accounts.find(x => x.id === a.id);
    if (existing) {
      // اگر وجود دارد ولی غیرفعال یا سطح اشتباه است، برای سیستم‌های ضروری فعال کن
      if (!existing.isActive || existing.level !== a.level) {
        existing.isActive = true;
        existing.level = a.level as typeof existing.level;
        existing.updatedAt = timestamp;
        changed = true;
      }
      continue;
    }
    // اگر همان کد قبلاً با id دیگر ثبت شده، از همان استفاده کن (alias نرم)
    const byCode = data.accounts.find(x => x.code === a.code);
    if (byCode) {
      if (!byCode.isActive) { byCode.isActive = true; byCode.updatedAt = timestamp; changed = true; }
      continue;
    }
    // والد باید موجود باشد (یا null برای group)
    if (a.parentId && !data.accounts.some(x => x.id === a.parentId)) {
      // والد را در همین حلقه بعداً اضافه می‌کنیم — ترتیب از بالاست؛ اگر نبود، یک‌بار دیگر تلاش بعد از افزودن والدین
      continue;
    }
    data.accounts.push({
      id: a.id,
      code: a.code,
      title: a.title,
      level: a.level,
      nature: a.nature,
      parentId: a.parentId,
      isActive: true,
      isSystem: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    changed = true;
  }
  // پاس دوم برای مواردی که والد در پاس اول تازه اضافه شده
  for (const a of additions) {
    if (data.accounts.some(x => x.id === a.id)) continue;
    if (data.accounts.some(x => x.code === a.code)) continue;
    if (a.parentId && !data.accounts.some(x => x.id === a.parentId)) continue;
    data.accounts.push({
      id: a.id, code: a.code, title: a.title, level: a.level, nature: a.nature, parentId: a.parentId,
      isActive: true, isSystem: true, createdAt: timestamp, updatedAt: timestamp,
    });
    changed = true;
  }
  if (changed) await saveAccountingData(data);
  return data;
}

/**
 * ثبت کاهش ارزش موجودی (IAS 2 / NRV):
 * بدهکار: زیان کاهش ارزش موجودی · بستانکار: موجودی کالا
 * همزمان ارزش دفتر بهای تمام‌شده (و لایه‌های FIFO) کاهش می‌یابد؛ تعداد موجودی ثابت می‌ماند.
 */
export async function postInventoryNrvWriteDown(input: {
  productId: string;
  warehouse: string;
  writeDownRial: number;
  date: string;
  fiscalPeriodId: string;
  note?: string;
}): Promise<{ journalEntryId: string }> {
  return withCommerceMutationLock(() => postInventoryNrvWriteDownExclusive(input));
}

async function postInventoryNrvWriteDownExclusive(input: {
  productId: string;
  warehouse: string;
  writeDownRial: number;
  date: string;
  fiscalPeriodId: string;
  note?: string;
}): Promise<{ journalEntryId: string }> {
  if (!Number.isSafeInteger(input.writeDownRial) || input.writeDownRial <= 0) {
    throw new Error('مبلغ کاهش ارزش باید عدد صحیح ریال و بیشتر از صفر باشد.');
  }
  const product = products.find(p => p.id === input.productId);
  if (!product) throw new Error('کالا پیدا نشد.');
  const warehouse = warehouseName(input.warehouse || product.warehouse);
  let accounting = await ensureCommerceAccounts();
  requireAccount(accounting, 'det-inventory', 'موجودی کالا');
  requireAccount(accounting, 'det-inventory-impairment', 'زیان کاهش ارزش موجودی کالا');
  validateDateAndPeriod(input.date, input.fiscalPeriodId, accounting);

  const costing = await loadInventoryCostData();
  const before = getCostBalance(costing, product.id, warehouse);
  if (before.qtyMilli <= 0) throw new Error(`کالای «${product.name}» در انبار «${warehouse}» موجودی ندارد.`);
  if (input.writeDownRial > before.valueRial) {
    throw new Error(`مبلغ کاهش ارزش از ارزش دفتری (${before.valueRial} ریال) بیشتر است.`);
  }

  // شناسه پایدار برای idempotency (بدون Date.now)
  const sourceId = `nrv-wd:${product.id}:${warehouse}:${input.date}:${input.writeDownRial}`;
  const alreadyPosted = accounting.journalEntries.find(
    (j) => j.sourceDocumentId === sourceId && j.status === 'posted',
  );
  if (alreadyPosted) {
    return { journalEntryId: alreadyPosted.id };
  }

  const operation = await beginCommerceOperation({
    id: `nrv:${sourceId}`,
    kind: 'nrv-write-down',
    inputSnapshot: {
      productId: input.productId,
      warehouse,
      writeDownRial: input.writeDownRial,
      date: input.date,
      fiscalPeriodId: input.fiscalPeriodId,
      note: input.note,
    },
  });

  try {
    applyNrvWriteDown(costing, {
      productId: product.id,
      warehouse,
      writeDownRial: input.writeDownRial,
    });

    const desc =
      (input.note || '').trim() ||
      `کاهش ارزش موجودی «${product.name}» تا سطح NRV — انبار ${warehouse}`;
    const lines = [
      journalLine('det-inventory-impairment', desc, input.writeDownRial, 0),
      journalLine('det-inventory', desc, 0, input.writeDownRial),
    ];
    const prepared = preparePostedJournal(
      accounting,
      journalBase(sourceId, 'NRV', input.fiscalPeriodId, input.date, desc, 'inventory', lines),
    );

    await commitFinancialDomains({
      accounting: prepared.accounting,
      costing,
      completedOperation: operation,
    });

    logAudit('inventory_nrv_write_down', {
      productId: product.id,
      warehouse,
      writeDownRial: input.writeDownRial,
      journalEntryId: prepared.journalId,
    });

    return { journalEntryId: prepared.journalId };
  } catch (error) {
    await writePendingCommerceOperation({
      ...operation,
      lastError: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    throw error;
  }
}

export function upsertParty(data: CommerceData, input: Omit<AccountingParty,'id'|'createdAt'|'updatedAt'> & {id?:string}): CommerceData {
  const name = input.name.trim();
  if (!name) throw new Error('نام مشتری یا تأمین‌کننده الزامی است.');
  const nationalId = input.nationalId.trim();
  if (nationalId && !/^[0-9]{10,14}$/.test(nationalId)) throw new Error('شناسه ملی/کد اقتصادی باید ۱۰ تا ۱۴ رقم باشد.');
  if (nationalId && data.parties.some(p => p.id !== input.id && p.nationalId === nationalId)) throw new Error('این شناسه قبلاً برای شخص دیگری ثبت شده است.');
  const existing = input.id ? data.parties.find(p => p.id === input.id) : undefined;
  if (input.id && !existing) throw new Error('شخص موردنظر پیدا نشد.');
  const timestamp = now();
  const party: AccountingParty = { ...input, id:existing?.id || makeId('party'), name, nationalId, phone:input.phone.trim(), address:input.address.trim(), economicCode:(input.economicCode||'').trim(), registrationNumber:(input.registrationNumber||'').trim(), postalCode:(input.postalCode||'').trim(), createdAt:existing?.createdAt || timestamp, updatedAt:timestamp };
  return { ...data, parties: existing ? data.parties.map(p=>p.id===party.id?party:p) : [...data.parties,party] };
}

function validateDateAndPeriod(date: string, periodId: string, accounting: AccountingData): void {
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) throw new Error('تاریخ باید به شکل سال/ماه/روز شمسی باشد.');
  const period = accounting.fiscalPeriods.find(p=>p.id===periodId);
  if (!period || period.status !== 'open') throw new Error('سال مالی معتبر و باز انتخاب کنید.');
  if (date < period.startDate || date > period.endDate) throw new Error('تاریخ سند خارج از محدوده سال مالی است.');
}
function requireAccount(accounting: AccountingData, id: string, title: string): void {
  let a = accounting.accounts.find(x=>x.id===id && x.isActive && x.level==='detail');
  if (!a) {
    // فعال‌سازی حساب سیستم در صورت وجود ولی غیرفعال
    const any = accounting.accounts.find(x=>x.id===id);
    if (any && any.level==='detail') {
      any.isActive = true;
      a = any;
    }
  }
  if (!a) throw new Error(`حساب تفصیلی فعال «${title}» در کدینگ پیدا نشد. یک‌بار از بخش حسابداری کدینگ پیش‌فرض را بررسی کنید یا برنامه را تازه کنید.`);
}
function journalLine(accountId: string, description: string, debitRial: number, creditRial: number, partyId?: string): JournalLine {
  return { id:makeId('line'), accountId, description, debitRial, creditRial, ...(partyId?{partyId}:{}) };
}
function journalBase(id: string, number: string, periodId: string, date: string, description: string, source: JournalEntry['source'], lines: JournalLine[]): JournalEntry {
  return { id:makeId('je'), number:`${number}-${Date.now().toString().slice(-5)}-${Math.random().toString(36).slice(2,5)}`,  fiscalPeriodId:periodId, date, description, status:'draft', source, sourceDocumentId:id, lines, createdAt:now(), updatedAt:now() };
}
/** فقط حافظه — بدون IO؛ برای commit اتمیک چنددامنه‌ای */
function preparePostedJournal(accounting: AccountingData, entry: JournalEntry): { accounting: AccountingData; journalId: string } {
  const already = accounting.journalEntries.find(j=>j.sourceDocumentId===entry.sourceDocumentId && j.status==='posted');
  if (already) return { accounting, journalId: already.id };
  // Reuse an existing draft for this source instead of creating an orphan draft
  // every time the posting flow is retried.
  const existingDraft = accounting.journalEntries.find(j=>j.sourceDocumentId===entry.sourceDocumentId && j.status==='draft');
  const candidate: JournalEntry = existingDraft
    ? { ...entry, id: existingDraft.id, createdAt: existingDraft.createdAt }
    : entry;
  const withDraft = upsertJournalEntry(accounting, candidate);
  const posted = postJournalEntry(withDraft, candidate.id);
  return { accounting: posted, journalId: candidate.id };
}

/** مسیرهای تک‌دامنه‌ای غیر بحرانی (هزینه/درآمد متفرقه و مشابه) */
async function persistPostedJournal(accounting: AccountingData, entry: JournalEntry): Promise<string> {
  const { accounting: next, journalId } = preparePostedJournal(accounting, entry);
  await saveAccountingData(next);
  return journalId;
}

/**
 * ثبت سریع هزینه یا درآمد متفرقه در بازرگانی.
 * هزینه: بدهکار حساب هزینه / بستانکار صندوق یا بانک
 * درآمد: بدهکار صندوق یا بانک / بستانکار حساب درآمد
 */
export async function recordOperatingEntry(input: {
  kind: 'expense' | 'income';
  date: string;
  fiscalPeriodId: string;
  amountRial: number;
  operatingAccountId: string;
  cashAccountId: string;
  description: string;
  partyId?: string;
}): Promise<{ journalEntryId: string }> {
  if (!['expense', 'income'].includes(input.kind)) throw new Error('نوع ثبت باید هزینه یا درآمد باشد.');
  if (!Number.isSafeInteger(input.amountRial) || input.amountRial <= 0) throw new Error('مبلغ باید عددی مثبت و معتبر باشد.');
  const description = (input.description || '').trim();
  if (!description) throw new Error('شرح سند الزامی است.');
  const accounting = await loadAccountingData();
  validateDateAndPeriod(input.date, input.fiscalPeriodId, accounting);
  const opAcc = accounting.accounts.find(a => a.id === input.operatingAccountId && a.isActive && a.level === 'detail');
  if (!opAcc) throw new Error('حساب هزینه/درآمد معتبر انتخاب کنید.');
  const cashAcc = accounting.accounts.find(a => a.id === input.cashAccountId && a.isActive && a.level === 'detail');
  if (!cashAcc) throw new Error('حساب صندوق یا بانک معتبر انتخاب کنید.');
  if (input.kind === 'expense' && !opAcc.code.startsWith('6')) throw new Error('برای هزینه، حساب از گروه هزینه‌ها (کد ۶) انتخاب کنید.');
  if (input.kind === 'income' && !opAcc.code.startsWith('4')) throw new Error('برای درآمد، حساب از گروه درآمدها (کد ۴) انتخاب کنید.');
  const partyId = input.partyId?.trim() || undefined;
  if (partyId) {
    const commerceData = await loadCommerceData();
    const party = commerceData.parties.find(p => p.id === partyId && p.isActive);
    if (!party) throw new Error('طرف حساب انتخاب‌شده فعال نیست.');
  }
  const sourceKey = `operating:${input.kind}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const prefix = input.kind === 'expense' ? 'EX' : 'IN';
  const lines = input.kind === 'expense'
    ? [
        journalLine(opAcc.id, description, input.amountRial, 0, partyId),
        journalLine(cashAcc.id, description, 0, input.amountRial),
      ]
    : [
        journalLine(cashAcc.id, description, input.amountRial, 0),
        journalLine(opAcc.id, description, 0, input.amountRial, partyId),
      ];
  const entry = journalBase(sourceKey, prefix, input.fiscalPeriodId, input.date, description, 'manual', lines);
  const journalEntryId = await persistPostedJournal(accounting, entry);
  return { journalEntryId };
}

/** فهرست اسناد هزینه/درآمد ثبت‌شده از بازرگانی */
export function listOperatingEntries(accounting: AccountingData, kind?: 'expense' | 'income', limit = 50) {
  return accounting.journalEntries
    .filter(e => e.status === 'posted' && typeof e.sourceDocumentId === 'string' && e.sourceDocumentId.startsWith('operating:'))
    .filter(e => !kind || e.sourceDocumentId!.startsWith(`operating:${kind}:`))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number, 'en'))
    .slice(0, limit)
    .map(e => {
      const amount = e.lines.reduce((s, l) => s + l.debitRial, 0);
      const isExpense = e.sourceDocumentId!.includes(':expense:');
      const opLine = isExpense
        ? e.lines.find(l => l.debitRial > 0)
        : e.lines.find(l => l.creditRial > 0);
      const account = accounting.accounts.find(a => a.id === opLine?.accountId);
      return {
        id: e.id,
        number: e.number,
        date: e.date,
        description: e.description,
        amountRial: amount,
        kind: (isExpense ? 'expense' : 'income') as 'expense' | 'income',
        accountTitle: account?.title || opLine?.accountTitleSnapshot || '—',
        accountCode: account?.code || opLine?.accountCodeSnapshot || '',
      };
    });
}

export function buildInvoice(input: {
  type: InvoiceType; number: string; date: string; fiscalPeriodId: string; partyId: string;
  description: string; lines: Array<{description:string; quantityMilli:number; unitPriceRial:number; productId?:string; warehouse?:string; unit?:string; discountRial?:number}>; taxRial:number; taxRateBps?:number; dueDate?:string; paymentTerms?:string; paymentParts?:InvoicePaymentPart[]; notes?:string;
  landedCosts?: InvoiceLandedCosts;
}, parties: AccountingParty[]): CommercialInvoice {
  const party = parties.find(p=>p.id===input.partyId && p.isActive);
  if (!party || !(party.type==='both' || (isSaleInvoiceType(input.type)?party.type==='customer':party.type==='supplier'))) throw new Error('طرف حساب فعال و متناسب با نوع فاکتور انتخاب کنید.');
  const number = input.number.trim(); if (!number) throw new Error('شماره فاکتور الزامی است.');
  if (!input.lines.length) throw new Error('فاکتور باید حداقل یک ردیف کالا یا خدمت داشته باشد.');
  const lines: CommercialInvoiceLine[] = input.lines.map(l=>{
    const description=l.description.trim();
    if (!description) throw new Error('شرح ردیف فاکتور الزامی است.');
    if (!Number.isSafeInteger(l.quantityMilli) || l.quantityMilli<=0) throw new Error('تعداد باید بیشتر از صفر و حداکثر سه رقم اعشار داشته باشد.');
    if (!isSafeMoney(l.unitPriceRial) || l.unitPriceRial<=0) throw new Error('قیمت واحد باید عدد صحیح ریال و بیشتر از صفر باشد.');
    const product = l.quantityMilli * l.unitPriceRial;
    if (!Number.isSafeInteger(product)) throw new Error('حاصل تعداد در قیمت از محدوده مجاز محاسبات خارج است.');
    const grossLineRial = Math.floor((product + 500) / 1000);
    const discountRial = l.discountRial || 0;
    if (!isSafeMoney(discountRial) || discountRial >= grossLineRial) throw new Error('تخفیف ردیف باید کمتر از مبلغ ردیف باشد.');
    const totalRial = grossLineRial - discountRial;
    if (!isSafeMoney(totalRial) || totalRial<=0) throw new Error('مبلغ ردیف معتبر نیست.');
    return {id:makeId('item'),description,quantityMilli:l.quantityMilli,unitPriceRial:l.unitPriceRial,totalRial,unit:(l.unit||'عدد').trim()||'عدد',discountRial,...(l.productId?{productId:l.productId,warehouse:l.warehouse||'انبار اصلی'}:{})};
  });
  const netRial=lines.reduce((s,l)=>s+l.totalRial,0);
  if (!Number.isSafeInteger(netRial) || !isSafeMoney(input.taxRial)) throw new Error('مبلغ کل یا مالیات از محدوده مجاز خارج است.');
  const grossRial=netRial+input.taxRial;
  if (!Number.isSafeInteger(grossRial) || grossRial<=0) throw new Error('جمع نهایی فاکتور معتبر نیست.');
  if (input.taxRateBps !== undefined && (!Number.isSafeInteger(input.taxRateBps) || input.taxRateBps < 0 || input.taxRateBps > 10000)) throw new Error('نرخ مالیات باید بین صفر تا صد درصد باشد.');
  if (input.dueDate && !/^\d{4}\/\d{2}\/\d{2}$/.test(input.dueDate)) throw new Error('تاریخ سررسید باید به شکل سال/ماه/روز شمسی باشد.');
  if (input.dueDate && input.dueDate < input.date) throw new Error('تاریخ سررسید نمی‌تواند قبل از تاریخ فاکتور باشد.');
  const paymentParts=(input.paymentParts||[]).map(part=>{if(!['cash','card','cheque','credit'].includes(part.method)||!isSafeMoney(part.amountRial)||part.amountRial<=0)throw new Error('روش یا مبلغ یکی از بخش‌های پرداخت معتبر نیست.');if(part.method==='cheque'){if(!part.chequeNumber?.trim()||!part.chequeBank?.trim()||!part.chequeAccount?.trim()||!part.chequeDueDate||!/^\d{4}\/\d{2}\/\d{2}$/.test(part.chequeDueDate))throw new Error('برای هر چک، مبلغ، شماره چک، بانک، شماره صیادی و تاریخ سررسید معتبر الزامی است.');if(part.chequeDueDate<input.date)throw new Error('سررسید چک نمی‌تواند قبل از تاریخ فاکتور باشد.');}return {...part};});
  const allocatedPayments=paymentParts.reduce((sum,x)=>sum+x.amountRial,0);
  if(allocatedPayments>grossRial)throw new Error('جمع پرداخت‌ها نباید از مبلغ نهایی فاکتور بیشتر شود.');
  // پیش‌نویس بدون تسویه مجاز است؛ سررسید اعتباری در برگه تسویه/قطعی‌سازی الزامی می‌شود
  if(input.type!=='proforma'&&allocatedPayments<grossRial){
    const creditIndex=paymentParts.findIndex(part=>part.method==='credit');
    const remaining=grossRial-allocatedPayments;
    if(creditIndex>=0) paymentParts[creditIndex]={...paymentParts[creditIndex],amountRial:paymentParts[creditIndex].amountRial+remaining,note:paymentParts[creditIndex].note||'مانده بدهی/مطالبه فاکتور'};
    else paymentParts.push({method:'credit',amountRial:remaining,note:'مانده بدهی/مطالبه فاکتور'});
  }
  // هزینه‌های جانبی خرید فقط روی فاکتور خرید معنا دارد و باید عدد صحیح غیرمنفی ریال باشد
  let landedCosts: InvoiceLandedCosts | undefined;
  if (input.landedCosts && input.type === 'purchase') {
    const norm = (n?: number) => Math.max(0, Math.round(Number(n) || 0));
    landedCosts = {
      freightRial: norm(input.landedCosts.freightRial),
      customsRial: norm(input.landedCosts.customsRial),
      insuranceRial: norm(input.landedCosts.insuranceRial),
      otherRial: norm(input.landedCosts.otherRial),
      note: (input.landedCosts.note || '').trim() || undefined,
    };
    const totalLc = totalLandedCostRial(landedCosts);
    if (totalLc > 0 && !lines.some(l => l.productId)) {
      throw new Error('هزینه جانبی خرید فقط وقتی قابل ثبت است که حداقل یک ردیف کالای انباری در فاکتور باشد.');
    }
    for (const key of ['freightRial', 'customsRial', 'insuranceRial', 'otherRial'] as const) {
      const v = landedCosts[key] || 0;
      if (!isSafeMoney(v)) throw new Error('مبالغ هزینه‌های جانبی خرید باید عدد صحیح ریال و معتبر باشند.');
    }
    if (!totalLc) landedCosts = undefined;
  }
  return {id:makeId('invoice'),type:input.type,number,date:input.date,fiscalPeriodId:input.fiscalPeriodId,partyId:party.id,description:input.description.trim(),lines,netRial,taxRial:input.taxRial,grossRial,taxRateBps:input.taxRateBps??0,dueDate:input.dueDate||'',paymentTerms:(input.paymentTerms||'').trim(),paymentParts,notes:(input.notes||'').trim(),...(landedCosts?{landedCosts}:{}),status:'draft',createdAt:now(),updatedAt:now()};
}

/** ویرایش کنترل‌شده پیش‌نویس؛ فاکتور قطعی قابل بازنویسی نیست. */
export function updateDraftInvoice(invoiceId: string, input: Parameters<typeof buildInvoice>[0], commerce: CommerceData): CommerceData {
  const existing = commerce.invoices.find(i => i.id === invoiceId);
  if (!existing) throw new Error('فاکتور برای ویرایش پیدا نشد.');
  if (existing.status !== 'draft') throw new Error('فاکتور قطعی قابل ویرایش مستقیم نیست؛ برای حفظ سوابق باید اصلاحیه مستقل ثبت شود.');
  if (commerce.invoices.some(i => i.id !== invoiceId && i.type === input.type && i.fiscalPeriodId === input.fiscalPeriodId && i.number.trim() === input.number.trim())) throw new Error('شماره فاکتور در این نوع فاکتور تکراری است.');
  const validated = buildInvoice(input, commerce.parties);
  const updated: CommercialInvoice = { ...validated, id: existing.id, status: 'draft', createdAt: existing.createdAt, updatedAt: now() };
  logAudit('accounting_invoice_draft_edited', { invoiceId, number: updated.number, type: updated.type, oldGrossRial: existing.grossRial, newGrossRial: updated.grossRial });
  return { ...commerce, invoices: commerce.invoices.map(i => i.id === invoiceId ? updated : i) };
}

/**
 * به‌روزرسانی قیمت خرید/فروش روی کارت کالا پس از قطعی‌سازی خرید.
 * - بهای تمام‌شده انبار (costing) تغییر نمی‌کند؛ فقط فیلدهای کاتالوگ کالا.
 * - واحد مبالغ: ریال (هم‌راستا با unitPriceRial فاکتور و فیلدهای کالا).
 */
function applyCatalogPricesAfterPurchase(
  invoice: CommercialInvoice,
  costing: Awaited<ReturnType<typeof loadInventoryCostData>>,
  accounting: AccountingData
): void {
  const settings = accounting.settings;
  const purchaseMode = settings.purchasePriceUpdateMode || 'last';
  const saleMode = settings.salePriceUpdateMode || 'none';
  if (purchaseMode === 'none' && saleMode === 'none') return;

  const markupPct = Math.max(0, Number(settings.salePriceMarkupPercent) || 0);
  for (const line of invoice.lines) {
    if (!line.productId) continue;
    const p = products.find((x) => x.id === line.productId);
    if (!p) continue;
    const qty = line.quantityMilli / 1000;
    if (!(qty > 0)) continue;
    // بهای واحد خالص ردیف (پس از تخفیف ردیف)
    const netUnitRial = line.totalRial / qty;
    if (!(netUnitRial >= 0) || !Number.isFinite(netUnitRial)) continue;

    const prevPurchase = Number(p.purchasePrice) || 0;
    const prevSale = Number(p.price) || 0;
    let nextPurchase = prevPurchase;

    if (purchaseMode === 'last') {
      nextPurchase = netUnitRial;
    } else if (purchaseMode === 'average') {
      const wh = warehouseName(line.warehouse || p.warehouse);
      const bal = getCostBalance(costing, p.id, wh);
      nextPurchase = bal.averageUnitCostRial > 0 ? bal.averageUnitCostRial : netUnitRial;
    }

    if (purchaseMode !== 'none') {
      p.purchasePrice = Math.round(nextPurchase * 1000) / 1000;
    }

    if (saleMode === 'markup' && (purchaseMode !== 'none' ? nextPurchase : prevPurchase) > 0) {
      const base = purchaseMode !== 'none' ? nextPurchase : prevPurchase;
      p.price = Math.round(base * (1 + markupPct / 100) * 1000) / 1000;
    } else if (saleMode === 'keep-ratio' && purchaseMode !== 'none' && prevPurchase > 0 && nextPurchase > 0) {
      const ratio = prevSale > 0 ? prevSale / prevPurchase : 1;
      p.price = Math.round(nextPurchase * ratio * 1000) / 1000;
    }
  }
}

/**
 * تخصیص هزینه‌های جانبی خرید به ردیف‌های کالایی به‌نسبت مبلغ ردیف (IAS 2).
 * باقی‌مانده گرد کردن به آخرین ردیف دارای کالا داده می‌شود.
 */
export function allocateLandedCostsToLines(lines: CommercialInvoiceLine[], totalLandedRial: number): Map<string, number> {
  const map = new Map<string, number>();
  const stock = lines.filter(l => l.productId);
  if (!stock.length || totalLandedRial <= 0) return map;
  const base = stock.reduce((s, l) => s + Math.max(0, l.totalRial), 0);
  if (base <= 0) {
    // تخصیص مساوی در صورت نبود مبلغ پایه
    const each = Math.floor(totalLandedRial / stock.length);
    let assigned = 0;
    stock.forEach((l, i) => {
      const share = i === stock.length - 1 ? totalLandedRial - assigned : each;
      map.set(l.id, share);
      assigned += share;
    });
    return map;
  }
  let assigned = 0;
  stock.forEach((l, i) => {
    const share = i === stock.length - 1
      ? totalLandedRial - assigned
      : Math.round(totalLandedRial * (l.totalRial / base));
    map.set(l.id, Math.max(0, share));
    assigned += Math.max(0, share);
  });
  return map;
}

// نشانگر عملیات و commit اتمیک از financial-commit.ts تأمین می‌شود.

export async function postInvoice(invoiceId: string, commerce: CommerceData): Promise<{commerce:CommerceData; accounting:AccountingData}> {
  return withCommerceMutationLock(async () => {
    const persisted = await loadCommerceData();
    const invoiceIsPersisted = persisted.invoices.some(i => i.id === invoiceId);
    const source = invoiceIsPersisted ? persisted : commerce;
    const invoice = source.invoices.find(i => i.id === invoiceId);
    if (!invoice) throw new Error('فاکتور پیدا نشد.');
    if (invoice.status === 'posted') return postInvoiceExclusive(invoiceId, source);
    // Ensure the draft itself is durable before recording the operation marker.
    if (!invoiceIsPersisted) await saveCommerceData(source);
    const operation = await beginCommerceOperation({
      id: `post-invoice:${invoiceId}:${Date.now()}`,
      kind: 'post-invoice',
      invoiceId,
    });
    try {
      // commit اتمیک و tombstone داخل postInvoiceExclusive انجام می‌شود
      return await postInvoiceExclusive(invoiceId, source);
    } catch (error) {
      await writePendingCommerceOperation({
        ...operation,
        lastError: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
      throw error;
    }
  });
}

/**
 * Resume a previously interrupted commerce operation after application state has
 * been loaded. Invoice posting is idempotent by invoice/sourceDocumentId.
 */
export async function recoverPendingCommerceOperation(): Promise<{status:'none'|'recovered'|'blocked'; message?:string}> {
  const operation = await readPendingCommerceOperation();
  if (!operation || operation.state === 'completed') return { status: 'none' };

  if (operation.kind === 'post-invoice') {
    if (!operation.invoiceId) {
      return { status: 'blocked', message: 'عملیات مالی نیمه‌تمام — شناسه فاکتور نامعتبر است. اطلاعات برای بررسی حفظ شد.' };
    }
    const commerce = await loadCommerceData();
    const invoice = commerce.invoices.find(item => item.id === operation.invoiceId);
    if (!invoice) {
      return { status: 'blocked', message: 'عملیات مالی نیمه‌تمام — فاکتور مرتبط پیدا نشد. اطلاعات برای بررسی حفظ شد.' };
    }
    if (invoice.status === 'posted') {
      const accounting = await loadAccountingData();
      const linkedJournal = accounting.journalEntries.find(
        journal => journal.status === 'posted' && journal.sourceDocumentId === invoice.id,
      );
      if (!linkedJournal) {
        return { status: 'blocked', message: `فاکتور ${invoice.number} قطعی است اما سند حسابداری مرتبط پیدا نشد؛ نشانگر بازیابی حفظ شد تا بررسی دستی انجام شود.` };
      }
      if (invoice.lines.some(line => line.productId)) {
        const costing = await loadInventoryCostData();
        const missingMovement = invoice.lines.some(line =>
          !!line.productId && !costing.movements.some(movement =>
            movement.sourceDocumentId === invoice.id && movement.productId === line.productId,
          ),
        );
        if (missingMovement) {
          return { status: 'blocked', message: `فاکتور ${invoice.number} و سند حسابداری آن قطعی‌اند اما گردش یک یا چند کالای انباری پیدا نشد؛ نشانگر بازیابی حفظ شد.` };
        }
      }
      await markOperationCompleted(operation.id);
      return { status: 'recovered', message: 'عملیات مالی نیمه‌تمام بازیابی شد: فاکتور، سند حسابداری و گردش کالای مرتبط بررسی و تأیید شدند.' };
    }
    try {
      await postInvoice(operation.invoiceId, commerce);
      // هم‌ترازی کارت کالا با گردش بهای تمام‌شده پس از بازیابی
      try {
        const stockIds = (invoice.lines || [])
          .map((l) => l.productId)
          .filter((id): id is string => typeof id === 'string' && !!id);
        if (stockIds.length) await reconcileProductStockFromCosting(stockIds);
      } catch (reconErr) {
        console.warn('[Anbarin] stock reconcile after invoice recovery failed', reconErr);
      }
      return { status: 'recovered', message: `عملیات مالی نیمه‌تمام بازیابی شد: ثبت فاکتور ${invoice.number} پس از توقف برنامه تکمیل شد.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writePendingCommerceOperation({ ...operation, attempts: operation.attempts + 1, lastError: message });
      return { status: 'blocked', message: `عملیات مالی نیمه‌تمام — بازیابی فاکتور ${invoice.number} انجام نشد: ${message}` };
    }
  }

  if (operation.kind === 'cash-transaction') {
    if (!operation.transactionId || !operation.inputSnapshot) {
      return { status: 'blocked', message: 'عملیات مالی نیمه‌تمام — ورودی دریافت/پرداخت ناقص است. اطلاعات برای بررسی حفظ شد.' };
    }
    const commerce = await loadCommerceData();
    const existing = commerce.cashTransactions.find(t => t.id === operation.transactionId);
    if (existing) {
      const accounting = await loadAccountingData();
      const linkedJournal = accounting.journalEntries.find(journal =>
        journal.status === 'posted' &&
        (journal.id === existing.journalEntryId || journal.sourceDocumentId === existing.id),
      );
      if (!linkedJournal) {
        return { status: 'blocked', message: `دریافت/پرداخت ${existing.number} در اطلاعات بازرگانی وجود دارد اما سند حسابداری قطعی آن پیدا نشد؛ نشانگر بازیابی حفظ شد.` };
      }
      await markOperationCompleted(operation.id);
      return { status: 'recovered', message: 'عملیات مالی نیمه‌تمام بازیابی شد: دریافت/پرداخت و سند حسابداری مرتبط بررسی و تأیید شدند.' };
    }
    try {
      const input = operation.inputSnapshot as Parameters<typeof createCashTransaction>[0];
      // اجرای مجدد با همان شناسه ثابت از طریق exclusive با transactionId از پیش تعیین‌شده
      await createCashTransactionFromRecovery(input, commerce, operation.transactionId);
      return { status: 'recovered', message: 'عملیات مالی نیمه‌تمام بازیابی شد: ثبت دریافت/پرداخت پس از توقف برنامه تکمیل شد.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writePendingCommerceOperation({ ...operation, attempts: operation.attempts + 1, lastError: message });
      return { status: 'blocked', message: `بازیابی دریافت/پرداخت انجام نشد: ${message}` };
    }
  }

  if (operation.kind === 'cheque-status') {
    const snap = operation.inputSnapshot as
      | { transactionId?: string; status?: Exclude<ChequeStatus, 'pending'>; clearingDate?: string }
      | undefined;
    const transactionId = operation.transactionId || snap?.transactionId;
    const status = snap?.status;
    const clearingDate = snap?.clearingDate;
    if (!transactionId || !status || !clearingDate) {
      return { status: 'blocked', message: 'عملیات مالی نیمه‌تمام — ورودی تغییر وضعیت چک ناقص است. اطلاعات برای بررسی حفظ شد.' };
    }
    const commerce = await loadCommerceData();
    const tx = commerce.cashTransactions.find((t) => t.id === transactionId);
    if (!tx) {
      return { status: 'blocked', message: 'عملیات مالی نیمه‌تمام — تراکنش چک پیدا نشد. اطلاعات برای بررسی حفظ شد.' };
    }
    if (tx.chequeStatus === status || (status === 'void' && tx.chequeStatus === 'void')) {
      const accounting = await loadAccountingData();
      const sourceSuffix = status === 'cleared' ? 'clear' : status === 'bounced' ? 'bounce' : 'void';
      const linkedJournal = accounting.journalEntries.find(journal =>
        journal.status === 'posted' &&
        (journal.id === tx.clearingJournalEntryId || journal.sourceDocumentId === `${tx.id}:${sourceSuffix}`),
      );
      if (!linkedJournal) {
        return { status: 'blocked', message: `وضعیت چک ${tx.chequeNumber || tx.number} تغییر کرده اما سند حسابداری مرحله «${status}» پیدا نشد؛ نشانگر بازیابی حفظ شد.` };
      }
      await markOperationCompleted(operation.id);
      return { status: 'recovered', message: 'وضعیت چک و سند حسابداری مرتبط بررسی و تأیید شدند؛ نشانگر پاک‌سازی شد.' };
    }
    if (tx.chequeStatus !== 'pending') {
      return {
        status: 'blocked',
        message: `چک در وضعیت «${tx.chequeStatus}» است و بازیابی به «${status}» ممکن نیست.`,
      };
    }
    try {
      await updateChequeStatus(transactionId, status, clearingDate, commerce);
      return { status: 'recovered', message: `وضعیت چک پس از توقف برنامه به «${status}» به‌روز شد.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writePendingCommerceOperation({
        ...operation,
        attempts: operation.attempts + 1,
        lastError: message,
      });
      return { status: 'blocked', message: `بازیابی وضعیت چک انجام نشد: ${message}` };
    }
  }

  if (operation.kind === 'cheque-endorsement') {
    const snap = operation.inputSnapshot as {
      transactionId?: string;
      toPartyId?: string;
      invoiceId?: string;
      date?: string;
      note?: string;
      amountRial?: number;
    } | undefined;
    if (!snap?.transactionId || !snap.toPartyId || !snap.invoiceId || !snap.date || snap.amountRial == null) {
      return { status: 'blocked', message: 'عملیات مالی نیمه‌تمام — ورودی ظهرنویسی ناقص است. اطلاعات برای بررسی حفظ شد.' };
    }
    try {
      const { recoverChequeEndorsementFromSnapshot } = await import('./accounting-cheque-endorsement');
      await recoverChequeEndorsementFromSnapshot({
        transactionId: snap.transactionId,
        toPartyId: snap.toPartyId,
        invoiceId: snap.invoiceId,
        date: snap.date,
        note: snap.note || '',
        amountRial: snap.amountRial,
      });
      await markOperationCompleted(operation.id);
      return { status: 'recovered', message: 'عملیات مالی نیمه‌تمام بازیابی شد: ظهرنویسی چک پس از توقف برنامه تکمیل شد.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writePendingCommerceOperation({
        ...operation,
        attempts: operation.attempts + 1,
        lastError: message,
      });
      return { status: 'blocked', message: `بازیابی ظهرنویسی انجام نشد: ${message}` };
    }
  }

  if (operation.kind === 'nrv-write-down') {
    const snap = operation.inputSnapshot as {
      productId?: string;
      warehouse?: string;
      writeDownRial?: number;
      date?: string;
      fiscalPeriodId?: string;
      note?: string;
    } | undefined;
    if (!snap?.productId || !snap.warehouse || !snap.writeDownRial || !snap.date || !snap.fiscalPeriodId) {
      return { status: 'blocked', message: 'عملیات مالی نیمه‌تمام — ورودی کاهش ارزش موجودی (NRV) ناقص است. اطلاعات برای بررسی حفظ شد.' };
    }
    const sourceId = `nrv-wd:${snap.productId}:${snap.warehouse}:${snap.date}:${snap.writeDownRial}`;
    const accounting = await loadAccountingData();
    if (accounting.journalEntries.some((j) => j.sourceDocumentId === sourceId && j.status === 'posted')) {
      await markOperationCompleted(operation.id);
      return { status: 'recovered', message: 'عملیات مالی نیمه‌تمام بازیابی شد: کاهش ارزش موجودی قبلاً ثبت شده بود و نشانگر پاک‌سازی شد.' };
    }
    try {
      await postInventoryNrvWriteDown({
        productId: snap.productId,
        warehouse: snap.warehouse,
        writeDownRial: snap.writeDownRial,
        date: snap.date,
        fiscalPeriodId: snap.fiscalPeriodId,
        note: snap.note,
      });
      return { status: 'recovered', message: 'عملیات مالی نیمه‌تمام بازیابی شد: کاهش ارزش موجودی (NRV) پس از توقف برنامه تکمیل شد.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writePendingCommerceOperation({
        ...operation,
        attempts: operation.attempts + 1,
        lastError: message,
      });
      return { status: 'blocked', message: `بازیابی NRV انجام نشد: ${message}` };
    }
  }

  return { status: 'blocked', message: 'نوع عملیات بازیابی پشتیبانی نمی‌شود.' };
}


async function postInvoiceExclusive(invoiceId: string, commerce: CommerceData): Promise<{commerce:CommerceData; accounting:AccountingData}> {
  const persisted = await loadCommerceData();
  const activeCommerce = persisted.invoices.some(i => i.id === invoiceId) ? persisted : commerce;
  const invoice=activeCommerce.invoices.find(i=>i.id===invoiceId); if(!invoice) throw new Error('فاکتور پیدا نشد.');
  if(activeCommerce.invoices.some(i=>i.id!==invoice.id&&i.type===invoice.type&&i.fiscalPeriodId===invoice.fiscalPeriodId&&i.number.trim()===invoice.number.trim())) throw new Error('شماره این فاکتور با سند دیگری تکراری است؛ قبل از قطعی‌سازی شماره را اصلاح کنید.');
  if(invoice.status==='posted') return {commerce:activeCommerce,accounting:await loadAccountingData()};
  if(invoice.type==='proforma') throw new Error('پیش‌فاکتور فقط قابل ذخیره و چاپ است و سند حسابداری یا گردش انبار ایجاد نمی‌کند.');
  const creditParts=(invoice.paymentParts||[]).filter(p=>p.method==='credit');
  if(creditParts.some(p=>p.amountRial>0) && !invoice.dueDate) throw new Error('برای مانده اعتباری، تاریخ سررسید را در تسویه مشخص کنید.');
  let accounting=await ensureCommerceAccounts();
  validateDateAndPeriod(invoice.date,invoice.fiscalPeriodId,accounting);
  const party=activeCommerce.parties.find(p=>p.id===invoice.partyId && p.isActive); if(!party) throw new Error('طرف حساب فاکتور غیرفعال یا حذف شده است.');
  await assertDefaultPartyAllowed(invoice.type, invoice.partyId);
  const ar='det-customers', ap='det-suppliers', sales='det-sales-goods', inventory='det-inventory', cogs='det-cogs-goods', purchases='det-purchases', inputTax='det-input-tax', outputTax='det-output-tax';
  const stockLines=invoice.lines.filter(l=>l.productId);
  const saleSide=isSaleInvoiceType(invoice.type); const returnSide=isReturnInvoiceType(invoice.type);
  const stockPurchaseDiscount=isPurchaseInvoiceType(invoice.type)&&invoice.lines.some(l=>l.productId&&(l.discountRial||0)>0);
  const landedTotal = invoice.type === 'purchase' ? totalLandedCostRial(invoice.landedCosts) : 0;
  if (landedTotal > 0 && stockLines.length === 0) throw new Error('فاکتور خرید دارای هزینه جانبی باید حداقل یک ردیف کالای انباری داشته باشد.');
  const landedAlloc = invoice.type === 'purchase' ? allocateLandedCostsToLines(invoice.lines, landedTotal) : new Map<string, number>();
  const titles:Record<string,string>={
    [ar]:'اشخاص دریافتنی',[ap]:'اشخاص پرداختنی',[sales]:'فروش کالا',[inventory]:'موجودی کالا',
    [cogs]:'بهای تمام‌شده',[purchases]:'خرید کالا',[inputTax]:'مالیات خرید',[outputTax]:'مالیات فروش',
    'det-purchase-discounts':'تخفیفات خرید','det-landed-payable':'هزینه‌های جانبی خرید پرداختنی',
    'det-purchase-price-variance':'انحراف قیمت خرید',
  };
  const mayUseStandardCost=!saleSide && stockLines.some(l=>{
    const p=products.find(x=>x.id===l.productId);
    return !!p && Math.round(Number(p.standardCostRial)||0)>0;
  });
  const needed=saleSide?[ar,sales,inventory,cogs,...(invoice.taxRial?[outputTax]:[])]:[inventory,purchases,cogs,ap,...(invoice.taxRial?[inputTax]:[]),...(stockPurchaseDiscount?['det-purchase-discounts']:[]),...(landedTotal>0?['det-landed-payable']:[]),...(mayUseStandardCost?['det-purchase-price-variance']:[])];
  // اگر هنوز نبود، یک‌بار دیگر ensure و بعد خطا با عنوان فارسی
  for(const id of needed){
    if(!accounting.accounts.some(x=>x.id===id&&x.isActive&&x.level==='detail')){
      accounting=await ensureCommerceAccounts();
      break;
    }
  }
  for(const id of needed) requireAccount(accounting,id,titles[id]||id);
  const costing=await loadInventoryCostData();
  let inventoryValue=0; let cogsValue=0; let purchaseCogsAdjustment=0; let purchasePriceVariance=0; let provisional=false;
  const touched=new Set<string>();
  const alreadyApplied=new Set(costing.movements.filter(m=>m.sourceDocumentId===invoice.id).map(m=>m.productId));
  for(const line of stockLines){
    const product=products.find(p=>p.id===line.productId); if(!product) throw new Error(`کالای ردیف «${line.description}» دیگر در انبار وجود ندارد.`);
    const warehouse=line.warehouse||product.warehouse||'انبار اصلی';
    ensureProductStock(product); // انبار فاکتور می‌تواند هر انباری باشد که موجودی در آن مدیریت می‌شود
    if(touched.has(product.id)) throw new Error(`کالای «${product.name}» در چند ردیف تکرار شده است؛ ردیف‌ها را یکی کنید.`); touched.add(product.id);
    if(alreadyApplied.has(product.id)) continue;
    seedOpeningStock(costing,product.id,warehouse,Math.round(getWarehouseQty(product,warehouse)*1000));
    if((invoice.type==='purchase' || invoice.type==='return-sale')){
      // بهای ورود: قیمت واحد فاکتور + سهم هزینه جانبی هر واحد (Landed Cost همیشه در موجودی می‌ماند)
      let landedPerUnit=0;
      if(invoice.type==='purchase'){
        const share=landedAlloc.get(line.id)||0;
        line.allocatedLandedRial = share;
        if(share>0 && line.quantityMilli>0){
          landedPerUnit = Math.round(share * 1000 / line.quantityMilli);
        }
      }
      // قیمت واقعی خرید = مبلغ بعد از تخفیف هر واحد (totalRial)
      const netUnit = line.quantityMilli > 0
        ? Math.round(line.totalRial * 1000 / line.quantityMilli)
        : line.unitPriceRial;
      const grossUnit = line.unitPriceRial;
      const actualUnit = invoice.type === 'purchase'
        ? netUnit + landedPerUnit
        : getCostBalance(costing, product.id, warehouse).averageUnitCostRial;
      if (invoice.type === 'return-sale' && actualUnit <= 0) throw new Error(`برای برگشت کالای «${product.name}» بهای موجودی معتبر پیدا نشد.`);
      const std = Math.round(Number(product.standardCostRial) || 0);
      const useStandard = invoice.type === 'purchase' && std > 0;
      const unitCost = useStandard
        ? (std + landedPerUnit)
        : (invoice.type === 'purchase' ? grossUnit + landedPerUnit : actualUnit);
      const result = receiveStock(costing, {
        productId: product.id, warehouse, qtyMilli: line.quantityMilli, unitCostRial: unitCost, date: invoice.date, sourceDocumentId: invoice.id,
        actualUnitCostRial: useStandard ? actualUnit : undefined,
      });
      inventoryValue+=result.inventoryValueRial;
      if(invoice.type==='return-sale')cogsValue+=result.inventoryValueRial;
      purchaseCogsAdjustment+=result.negativeOffsetCostRial;
      if(useStandard) purchasePriceVariance+=result.priceVarianceRial;
    }else{
      const allowNegative=!!accounting.settings.allowNegativeStock
        || !!accounting.settings.allowNegativeStockByWarehouse[warehouse];
      const result=issueStock(costing,{productId:product.id,warehouse,qtyMilli:line.quantityMilli,date:invoice.date,sourceDocumentId:invoice.id,method:accounting.settings.defaultCostingMethod,allowNegative,productName:product.name});
      cogsValue+=result.totalCostRial; if(invoice.type==='return-purchase')inventoryValue+=result.totalCostRial; provisional=provisional||result.provisional;
    }
  }
  // Reconcile integer-rial rounding from per-unit Landed Cost allocation.
  // The costing engine stores integer unit prices, so multiplying a rounded
  // unit cost by fractional quantities can differ by a few rials from the
  // exact allocated line amount. Route that deterministic residual through
  // purchase price variance so the journal remains balanced without changing
  // the allocated Landed Cost total or supplier payable.
  if (invoice.type === 'purchase' && stockLines.length) {
    const expectedStockCost = stockLines.reduce((sum, line) => {
      const allocated = landedAlloc.get(line.id) || 0;
      const prod = products.find(x => x.id === line.productId);
      const std = Math.round(Number(prod?.standardCostRial) || 0);
      if (std > 0) return sum + line.totalRial + allocated;
      return sum + line.totalRial + (line.discountRial || 0) + allocated;
    }, 0);
    const recognizedStockCost = inventoryValue + purchaseCogsAdjustment + purchasePriceVariance;
    purchasePriceVariance += expectedStockCost - recognizedStockCost;
  }

  const lines:JournalLine[]=[];
  if(saleSide){
    lines.push(journalLine(ar,'حساب دریافتنی مشتری',invoice.grossRial,0,party.id),journalLine(sales,'فروش کالا و خدمات',0,invoice.netRial));
    if(invoice.taxRial)lines.push(journalLine(outputTax,'مالیات ارزش افزوده فروش',0,invoice.taxRial));
    if(cogsValue)lines.push(journalLine(cogs,'بهای تمام‌شده کالای فروش‌رفته',cogsValue,0),journalLine(inventory,'کاهش موجودی کالا',0,cogsValue));
  }else{
    const nonStockPurchase=invoice.lines.filter(l=>!l.productId).reduce((sum,l)=>sum+l.totalRial,0);
    if(inventoryValue)lines.push(journalLine(inventory,'افزایش موجودی کالا',inventoryValue,0));
    // انحراف قیمت خرید: بهای واقعی − بهای استاندارد (نامساعد بدهکار / مساعد بستانکار)
    if(purchasePriceVariance>0){
      requireAccount(accounting,'det-purchase-price-variance','انحراف قیمت خرید');
      lines.push(journalLine('det-purchase-price-variance','انحراف نامساعد قیمت خرید نسبت به بهای استاندارد',purchasePriceVariance,0));
    }else if(purchasePriceVariance<0){
      requireAccount(accounting,'det-purchase-price-variance','انحراف قیمت خرید');
      lines.push(journalLine('det-purchase-price-variance','انحراف مساعد قیمت خرید نسبت به بهای استاندارد',0,-purchasePriceVariance));
    }
    if(purchaseCogsAdjustment)lines.push(journalLine(cogs,'تعدیل بهای تمام‌شده بابت تسویه کسری منفی',purchaseCogsAdjustment,0));
    if(nonStockPurchase)lines.push(journalLine(purchases,'خرید خدمات و اقلام غیرانبار',nonStockPurchase,0));
    const stockDiscount=stockLines.reduce((sum,l)=>sum+(l.discountRial||0),0);
    if(stockDiscount)lines.push(journalLine('det-purchase-discounts','تخفیفات خرید کالا',0,stockDiscount));
    if(invoice.taxRial)lines.push(journalLine(inputTax,'مالیات ارزش افزوده خرید',invoice.taxRial,0));
    lines.push(journalLine(ap,'حساب پرداختنی تأمین‌کننده',0,invoice.grossRial,party.id));
    // هزینه‌های جانبی خرید (حمل/گمرک/بیمه/سایر) به بهای موجودی اضافه و به‌عنوان بدهی جانبی ثبت می‌شود
    if(landedTotal>0){
      lines.push(journalLine('det-landed-payable','هزینه‌های جانبی خرید (حمل، گمرک، بیمه و سایر)',0,landedTotal));
    }
  }
  if(returnSide){ for(const line of lines){ const debit=line.debitRial; line.debitRial=line.creditRial; line.creditRial=debit; } }
  // کنترل هم‌زمانی موجودی باید پیش از قطعی‌سازی سند حسابداری انجام شود.
  for(const line of stockLines){const p=products.find(x=>x.id===line.productId)!;ensureProductStock(p);const movement=costing.movements.find(m=>m.sourceDocumentId===invoice.id&&m.productId===p.id);if(!movement)throw new Error(`گردش انبار کالای «${p.name}» ثبت نشده است.`);const wh=warehouseName(line.warehouse||p.warehouse);const before=movement.beforeQtyMilli/1000,after=movement.afterQtyMilli/1000;const current=getWarehouseQty(p,wh);if(Math.abs(current-before)>=0.000001&&Math.abs(current-after)>=0.000001)throw new Error(`موجودی کالای «${p.name}» در انبار «${wh}» هم‌زمان تغییر کرده است؛ فاکتور را بررسی کنید.`);}
  const existing=accounting.journalEntries.find(j=>j.sourceDocumentId===invoice.id && j.status==='posted');

  // --- ساخت همه تغییرات در حافظه ---
  let workingAccounting = accounting;
  let journalId: string;
  if (existing) {
    journalId = existing.id;
  } else {
    const prepared = preparePostedJournal(
      workingAccounting,
      journalBase(invoice.id, saleSide?'F':'B', invoice.fiscalPeriodId, invoice.date, invoice.description || `فاکتور ${invoice.number}`, saleSide?'sales':'purchase', lines),
    );
    workingAccounting = prepared.accounting;
    journalId = prepared.journalId;
  }

  // تغییرات کارت کالا پیش از commit مالی فقط در حافظه انجام می‌شوند؛
  // اگر تراکنش IndexedDB شکست بخورد، snapshot فیلدهای تغییرپذیر برگردانده می‌شود.
  const productSnapshots = new Map<string, {
    systemQty: number;
    warehouse?: string;
    stockByWarehouse?: Record<string, number>;
    purchasePrice?: number;
    price?: number;
  }>();
  for (const line of stockLines) {
    const product = products.find(item => item.id === line.productId);
    if (!product || productSnapshots.has(product.id)) continue;
    productSnapshots.set(product.id, {
      systemQty: product.systemQty,
      warehouse: product.warehouse,
      stockByWarehouse: product.stockByWarehouse ? { ...product.stockByWarehouse } : undefined,
      purchasePrice: product.purchasePrice,
      price: product.price,
    });
  }

  const updated = { ...invoice, status: 'posted' as const, journalEntryId: journalId, updatedAt: now() };
  const nextCommerce = {
    ...activeCommerce,
    invoices: activeCommerce.invoices.map(i => i.id === invoice.id ? updated : i),
  };

  // --- یک تراکنش IndexedDB برای accounting + costing + commerce + tombstone ---
  const pendingOp = await readPendingCommerceOperation();
  try {
    // کارت کالا فقط از balances (منبع حقیقت) همگام می‌شود — نه از مسیر موازی دستی
    if (stockLines.length) {
      const ids = stockLines.map(l => l.productId).filter((id): id is string => !!id);
      applyCostingBalancesToProducts(costing, ids);
    }

    // قیمت کاتالوگ طبق تنظیمات حسابداری؛ بهای تمام‌شده انبار مستقل باقی می‌ماند.
    if (invoice.type === 'purchase' && stockLines.length) {
      applyCatalogPricesAfterPurchase(invoice, costing, workingAccounting);
    }

    await commitFinancialDomains({
      accounting: workingAccounting,
      costing: stockLines.length ? costing : undefined,
      commerce: nextCommerce,
      completedOperation:
        pendingOp && pendingOp.kind === 'post-invoice' && pendingOp.invoiceId === invoice.id
          ? pendingOp
          : {
              id: `post-invoice:${invoice.id}:commit`,
              kind: 'post-invoice',
              invoiceId: invoice.id,
              startedAt: new Date().toISOString(),
              attempts: 1,
              state: 'pending',
            },
    });
  } catch (error) {
    for (const [productId, snapshot] of productSnapshots) {
      const product = products.find(item => item.id === productId);
      if (!product) continue;
      product.systemQty = snapshot.systemQty;
      if (snapshot.warehouse === undefined) delete product.warehouse;
      else product.warehouse = snapshot.warehouse;
      if (snapshot.stockByWarehouse === undefined) delete product.stockByWarehouse;
      else product.stockByWarehouse = { ...snapshot.stockByWarehouse };
      if (snapshot.purchasePrice === undefined) delete product.purchasePrice;
      else product.purchasePrice = snapshot.purchasePrice;
      if (snapshot.price === undefined) delete product.price;
      else product.price = snapshot.price;
    }
    throw error;
  }

  // موجودی کارت کالا — مسیر ثانویه پس از موفقیت مالی
  if (stockLines.length) {
    saveAppState(true);
    await flushSave();
    logAudit('accounting_invoice_stock_posted', {
      invoiceId: invoice.id,
      number: invoice.number,
      type: invoice.type,
      items: stockLines.length,
      cogsRial: cogsValue,
      inventoryRial: inventoryValue,
      provisionalCost: provisional,
    });
  }

  return { commerce: nextCommerce, accounting: workingAccounting };
}

export async function createCashTransaction(input: {
  type:'receipt'|'payment'; number:string; date:string; fiscalPeriodId:string; partyId:string;
  cashAccountId:string; amountRial:number; description:string; method?:SettlementMethod;
  allocations?:InvoiceAllocation[]; chequeNumber?:string; chequeBank?:string; chequeAccount?:string; chequeNote?:string; chequeDueDate?:string;
}, commerce:CommerceData):Promise<{commerce:CommerceData;accounting:AccountingData}> {
  return withCommerceMutationLock(() => createCashTransactionExclusive(input, commerce));
}

async function createCashTransactionExclusive(input: {
  type:'receipt'|'payment'; number:string; date:string; fiscalPeriodId:string; partyId:string;
  cashAccountId:string; amountRial:number; description:string; method?:SettlementMethod;
  allocations?:InvoiceAllocation[]; chequeNumber?:string; chequeBank?:string; chequeAccount?:string; chequeNote?:string; chequeDueDate?:string;
}, originalCommerce:CommerceData, fixedTransactionId?: string):Promise<{commerce:CommerceData;accounting:AccountingData}> {
  const persisted = await loadCommerceData();
  const activeCommerce = persisted.cashTransactions.length || persisted.invoices.length || persisted.parties.length ? persisted : originalCommerce;
  const commerce = activeCommerce;
  // بازیابی / تکرار: اگر تراکنش با شناسه ثابت از قبل وجود دارد، دوباره نساز
  if (fixedTransactionId && activeCommerce.cashTransactions.some(t => t.id === fixedTransactionId)) {
    return { commerce: activeCommerce, accounting: await loadAccountingData() };
  }
  let accounting=await ensureCommerceAccounts(); validateDateAndPeriod(input.date,input.fiscalPeriodId,accounting);
  if(!input.number.trim()) throw new Error('شماره رسید یا پرداخت الزامی است.');
  const normalizedNumber=input.number.trim();
  if(activeCommerce.cashTransactions.some(t=>t.type===input.type&&t.fiscalPeriodId===input.fiscalPeriodId&&t.number.trim()===normalizedNumber)) throw new Error('شماره رسید/پرداخت در این نوع سند و سال مالی قبلاً ثبت شده است.');
  if(!isSafeMoney(input.amountRial)||input.amountRial<=0) throw new Error('مبلغ باید عدد صحیح ریال و بیشتر از صفر باشد.');
  const party=activeCommerce.parties.find(p=>p.id===input.partyId&&p.isActive);
  if(!party) throw new Error('طرف حساب فعال پیدا نشد.');
  const allocatedInvoiceTypes=(input.allocations||[]).map(a=>activeCommerce.invoices.find(i=>i.id===a.invoiceId)?.type).filter(Boolean) as InvoiceType[];
  // مشتری: دریافت از مشتری و بازپرداخت به مشتری مجاز است
  // تأمین‌کننده: پرداخت به تأمین‌کننده و دریافت از تأمین‌کننده (مثلاً برگشت وجه) مجاز است
  // both: هر دو جهت مجاز است
  const partyOk =
    party.type === 'both'
    || (party.type === 'customer' && (input.type === 'receipt' || input.type === 'payment'))
    || (party.type === 'supplier' && (input.type === 'payment' || input.type === 'receipt'));
  if (!partyOk) {
    throw new Error('طرف حساب متناسب با دریافت یا پرداخت انتخاب کنید.');
  }
  // برای انتخاب حساب اشخاص در ادامه
  const method=input.method||'cash'; const isCheque=method==='cheque';
  if(!isCheque) requireAccount(accounting,input.cashAccountId,'صندوق/بانک');
  else {
    requireAccount(accounting,input.cashAccountId,'صندوق/بانک مقصد یا مبدأ برای تسویه چک');
    requireAccount(accounting,input.type==='receipt'?'det-cheques-receivable':'det-cheques-payable','اسناد چک');
    if(!input.chequeNumber?.trim()||!input.chequeBank?.trim()||!input.chequeAccount?.trim()||!input.chequeDueDate||!/^[0-9]{4}\/[0-9]{2}\/[0-9]{2}$/.test(input.chequeDueDate)) throw new Error('برای چک، شماره چک، بانک، شماره صیادی و تاریخ سررسید معتبر الزامی است.');
    if(input.chequeDueDate<input.date) throw new Error('سررسید چک نمی‌تواند قبل از تاریخ دریافت/پرداخت باشد.');
    const normalizedCheque=input.chequeNumber!.trim();
    const normalizedBank=input.chequeBank!.trim().toLocaleLowerCase();
    const normalizedSerial=(input.chequeAccount||'').replace(/\s+/g,'').toLocaleLowerCase();
    // تکراری فقط در همان جهت (دریافت یا پرداخت) و فقط برای چک‌های فعال (pending/cleared).
    // void و bounced اجازهٔ ثبت مجدد می‌دهند (مثلاً چک جایگزین پس از برگشت).
    const isActiveChequeStatus=(s?:string)=>!s||s==='pending'||s==='cleared';
    if(activeCommerce.cashTransactions.some(t=>
      t.type===input.type
      && t.method==='cheque'
      && isActiveChequeStatus(t.chequeStatus)
      && t.chequeNumber?.trim()===normalizedCheque
      && (t.chequeBank||'').trim().toLocaleLowerCase()===normalizedBank
      && (t.chequeAccount||'').replace(/\s+/g,'').toLocaleLowerCase()===normalizedSerial
    )) throw new Error('این مشخصات چک (شماره، بانک و شناسه صیادی) در همین نوع سند قبلاً به‌صورت فعال ثبت شده است.');
  }
  const allocations=input.allocations||[]; const allocated=allocations.reduce((sum,a)=>sum+a.amountRial,0);
  if(allocations.some(a=>!isSafeMoney(a.amountRial)||a.amountRial<=0)||allocated>input.amountRial) throw new Error('مجموع تخصیص به فاکتورها معتبر نیست یا از مبلغ عملیات بیشتر است.');
  const seen=new Set<string>();
  for(const a of allocations){
    if(seen.has(a.invoiceId)) throw new Error('یک فاکتور را بیش از یک بار انتخاب نکنید.'); seen.add(a.invoiceId);
    const invoice=activeCommerce.invoices.find(i=>i.id===a.invoiceId&&i.status==='posted'&&i.partyId===party.id);
    const expectedType=invoice&&(invoice.type==='sale'||invoice.type==='return-purchase'?'receipt':invoice.type==='purchase'||invoice.type==='return-sale'?'payment':null);
    if(!invoice||expectedType!==input.type||invoice.type==='proforma') throw new Error('فاکتور انتخابی قطعی نیست یا با نوع دریافت/پرداخت و طرف حساب سازگار نیست.');
    const outstanding=invoiceOutstanding(invoice.id,commerce);
    if(a.amountRial>outstanding) throw new Error(`مبلغ تخصیص از مانده فاکتور ${invoice.number} بیشتر است.`);
  }
  const allocatedType=allocatedInvoiceTypes[0];
  const returnSale=allocatedType==='return-sale';
  const returnPurchase=allocatedType==='return-purchase';
  // حساب اشخاص:
  // - تخصیص به فروش/برگشت فروش یا بازپرداخت به مشتری → det-customers
  // - در غیر این صورت تأمین‌کننده → det-suppliers
  let partyAccount: string;
  if (allocatedInvoiceTypes.length) {
    partyAccount =
      (input.type === 'receipt' && !returnPurchase) || (input.type === 'payment' && returnSale)
        ? 'det-customers'
        : 'det-suppliers';
  } else if (party.type === 'customer' || (party.type === 'both' && input.type === 'receipt')) {
    partyAccount = 'det-customers';
  } else {
    partyAccount = 'det-suppliers';
  }
  requireAccount(accounting, partyAccount, 'حساب اشخاص');
  const instrumentAccount=isCheque?(input.type==='receipt'?'det-cheques-receivable':'det-cheques-payable'):input.cashAccountId;
  const lines:JournalLine[] = input.type==='receipt'
    ? [journalLine(instrumentAccount,isCheque?'چک دریافتنی':'دریافت وجه',input.amountRial,0),journalLine(partyAccount,'تسویه حساب طرف حساب',0,input.amountRial,party.id)]
    : [journalLine(partyAccount,'تسویه حساب طرف حساب',input.amountRial,0,party.id),journalLine(instrumentAccount,isCheque?'چک پرداختنی':'پرداخت وجه',0,input.amountRial)];
  // شناسه ثابت قبل از هر نوشتن — برای idempotency و بازیابی
  const id = fixedTransactionId || makeId(input.type);
  const entry = journalBase(
    id,
    input.type === 'receipt' ? 'R' : 'P',
    input.fiscalPeriodId,
    input.date,
    input.description || (input.type === 'receipt' ? 'دریافت از مشتری' : 'پرداخت به تأمین‌کننده'),
    input.type,
    lines,
  );

  const operation = await beginCommerceOperation({
    id: `cash:${id}`,
    kind: 'cash-transaction',
    transactionId: id,
    inputSnapshot: {
      type: input.type,
      number: input.number,
      date: input.date,
      fiscalPeriodId: input.fiscalPeriodId,
      partyId: input.partyId,
      cashAccountId: input.cashAccountId,
      amountRial: input.amountRial,
      description: input.description,
      method: input.method,
      allocations: input.allocations,
      chequeNumber: input.chequeNumber,
      chequeBank: input.chequeBank,
      chequeAccount: input.chequeAccount,
      chequeNote: input.chequeNote,
      chequeDueDate: input.chequeDueDate,
    },
  });

  try {
    const prepared = preparePostedJournal(accounting, entry);
    const journalEntryId = prepared.journalId;
    const tx: CashTransaction = {
      id,
      type: input.type,
      number: input.number.trim(),
      date: input.date,
      fiscalPeriodId: input.fiscalPeriodId,
      partyId: party.id,
      cashAccountId: input.cashAccountId,
      amountRial: input.amountRial,
      description: input.description.trim(),
      journalEntryId,
      createdAt: now(),
      method,
      allocations,
      ...(isCheque
        ? {
            chequeNumber: input.chequeNumber!.trim(),
            chequeBank: input.chequeBank!.trim(),
            chequeAccount: (input.chequeAccount || '').trim(),
            chequeNote: (input.chequeNote || '').trim(),
            chequeDueDate: input.chequeDueDate,
            chequeStatus: 'pending' as const,
          }
        : {}),
    };
    const nextCommerce = {
      ...activeCommerce,
      cashTransactions: [...activeCommerce.cashTransactions, tx],
    };

    await commitFinancialDomains({
      accounting: prepared.accounting,
      commerce: nextCommerce,
      completedOperation: operation,
    });

    return { commerce: nextCommerce, accounting: prepared.accounting };
  } catch (error) {
    await writePendingCommerceOperation({
      ...operation,
      lastError: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    throw error;
  }
}

/** بازیابی دریافت/پرداخت با شناسه از پیش تعیین‌شده (از operation journal) */
async function createCashTransactionFromRecovery(
  input: Parameters<typeof createCashTransaction>[0],
  commerce: CommerceData,
  fixedId: string,
): Promise<{ commerce: CommerceData; accounting: AccountingData }> {
  return withCommerceMutationLock(async () => {
    const persisted = await loadCommerceData();
    if (persisted.cashTransactions.some(t => t.id === fixedId)) {
      await markOperationCompleted(`cash:${fixedId}`);
      return { commerce: persisted, accounting: await loadAccountingData() };
    }
    return createCashTransactionExclusive(input, commerce, fixedId);
  });
}

export function invoiceOutstanding(invoiceId:string,commerce:CommerceData):number {
  const invoice=commerce.invoices.find(i=>i.id===invoiceId&&i.status==='posted'); if(!invoice)return 0;
  const allocated=commerce.cashTransactions.filter(t=>!t.chequeStatus||t.chequeStatus==='pending'||t.chequeStatus==='cleared').flatMap(t=>t.allocations||[]).filter(a=>a.invoiceId===invoiceId).reduce((s,a)=>s+a.amountRial,0);
  const endorsed=invoice.type==='purchase'?(commerce.chequeEndorsements||[]).filter(e=>e.invoiceId===invoiceId&&commerce.cashTransactions.some(t=>t.id===e.transactionId&&(!t.chequeStatus||t.chequeStatus==='pending'||t.chequeStatus==='cleared'))).reduce((sum,e)=>sum+e.amountRial,0):0;
  return Math.max(0,invoice.grossRial-allocated-endorsed);
}

export async function updateChequeStatus(
  transactionId: string,
  status: Exclude<ChequeStatus, 'pending'>,
  clearingDate: string,
  commerce: CommerceData,
): Promise<{ commerce: CommerceData; accounting: AccountingData }> {
  return withCommerceMutationLock(() =>
    updateChequeStatusExclusive(transactionId, status, clearingDate, commerce),
  );
}

async function updateChequeStatusExclusive(
  transactionId: string,
  status: Exclude<ChequeStatus, 'pending'>,
  clearingDate: string,
  commerce: CommerceData,
): Promise<{ commerce: CommerceData; accounting: AccountingData }> {
  const persisted = await loadCommerceData();
  const activeCommerce = persisted.cashTransactions.some((t) => t.id === transactionId)
    ? persisted
    : commerce;
  const tx = activeCommerce.cashTransactions.find((t) => t.id === transactionId);
  if (!tx || tx.method !== 'cheque' || tx.chequeStatus !== 'pending') {
    // idempotent: اگر همین وضعیت از قبل اعمال شده
    if (tx && tx.method === 'cheque' && tx.chequeStatus === status) {
      return { commerce: activeCommerce, accounting: await loadAccountingData() };
    }
    throw new Error('چک در وضعیت انتظار یافت نشد.');
  }

  let accounting = await loadAccountingData();
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(clearingDate)) {
    throw new Error('تاریخ عملیات چک باید شمسی و معتبر باشد.');
  }
  const clearingPeriod = accounting.fiscalPeriods.find(
    (p) => p.status === 'open' && clearingDate >= p.startDate && clearingDate <= p.endDate,
  );
  if (!clearingPeriod) {
    throw new Error('برای تاریخ عملیات چک، سال مالی باز و معتبر پیدا نشد.');
  }

  const sourceDocSuffix =
    status === 'cleared' ? 'clear' : status === 'bounced' ? 'bounce' : 'void';
  const sourceDocumentId = `${tx.id}:${sourceDocSuffix}`;

  const operation = await beginCommerceOperation({
    id: `cheque:${tx.id}:${status}`,
    kind: 'cheque-status',
    transactionId: tx.id,
    inputSnapshot: { transactionId: tx.id, status, clearingDate },
  });

  try {
    let entry: JournalEntry;
    let nextStatus: ChequeStatus = status;
    let clearAllocations = false;

    if (status === 'cleared') {
      if (
        tx.type === 'receipt' &&
        (activeCommerce.chequeEndorsements || []).some((e) => e.transactionId === tx.id)
      ) {
        throw new Error(
          'این چک ظهرنویسی و واگذار شده است؛ وصول آن در حساب بانکی شرکت مجاز نیست.',
        );
      }
      requireAccount(accounting, tx.cashAccountId, 'صندوق/بانک');
      if (tx.type === 'payment' && !accounting.settings.allowChequeClearWithNegativeCash) {
        const bal = accounting.journalEntries
          .filter((j) => j.status === 'posted')
          .flatMap((j) => j.lines)
          .filter((l) => l.accountId === tx.cashAccountId)
          .reduce((s, l) => s + l.debitRial - l.creditRial, 0);
        if (bal < tx.amountRial) {
          throw new Error(
            'موجودی حساب بانک/صندوق برای پاس این چک کافی نیست. در تنظیمات حسابداری می‌توانید «پاس چک با موجودی منفی» را فعال کنید.',
          );
        }
      }
      const chequeAccount =
        tx.type === 'receipt' ? 'det-cheques-receivable' : 'det-cheques-payable';
      const lines =
        tx.type === 'receipt'
          ? [
              journalLine(tx.cashAccountId, 'وصول چک دریافتی', tx.amountRial, 0),
              journalLine(chequeAccount, 'خروج از اسناد دریافتنی', 0, tx.amountRial),
            ]
          : [
              journalLine(chequeAccount, 'تسویه چک پرداختنی', tx.amountRial, 0),
              journalLine(tx.cashAccountId, 'پرداخت از بانک بابت چک', 0, tx.amountRial),
            ];
      entry = journalBase(
        sourceDocumentId,
        tx.type === 'receipt' ? 'RC' : 'PC',
        clearingPeriod.id,
        clearingDate,
        `تسویه چک ${tx.chequeNumber}`,
        tx.type,
        lines,
      );
    } else if (status === 'bounced') {
      const chequeAccount =
        tx.type === 'receipt' ? 'det-cheques-receivable' : 'det-cheques-payable';
      const partyAccount = tx.type === 'receipt' ? 'det-customers' : 'det-suppliers';
      requireAccount(accounting, chequeAccount, 'اسناد چک');
      requireAccount(accounting, partyAccount, 'حساب اشخاص');
      const endorsements = (activeCommerce.chequeEndorsements || []).filter(
        (e) => e.transactionId === tx.id,
      );
      const endorsedTotal = endorsements.reduce((sum, e) => sum + e.amountRial, 0);
      const lines =
        tx.type === 'receipt'
          ? [
              journalLine(
                partyAccount,
                'برگشت چک دریافتی از مشتری',
                tx.amountRial,
                0,
                tx.partyId,
              ),
              ...endorsements.map((e) =>
                journalLine(
                  'det-suppliers',
                  'بازگشت بدهی تأمین‌کننده بابت بخش واگذارشده چک برگشتی',
                  0,
                  e.amountRial,
                  e.toPartyId,
                ),
              ),
              ...(tx.amountRial > endorsedTotal
                ? [
                    journalLine(
                      chequeAccount,
                      'حذف مانده واگذارنشده چک برگشتی از اسناد دریافتنی',
                      0,
                      tx.amountRial - endorsedTotal,
                    ),
                  ]
                : []),
            ]
          : [
              journalLine(chequeAccount, 'ابطال چک پرداختی برگشتی', tx.amountRial, 0),
              journalLine(
                partyAccount,
                'بازگشت بدهی تأمین‌کننده',
                0,
                tx.amountRial,
                tx.partyId,
              ),
            ];
      entry = journalBase(
        sourceDocumentId,
        tx.type === 'receipt' ? 'RB' : 'PB',
        clearingPeriod.id,
        clearingDate,
        `برگشت چک ${tx.chequeNumber}`,
        tx.type,
        lines,
      );
      clearAllocations = true;
    } else {
      // void
      const original = accounting.journalEntries.find(
        (j) => j.id === tx.journalEntryId && j.status === 'posted',
      );
      if (!original) {
        throw new Error('سند اولیه چک پیدا نشد؛ ابطال بدون سند معکوس مجاز نیست.');
      }
      const endorsements = (activeCommerce.chequeEndorsements || []).filter(
        (e) => e.transactionId === tx.id,
      );
      const reverseLines = original.lines.map((l) =>
        journalLine(
          l.accountId,
          `ابطال چک ${tx.chequeNumber || tx.number}`,
          l.creditRial,
          l.debitRial,
          l.partyId,
        ),
      );
      for (const endorsement of endorsements) {
        const endorsementJournal = accounting.journalEntries.find(
          (j) => j.id === endorsement.journalEntryId && j.status === 'posted',
        );
        if (!endorsementJournal) {
          throw new Error(
            'یکی از اسناد ظهرنویسی پیدا نشد؛ ابطال بدون اسناد معکوس کامل مجاز نیست.',
          );
        }
        reverseLines.push(
          ...endorsementJournal.lines.map((l) =>
            journalLine(
              l.accountId,
              `ابطال ظهرنویسی چک ${tx.chequeNumber || tx.number}`,
              l.creditRial,
              l.debitRial,
              l.partyId,
            ),
          ),
        );
      }
      entry = journalBase(
        sourceDocumentId,
        tx.type === 'receipt' ? 'RV' : 'PV',
        clearingPeriod.id,
        clearingDate,
        `ابطال چک ${tx.chequeNumber || tx.number}`,
        'manual',
        reverseLines,
      );
      nextStatus = 'void';
      clearAllocations = true;
    }

    const prepared = preparePostedJournal(accounting, entry);
    const journalId = prepared.journalId;
    const nextCommerce = {
      ...activeCommerce,
      cashTransactions: activeCommerce.cashTransactions.map((t) =>
        t.id === tx.id
          ? {
              ...t,
              chequeStatus: nextStatus,
              clearingJournalEntryId: journalId,
              ...(clearAllocations ? { allocations: [] as InvoiceAllocation[] } : {}),
            }
          : t,
      ),
    };

    await commitFinancialDomains({
      accounting: prepared.accounting,
      commerce: nextCommerce,
      completedOperation: operation,
    });

    return { commerce: nextCommerce, accounting: prepared.accounting };
  } catch (error) {
    await writePendingCommerceOperation({
      ...operation,
      lastError: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    throw error;
  }
}

export function partyBalance(partyId: string, commerce: CommerceData): number {
  const sales=commerce.invoices.filter(i=>i.status==='posted'&&i.type==='sale'&&i.partyId===partyId).reduce((s,i)=>s+i.grossRial,0);
  const purchases=commerce.invoices.filter(i=>i.status==='posted'&&i.type==='purchase'&&i.partyId===partyId).reduce((s,i)=>s+i.grossRial,0);
  const salesReturns=commerce.invoices.filter(i=>i.status==='posted'&&i.type==='return-sale'&&i.partyId===partyId).reduce((s,i)=>s+i.grossRial,0);
  const purchaseReturns=commerce.invoices.filter(i=>i.status==='posted'&&i.type==='return-purchase'&&i.partyId===partyId).reduce((s,i)=>s+i.grossRial,0);
  const receipts=commerce.cashTransactions.filter(t=>t.type==='receipt'&&t.partyId===partyId&&(!t.chequeStatus||t.chequeStatus==='pending'||t.chequeStatus==='cleared')).reduce((s,t)=>s+t.amountRial,0);
  const payments=commerce.cashTransactions.filter(t=>t.type==='payment'&&t.partyId===partyId&&(!t.chequeStatus||t.chequeStatus==='pending'||t.chequeStatus==='cleared')).reduce((s,t)=>s+t.amountRial,0);
  // ظهرنویسی فقط بدهی تأمین‌کنندهٔ ذی‌نفع (toPartyId) را کم می‌کند.
  // فرمول یکپارچه: مثبت = مطالبه از طرف حساب → کاهش بدهی تأمین‌کننده با +endorsed.
  // مشتریِ صادرکنندهٔ چک در toPartyId نیست؛ برای type=customer هرگز endorsed اعمال نمی‌شود
  // تا علامت مانده مشتری به‌اشتباه بالا نرود.
  const party = commerce.parties.find(p => p.id === partyId);
  const acceptsEndorsement = party?.type === 'supplier' || party?.type === 'both';
  const endorsed = acceptsEndorsement
    ? (commerce.chequeEndorsements || [])
        .filter((e) => {
          if (e.toPartyId !== partyId) return false;
          const t = commerce.cashTransactions.find((x) => x.id === e.transactionId);
          // فقط چک دریافتیِ فعال که ظهرنویسی شده
          return (
            !!t &&
            t.method === 'cheque' &&
            t.type === 'receipt' &&
            (!t.chequeStatus || t.chequeStatus === 'pending' || t.chequeStatus === 'cleared')
          );
        })
        .reduce((sum, e) => sum + e.amountRial, 0)
    : 0;
  return sales - purchases - salesReturns + purchaseReturns - receipts + payments + endorsed;
}


/**
 * هم‌ترازی موجودی کارت کالا با آخرین afterQtyMilli گردش بهای تمام‌شده.
 * منبع حقیقت مالی: costing.movements — کارت کالا مسیر نمایشی/عملیاتی است.
 * پس از بازیابی عملیات یا تشخیص ناهمگامی فراخوانی شود.
 */
export async function reconcileProductStockFromCosting(
  productIds?: string[],
): Promise<{ updated: number; productIds: string[] }> {
  // منبع حقیقت: costing.balances — از طریق inventory-truth
  return syncProductCardsFromCostingTruth(productIds);
}

export async function runFinancialIntegrityOnBoot(): Promise<{
  recovery: { status: 'none' | 'recovered' | 'blocked'; message?: string };
  stockReconciled: number;
  integrityOk: boolean;
  integrityErrors: number;
}> {
  const recovery = await recoverPendingCommerceOperation();
  let stockReconciled = 0;
  try {
    const result = await reconcileProductStockFromCosting();
    stockReconciled = result.updated;
  } catch (error) {
    console.warn('[Anbarin] boot stock reconcile failed', error);
  }
  let integrityOk = true;
  let integrityErrors = 0;
  try {
    const { runFinancialIntegrityCheck } = await import('./financial-integrity-check');
    const report = await runFinancialIntegrityCheck();
    integrityOk = report.ok;
    integrityErrors = report.findings.filter((f) => f.severity === 'error').length;
    for (const f of report.findings) {
      if (f.severity === 'error') console.error('[Anbarin][integrity]', f.code, f.message);
      else if (f.severity === 'warn') console.warn('[Anbarin][integrity]', f.code, f.message);
    }
  } catch (error) {
    console.warn('[Anbarin] integrity check failed', error);
  }
  return { recovery, stockReconciled, integrityOk, integrityErrors };
}

