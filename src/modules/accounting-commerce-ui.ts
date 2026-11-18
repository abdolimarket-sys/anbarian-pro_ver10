/** رابط فاکتورها و دریافت/پرداخت */
import { loadAccountingData, parseMoneyToRial, formatMoneyFromRial, resolveActiveFiscalPeriod } from './accounting';
import { buildChequePanelHtml } from './commerce-ui-cheques';
import {
  fa as sharedFa,
  esc as sharedEsc,
  digits as sharedDigits,
  el as sharedEl,
  makeMoney,
  invoiceRoots as sharedInvoiceRoots,
  qInInvoiceRoots,
  qAllInInvoiceRoots,
  invoiceTypeTitle as sharedInvoiceTypeTitle,
  invoicePaymentTermsLabel,
} from './commerce-ui-shared';
import {
  loadCommerceData, saveCommerceData, buildInvoice, updateDraftInvoice, postInvoice,
  createCashTransaction, ensureCommerceAccounts, updateChequeStatus, invoiceOutstanding,
  upsertParty, recordOperatingEntry, listOperatingEntries, postInventoryNrvWriteDown,
  assertDefaultPartyAllowed, DEFAULT_CUSTOMER_PARTY_ID, DEFAULT_SUPPLIER_PARTY_ID,
  type CommerceData, type AccountingParty, type InvoiceType, type InvoicePaymentPart, isSaleInvoiceType, isPurchaseInvoiceType,
} from './commerce-api';
import { toast, confirmAction } from './ui';
import { printHtmlSafely, shareFileContent, downloadFile } from '@/utils/helpers';
import { openProductModal, offerAddProduct } from './products-ui';
import { enhanceSelectWithSearch, refreshSearchableSelect, normalizeSearchText } from './searchable-select';
import { openSmsComposeDialog } from './sms';
import { choosePaperSize } from './print-paper';
import { enhanceDateFields, attachJalaliCalendar, todayJalali as sharedTodayJalali } from './date-picker';
import { products, logAudit, findProductByCode, settings } from './state';
import { openScanner, beginInvoiceScan } from './scanner';
import { loadInventoryCostData, saveInventoryCostData, setOpeningStockCost, getCostBalance, buildNrvAnalysis, buildPurchaseStandardVariance, type InventoryCostData } from './inventory-costing';
import { warehouseName } from './warehouse-stock';
import { buildInventoryReconciliation } from './inventory-reconciliation';
import {
  createInternalTransfer, getBankAccountBalances, importBankStatement, loadBankReconciliation, parseBankStatementCsv,
  createCashBankMove, createBankFee, getBankAccountLedger, getBankReconciliationSummary,
} from './accounting-bank';
import { extendChequeDueDate, getChequeDashboard, loadChequeBook, recordChequeEvent, replaceChequeDetails } from './accounting-cheques';
import { endorseCheque, getChequeEndorsement, getChequeEndorsements, getChequeEndorsementRemaining } from './commerce-api';
import { loadChequeChain, getChainAvailable, transferEndorsedCheque } from './accounting-cheque-chain';
import { getChequeOutcomeReport, getOutcomeAvailable, loadChequeOutcomes, recordChequeHolderOutcome } from './accounting-cheque-outcomes';
import { getAgingDashboard, type AgingBucket } from './accounting-aging';
import { getCashflowDashboard } from './accounting-cashflow';
import { getProfitabilityDashboard, getExpenseAdjustedProfitability, getProfitabilityPeriodComparison, getMonthlyProfitabilityTrend, buildInventoryMarginAnalytics, type ProfitabilityFilter } from './accounting-profitability';
import { exportProfitabilityXlsx, printProfitabilityPdf } from './accounting-profitability-export';
import { exportManagementDashboardXlsx, printManagementDashboardPdf } from './management-dashboard-export';
import { exportManagementMonthXlsx, printManagementMonthPdf } from './management-month-export';
import { detectManagementMonthAnomalies, type ManagementMonthRow } from './management-anomaly';
import { refreshCommerceFiscalCache, getCommerceFiscalPeriods, getCommercePeriodOptions } from './commerce-ui-fiscal-cache';
import { invoiceLineEnteredQty, invoiceLineUnitFactor, invoiceLineBaseQty, suggestedProductDiscountRial } from './commerce-ui-invoice-math';
import { buildThermalInvoiceHtml, buildInvoiceDocumentHtml, applyInvoicePaperLayout } from './commerce-ui-print';
import { buildPartiesPanelHtml, buildPartyOptions, bindPartySmsButtons as bindPartySmsButtonsModule } from './commerce-ui-parties';
import { buildCommercePanelShellHtml, buildCommercePanelEmptyHtml, buildInvoiceTypeSheetHtml, commercePanelSectionKey, type CommercePanelSection } from './commerce-ui-panel-render';
import { buildSafeStackedPanels, revealSection } from './commerce-ui-inventory';
import { createCommerceSheet, moveSectionIntoMount, scrollSheetToTop } from './commerce-ui-sheet';
import { buildCashEntryPanelHtml } from './commerce-ui-cash';
import { buildOperatingPanelHtml } from './commerce-ui-operating';
import { buildBankPanelHtml } from './commerce-ui-bank';
import { buildInvoiceSectionHtml, buildInvoiceTaxDetailsHtml, buildInvoiceLandedCostsHtml, buildInvoiceInternalProfitPanelHtml } from './commerce-ui-invoice';
import { buildCommerceHomeHtml, buildCommerceSectionShellsHtml, setCommerceSectionVisibility } from './commerce-ui-workspace';
import { installCommerceCoreDelegation, setCoreClickHandler, setCoreAttrHandler, setCoreChangeHandler, setCoreInputHandler } from './commerce-ui-core-delegation';
import { bindInvoiceProductSearch as bindInvoiceProductSearchCore } from './commerce-ui-invoice-search';
import { limitTableRowItems, joinRowsOrEmpty } from './commerce-ui-table';
import { registerCommerceSectionLoader, loadCommerceSectionHtml } from './commerce-ui-section-content';
import { emitCommerceEvent } from './commerce-events';
import { bindCommercePanelActions, bindCashTransactionActions, bindChequeManagementActions, bindBankManagementActions } from './commerce-ui-actions';
import type { CommercialInvoice } from './commerce-api';

let commerce: CommerceData | null = null;
let costingCache: InventoryCostData | null = null;
let editingInvoiceId: string | null = null;
let lastPrintableInvoiceId: string | null = null;
let profitabilityFilter:ProfitabilityFilter={};
let managementFilter:ProfitabilityFilter={};
let currency: 'rial'|'toman' = 'toman';
type CommerceSection = 'home'|'sale'|'purchase'|'receipts'|'cheques'|'aging'|'banking'|'management'|'inventory'|'parties'|'operating';
let activeCommerceSection: CommerceSection = 'home';
let activeInvoiceType: InvoiceType = 'sale';
let editingPartyId: string | null = null;
let suppressCommerceSheetReopen = false;
let saveInvoiceDraftHandler: ((quiet?:boolean)=>Promise<string|null>) | null = null;
const invoiceTypeTitle=sharedInvoiceTypeTitle;

let fiscalCacheListenerBound=false;
const fa=sharedFa;
const esc=sharedEsc;
const digits=sharedDigits;
const el=sharedEl;
const invoiceRoots=sharedInvoiceRoots;
const q=qInInvoiceRoots;
const qAll=qAllInInvoiceRoots;
const id=(p:string)=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
function money(rial:number):string { return makeMoney(currency)(rial); }

async function applyDefaultPartySelection(): Promise<void> {
  const partySel = el<HTMLSelectElement>('#invoiceParty');
  if (!partySel || partySel.value || editingInvoiceId) return;
  try {
    const acc = await loadAccountingData();
    const sale = isSaleInvoiceType(activeInvoiceType);
    if (sale && acc.settings.allowDefaultCustomerSales !== false) {
      if ([...partySel.options].some(o => o.value === DEFAULT_CUSTOMER_PARTY_ID)) {
        partySel.value = DEFAULT_CUSTOMER_PARTY_ID;
        refreshSearchableSelect(partySel);
      }
    } else if (!sale && acc.settings.allowDefaultSupplierPurchases !== false) {
      if ([...partySel.options].some(o => o.value === DEFAULT_SUPPLIER_PARTY_ID)) {
        partySel.value = DEFAULT_SUPPLIER_PARTY_ID;
        refreshSearchableSelect(partySel);
      }
    }
  } catch (e) { console.error('[Anbarin] ignored error', e); }
}

function partyOptions(type?:'customer'|'supplier'):string {
  return buildPartyOptions(commerce?.parties || [], type, esc);
}
function bindPartySmsButtons(root: ParentNode = document): void {
  bindPartySmsButtonsModule(root, commerce?.parties || [], openSmsComposeDialog);
}

function partiesPanelHtml():string { return buildPartiesPanelHtml(commerce?.parties || [], editingPartyId, esc); }
function collectPartyForm():Omit<AccountingParty,'id'|'createdAt'|'updatedAt'> & {id?:string} {
  const idVal=el<HTMLInputElement>('#partyEditId')?.value.trim()||undefined;
  return {
    id:idVal||undefined,
    name:(el<HTMLInputElement>('#partyName')?.value||'').trim(),
    type:(el<HTMLSelectElement>('#partyType')?.value||'customer') as AccountingParty['type'],
    phone:(el<HTMLInputElement>('#partyPhone')?.value||'').trim(),
    nationalId:digits((el<HTMLInputElement>('#partyNationalId')?.value||'').trim()),
    economicCode:(el<HTMLInputElement>('#partyEconomicCode')?.value||'').trim(),
    registrationNumber:(el<HTMLInputElement>('#partyRegistrationNumber')?.value||'').trim(),
    postalCode:digits((el<HTMLInputElement>('#partyPostalCode')?.value||'').trim()),
    address:(el<HTMLTextAreaElement>('#partyAddress')?.value||'').trim(),
    isActive:(el<HTMLSelectElement>('#partyIsActive')?.value||'1')==='1',
  };
}
async function savePartyFromForm(selectInInvoice=false):Promise<AccountingParty|null> {
  if(!commerce)return null;
  try{
    const input=collectPartyForm();
    const beforeIds=new Set(commerce.parties.map(p=>p.id));
    const next=upsertParty(commerce,input);
    const saved=input.id
      ? next.parties.find(p=>p.id===input.id)
      : next.parties.find(p=>!beforeIds.has(p.id))||next.parties.find(p=>p.name===input.name);
    if(!saved)throw new Error('ثبت طرف حساب ناموفق بود.');
    await saveCommerceData(next);
    commerce=next;
    editingPartyId=null;
    logAudit('party_upsert',{partyId:saved.id,name:input.name,type:input.type});
    toast(input.id?'طرف حساب به‌روزرسانی شد.':'شخص جدید ثبت شد.','success');
    if(selectInInvoice){
      const sel=el<HTMLSelectElement>('#invoiceParty');
      if(sel){
        sel.innerHTML='<option value="">انتخاب</option>'+partyOptions(isSaleInvoiceType(activeInvoiceType)?'customer':'supplier');
        sel.value=saved.id;
        refreshSearchableSelect(sel);
      }
      const cashSel=el<HTMLSelectElement>('#cashParty');
      if(cashSel){
        const t=el<HTMLSelectElement>('#cashType')?.value;
        cashSel.innerHTML='<option value="">انتخاب</option>'+partyOptions(t==='payment'?'supplier':'customer');
        cashSel.value=saved.id;
        refreshSearchableSelect(cashSel);
      }
    }
    return saved;
  }catch(e){
    toast(e instanceof Error?e.message:'خطا در ثبت طرف حساب','error');
    return null;
  }
}
function openPartyFormSheet(opts?:{preferType?:'customer'|'supplier'|'both'; selectAfterSave?:boolean; prefillName?:string}):void {
  document.getElementById('partyFormSheet')?.remove();
  const prefer=opts?.preferType||(isSaleInvoiceType(activeInvoiceType)?'customer':'supplier');
  // شناسه‌ای که از دکمه ویرایش آمده باید تا ساخت فرم حفظ شود.
  const editingNow=!!editingPartyId && (commerce?.parties||[]).some(p=>p.id===editingPartyId);
  if(!editingNow) editingPartyId=null;
  const overlay=document.createElement('div');
  overlay.id='partyFormSheet';
  overlay.dir='rtl';
  overlay.style.cssText='position:fixed;inset:0;z-index:10120;background:var(--surface,#fff);color:var(--text,#222);overflow:auto;padding:clamp(12px,3vw,28px)';
  overlay.innerHTML=`<div style="max-width:900px;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px"><h2 style="margin:0">${editingNow?'ویرایش طرف حساب':'تعریف شخص جدید'}</h2><button type="button" class="btn btn-secondary" id="partySheetClose">بستن</button></div>${partiesPanelHtml()}</div>`;
  document.body.appendChild(overlay);
  const typeSel=overlay.querySelector<HTMLSelectElement>('#partyType');
  if(typeSel&&!editingPartyId)typeSel.value=prefer;
  if(opts?.prefillName){const n=overlay.querySelector<HTMLInputElement>('#partyName');if(n)n.value=opts.prefillName;}
  const close=(clearEdit=true)=>{overlay.remove();if(clearEdit)editingPartyId=null;};
  overlay.querySelector('#partySheetClose')?.addEventListener('click',()=>close(true));
  overlay.querySelector('#partySaveBtn')?.addEventListener('click',async()=>{
    const saved=await savePartyFromForm(!!opts?.selectAfterSave);
    if(saved){close(true);await render();}
  });
  overlay.querySelector('#partyResetBtn')?.addEventListener('click',()=>{editingPartyId=null;close(true);openPartyFormSheet(opts);});
  bindPartySmsButtons(overlay);
overlay.querySelectorAll<HTMLButtonElement>('[data-edit-party]').forEach(btn=>btn.addEventListener('click',()=>{
    editingPartyId=btn.dataset.editParty||null;
    close(false);
    openPartyFormSheet({preferType:prefer,selectAfterSave:opts?.selectAfterSave});
  }));
}
function periodOptions():string { return getCommercePeriodOptions(); }
async function activeFiscalPeriodId():Promise<string> {
  const d=await loadAccountingData();
  return resolveActiveFiscalPeriod(d).id;
}
function accountOptions():string {
  return accountOptionsCache;
}
let accountOptionsCache='';
async function operatingPanelHtml():Promise<string>{
  const acc=await loadAccountingData();
  const expenseOpts=acc.accounts.filter(a=>a.isActive&&a.level==='detail'&&a.code.startsWith('6'))
    .map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('');
  const incomeOpts=acc.accounts.filter(a=>a.isActive&&a.level==='detail'&&a.code.startsWith('4'))
    .map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('');
  const cashOpts=acc.accounts.filter(a=>a.isActive&&a.level==='detail'&&(a.code.startsWith('1101')||a.id==='det-cash'||a.id==='det-bank'||/صندوق|بانک|تنخواه/.test(a.title)))
    .map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('')||accountOptionsCache;
  const periodOpts=periodOptions()||acc.fiscalPeriods.filter(p=>p.status==='open').map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
  const recent=listOperatingEntries(acc,undefined,40);
  const recentRows=recent.map(x=>`<tr><td>${esc(x.date)}</td><td>${x.kind==='expense'?'هزینه':'درآمد'}</td><td>${esc(x.number)}</td><td>${esc(x.accountCode)} ${esc(x.accountTitle)}</td><td>${esc(x.description)}</td><td>${money(x.amountRial)}</td></tr>`).join('')
    ||'<tr><td colspan="6">هنوز هزینه یا درآمدی از این بخش ثبت نشده است.</td></tr>';
  return buildOperatingPanelHtml({
    currencyLabel: currency === 'toman' ? 'تومان' : 'ریال',
    todayJalali: todayJalali(),
    expenseOptsHtml: expenseOpts,
    incomeOptsHtml: incomeOpts,
    cashOptsHtml: cashOpts,
    periodOptsHtml: periodOpts,
    partyOptsHtml: partyOptions(),
    recentRowsHtml: recentRows,
  });
}
function normalizeJalaliDate(raw:string):string {
  const d=digits((raw||'').trim()).replace(/-/g,'/').replace(/\./g,'/');
  const m=d.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if(!m) return '';
  return `${m[1]}/${m[2].padStart(2,'0')}/${m[3].padStart(2,'0')}`;
}
async function invoicePeriodForDate(date:string):Promise<string> {
  const d=normalizeJalaliDate(date);
  if(!d) throw new Error('تاریخ فاکتور باید به شکل سال/ماه/روز شمسی باشد (مثال: 1405/08/16).');
  // در اولین اجرا یا قبل از باز شدن پنل حسابداری، کش ممکن است خالی باشد
  if(!getCommerceFiscalPeriods().length){
    await refreshFiscalCache();
  }
  const norm=(s:string)=>normalizeJalaliDate(s)||s;
  const exact=getCommerceFiscalPeriods().find(p=>p.status==='open'&&d>=norm(p.startDate)&&d<=norm(p.endDate));
  if(exact) return exact.id;
  const ranges=getCommerceFiscalPeriods().map(p=>`${p.startDate} تا ${p.endDate} (${p.status==='open'?'باز':'بسته'})`);
  throw new Error(ranges.length
    ? `برای تاریخ ${d} هیچ دوره مالی بازی وجود ندارد. دوره‌های تعریف‌شده: ${ranges.join('، ')}. تاریخ فاکتور یا وضعیت دوره مالی را بررسی کنید.`
    : 'هیچ دوره مالی‌ای تعریف نشده است. ابتدا از بخش حسابداری دوره مالی مناسب را ایجاد و باز کنید.');
}
async function refreshFiscalCache():Promise<void>{
  await refreshCommerceFiscalCache();
  const acc=await loadAccountingData();
  accountOptionsCache=acc.accounts.filter(a=>a.isActive&&a.level==='detail'&&['det-cash','det-bank'].includes(a.id))
    .map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('');
}
function bindFiscalCacheRefresh():void{
  if(fiscalCacheListenerBound)return;
  fiscalCacheListenerBound=true;
  window.addEventListener('accounting:data-updated',()=>{
    void refreshFiscalCache().then(()=>{
      const select=el<HTMLSelectElement>('#opPeriod');
      if(!select)return;
      const previous=select.value;
      select.innerHTML=periodOptions()||'<option value="">سال مالی باز تعریف نشده</option>';
      const periods=getCommerceFiscalPeriods();
      if(periods.some(p=>p.id===previous&&p.status==='open'))select.value=previous;
      else select.value=periods.find(p=>p.status==='open')?.id||'';
    });
  });
}
function todayJalali():string {
  const parts=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  return `${parts.find(x=>x.type==='year')?.value}/${parts.find(x=>x.type==='month')?.value}/${parts.find(x=>x.type==='day')?.value}`;
}
function nextInvoiceNumber(type:InvoiceType):string {
  const prefix=type==='sale'?'S':type==='purchase'?'P':type==='return-sale'?'RS':type==='return-purchase'?'RP':'PF';
  const numbers=(commerce?.invoices||[]).filter(i=>i.type===type).map(i=>{const m=i.number.match(new RegExp(`^${prefix}-(\\d+)$`));return m?Number(m[1]):0;});
  return `${prefix}-${String(Math.max(0,...numbers)+1).padStart(6,'0')}`;
}
const INVOICE_LIST_LIMIT = 8;
function invoiceRows(type:InvoiceType):string {
  const all=(commerce?.invoices||[]).filter(i=>i.type===type).slice().reverse();
  const list=all.slice(0,INVOICE_LIST_LIMIT);
  if(!list.length) return '<tr><td colspan="6" class="invoice-list-empty">برای این بخش هنوز فاکتوری ثبت نشده است.</td></tr>';
  return list.map(i=>{
    const p=commerce?.parties.find(x=>x.id===i.partyId);
    const status=i.status==='posted'?'قطعی':'پیش‌نویس';
    const statusCls=i.status==='posted'?'is-posted':'is-draft';
    const outstanding=i.status==='posted'&&commerce?invoiceOutstanding(i.id,commerce):0;
    const actions=i.status==='draft'
      ?`<button class="btn btn-sm btn-secondary" data-edit-invoice="${i.id}">ویرایش</button>${i.type==='proforma'?'':'<button class="btn btn-sm btn-primary" data-post-invoice="'+i.id+'">تسویه</button>'}`
      : (i.status==='posted'&&outstanding>0&&i.type!=='proforma'
        ?`<button class="btn btn-sm btn-primary" data-post-invoice="${i.id}">تسویه مانده (${money(outstanding)})</button>`
        :'');
    return `<tr class="invoice-list-row">
      <td><b>${esc(i.number)}</b></td>
      <td class="invoice-list-party">${esc(p?.name||'—')}</td>
      <td>${esc(i.date)}</td>
      <td class="invoice-list-amount">${money(i.grossRial)}</td>
      <td><span class="invoice-status-pill ${statusCls}">${status}</span></td>
      <td class="invoice-list-actions">
        <button class="btn btn-sm btn-secondary" data-print-invoice="${i.id}">چاپ</button>
        <button class="btn btn-sm btn-secondary" data-share-invoice="${i.id}">اشتراک</button>
        ${actions}
      </td>
    </tr>`;
  }).join('');
}
function invoiceListFooter(type:InvoiceType):string {
  const total=(commerce?.invoices||[]).filter(i=>i.type===type).length;
  if(total<=INVOICE_LIST_LIMIT) return total?`<p class="invoice-list-hint">${total} فاکتور</p>`:'';
  return `<p class="invoice-list-hint">نمایش ${INVOICE_LIST_LIMIT} مورد اخیر از ${total} فاکتور</p>`;
}
function cashRows():string {
  return (commerce?.cashTransactions||[]).slice().reverse().map(t=>{const p=commerce?.parties.find(x=>x.id===t.partyId);const method=t.method==='cheque'?'چک':t.method==='bank'?'بانک':t.method==='card'?'کارت‌خوان':t.method==='transfer'?'حواله':'نقد';const status=t.chequeStatus==='pending'?'در انتظار وصول':t.chequeStatus==='cleared'?'وصول/تسویه‌شده':t.chequeStatus==='bounced'?'برگشتی':t.chequeStatus==='void'?'باطل':'قطعی';const endorsed=!!getChequeEndorsement(t.id,commerce!);const actions=t.chequeStatus==='pending'?`${endorsed?'چک ظهرنویسی شده؛ ':''}${!endorsed?`<button class="btn btn-sm btn-secondary" data-cheque-clear="${t.id}">وصول/تسویه</button> `:''}<button class="btn btn-sm btn-secondary" data-cheque-bounce="${t.id}">برگشتی</button>`:'—';return `<tr><td>${esc(t.number)}</td><td>${t.type==='receipt'?'دریافت':'پرداخت'} (${method})</td><td>${esc(p?.name||'—')}</td><td>${esc(t.date)}</td><td>${money(t.amountRial)}</td><td>${status}${t.chequeNumber?`<br>چک ${esc(t.chequeNumber)} · ${esc(t.chequeDueDate||'')}`:''}</td><td>${actions}</td></tr>`}).join('')||'<tr><td colspan="7">هنوز دریافت یا پرداختی ثبت نشده است.</td></tr>';
}
function addInvoicePaymentRow(part?:InvoicePaymentPart):void {
 const host=el<HTMLDivElement>('#invoicePaymentRows');if(!host)return;
 const row=document.createElement('div');row.className='form-grid invoice-payment-row';row.style.cssText='border:1px solid var(--border-color,#ddd);border-radius:8px;padding:10px;margin:8px 0;align-items:end';
 row.innerHTML=`<label class="field">روش پرداخت<select data-pay-method><option value="card">کارت‌خوان</option><option value="cash">نقدی</option><option value="cheque">چک</option><option value="credit">اعتباری (مانده بدهی)</option></select></label><label class="field">مبلغ (${currency==='toman'?'تومان':'ریال'})<input data-pay-amount inputmode="numeric" placeholder="مبلغ این مرحله"></label><label class="field" data-pay-cheque hidden style="display:none">شماره چک *<input data-pay-cheque-number autocomplete="off"></label><label class="field" data-pay-cheque hidden style="display:none">بانک *<input data-pay-cheque-bank autocomplete="off"></label><label class="field" data-pay-cheque hidden style="display:none">شماره صیادی *<input data-pay-cheque-account autocomplete="off" placeholder="شناسه صیادی ۱۶ یا ۲۰ رقمی" inputmode="numeric"></label><label class="field" data-pay-cheque hidden style="display:none">سررسید چک شمسی *<input data-pay-cheque-due placeholder="1405/01/30" inputmode="numeric" autocomplete="off"></label><label class="field" data-pay-cheque hidden style="display:none">توضیحات چک<input data-pay-cheque-note autocomplete="off"></label><button type="button" class="btn btn-sm btn-secondary" data-pay-remove>حذف این مرحله</button>`;
 host.appendChild(row);const method=row.querySelector<HTMLSelectElement>('[data-pay-method]')!;method.value=part?.method||'cash';row.querySelector<HTMLInputElement>('[data-pay-amount]')!.value=part?formatMoneyFromRial(part.amountRial,currency):'';row.querySelector<HTMLInputElement>('[data-pay-cheque-number]')!.value=part?.chequeNumber||'';row.querySelector<HTMLInputElement>('[data-pay-cheque-bank]')!.value=part?.chequeBank||'';row.querySelector<HTMLInputElement>('[data-pay-cheque-account]')!.value=part?.chequeAccount||'';row.querySelector<HTMLInputElement>('[data-pay-cheque-due]')!.value=part?.chequeDueDate||'';row.querySelector<HTMLInputElement>('[data-pay-cheque-note]')!.value=part?.note||'';
 const toggle=()=>{const show=method.value==='cheque';row.querySelectorAll<HTMLElement>('[data-pay-cheque]').forEach(x=>{x.hidden=!show;x.style.display=show?'':'none';});};method.addEventListener('change',toggle);toggle();row.querySelector('[data-pay-remove]')!.addEventListener('click',()=>row.remove());
}
function readInvoicePaymentParts():InvoicePaymentPart[]{return [...document.querySelectorAll<HTMLElement>('.invoice-payment-row')].map(row=>{const method=row.querySelector<HTMLSelectElement>('[data-pay-method]')!.value as InvoicePaymentPart['method'];return {method,amountRial:parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-pay-amount]')!.value||'0'),currency),...(method==='cheque'?{chequeNumber:row.querySelector<HTMLInputElement>('[data-pay-cheque-number]')!.value,chequeBank:row.querySelector<HTMLInputElement>('[data-pay-cheque-bank]')!.value,chequeAccount:row.querySelector<HTMLInputElement>('[data-pay-cheque-account]')!.value,chequeDueDate:digits(row.querySelector<HTMLInputElement>('[data-pay-cheque-due]')!.value),note:row.querySelector<HTMLInputElement>('[data-pay-cheque-note]')!.value}:{})};}).filter(x=>x.amountRial>0);}

function productOptions():string{return products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — ${esc(p.code||p.sku||p.id)} (${esc(p.warehouse||'انبار اصلی')})</option>`).join('')}
/** کالاهای دارای موجودی که هنوز ارزش‌گذاری اولیه نشده‌اند */
async function listPendingOpeningValuation():Promise<Array<{product:typeof products[0];warehouse:string;qty:number;unitHint:number;hasPrice:boolean}>>{
  const costing=await loadInventoryCostData();
  const out:Array<{product:typeof products[0];warehouse:string;qty:number;unitHint:number;hasPrice:boolean}>=[];
  const list = Array.isArray(products) ? products : [];
  for(const p of list){
    if(!p || typeof p !== 'object' || !p.id) continue;
    const qty=Number(p.systemQty)||0;
    if(qty<=0) continue;
    const warehouse=(typeof p.warehouse==='string' && p.warehouse.trim()) ? p.warehouse.trim() : 'انبار اصلی';
    if(costing.balances.some(b=>b.productId===p.id&&b.warehouse===warehouse)) continue;
    if(costing.movements.some(m=>m.productId===p.id&&m.warehouse===warehouse)) continue;
    const unitHint=Number(p.purchasePrice)||Number(p.price)||0;
    out.push({product:p,warehouse,qty,unitHint,hasPrice:unitHint>0});
  }
  return out.sort((a,b)=>String(a.product.name||'').localeCompare(String(b.product.name||''),'fa'));
}
async function openingStockPanel():Promise<string>{
  const pending=await listPendingOpeningValuation();
  const withPrice=pending.filter(x=>x.hasPrice).length;
  const withoutPrice=pending.length-withPrice;
  const unitLabel=currency==='toman'?'تومان':'ریال';
  const rows=limitTableRowItems(
    pending.map(x=>`<tr>
    <td>${esc(x.product.name)}</td>
    <td>${esc(x.product.code||x.product.sku||'—')}</td>
    <td>${esc(x.warehouse)}</td>
    <td>${fa(x.qty)}</td>
    <td>${x.hasPrice?money(parseMoneyToRial(String(x.unitHint),currency)):'<span class="hint">بدون قیمت خرید</span>'}</td>
  </tr>`),
    { limit: 80, emptyHtml: '<tr><td colspan="5">کالای در انتظار ارزش‌گذاری نیست — یا موجودی صفر است یا قبلاً ثبت شده.</td></tr>' },
  );
  return `<div class="card" style="margin-top:14px" dir="rtl">
<h3>ارزش‌گذاری موجودی اولیه</h3>
<p class="hint">برای کالاهایی که از فایل وارد شده‌اند و موجودی دارند، به‌جای ثبت یکی‌یکی می‌توانید <b>ارزش‌گذاری گروهی</b> بزنید. بهای واحد از <b>قیمت خرید</b> کالا گرفته می‌شود (اگر خالی باشد از قیمت فروش).</p>
<div class="form-grid" style="margin:10px 0">
  <div class="stat-card"><b>${fa(pending.length)}</b><span>در انتظار ارزش‌گذاری</span></div>
  <div class="stat-card"><b>${fa(withPrice)}</b><span>دارای قیمت خرید/فروش</span></div>
  <div class="stat-card"><b>${fa(withoutPrice)}</b><span>بدون قیمت (رد می‌شوند)</span></div>
</div>
<div class="form-grid">
  <label class="field">تاریخ ارزش‌گذاری شمسی<input id="openingCostDate" placeholder="1405/01/01" value="${todayJalali()}"></label>
</div>
<div class="actions" style="margin:10px 0;display:flex;flex-wrap:wrap;gap:8px">
  <button type="button" class="btn btn-primary" id="openingCostBulk">ارزش‌گذاری گروهی با قیمت خرید کالاها</button>
  <button type="button" class="btn btn-secondary" id="openingCostRefresh" title="بروزرسانی فهرست">بروزرسانی فهرست</button>
</div>
<p class="hint">فقط کالاهایی که هنوز گردش خرید/فروش حسابداری ندارند ارزش‌گذاری می‌شوند. کالاهای بدون قیمت خرید در تعریف کالا را بعداً قیمت بدهید و دوباره گروهی بزنید.</p>
<div class="table-wrap" style="max-height:280px;overflow:auto;margin-top:8px">
<table class="data-table"><thead><tr><th>کالا</th><th>کد</th><th>انبار</th><th>موجودی</th><th>بهای واحد پیشنهادی</th></tr></thead><tbody>${rows}</tbody></table>
</div>
${pending.length>80?`<p class="hint">نمایش ۸۰ مورد اول از ${fa(pending.length)} کالا</p>`:''}
<hr style="margin:16px 0;border:0;border-top:1px solid var(--border,#b9ddc2)">
<h4 style="margin:0 0 8px">ثبت تکی (اختیاری)</h4>
<div class="form-grid">
  <label class="field">کالا<select id="openingCostProduct"><option value="">انتخاب کالا</option>${productOptions()}</select></label>
  <label class="field">تعداد موجودی فعلی<input id="openingCostQty" inputmode="decimal" placeholder="از موجودی سیستم"></label>
  <label class="field">بهای واحد (${unitLabel})<input id="openingCostUnit" inputmode="numeric" placeholder="ترجیحاً قیمت خرید"></label>
</div>
<button class="btn btn-secondary" id="openingCostSave" type="button">ثبت بهای موجودی اولیه (تکی)</button>
</div>`;
}

function updateInvoiceLineNumbers(host:HTMLElement):void {
  host.querySelectorAll<HTMLElement>('.commerce-line').forEach((row,index)=>{
    const number=row.querySelector<HTMLElement>('.invoice-line-number');
    if(number) number.textContent=fa(index+1);
  });
}

function addInvoiceLine(productId?:string):void {
  const host=el<HTMLDivElement>('#commerceInvoiceLines'); if(!host)return;
  const row=document.createElement('div'); row.className='form-grid commerce-line invoice-line-card'; row.setAttribute('dir','rtl');
  row.innerHTML=`<div class="invoice-line-heading"><span class="invoice-line-number"></span><span>قلم</span></div><input type="hidden" data-line-product value=""><input type="hidden" data-line-unit-factor value="1"><div class="field invoice-line-product-name" data-line-product-label hidden><span class="invoice-product-badge">کالای انبار</span> <strong data-line-product-title></strong></div><label class="field">شرح ردیف فاکتور<input data-line-desc placeholder="مثلاً اجرت نصب، مشاوره یا نام کالا"></label><label class="field">واحد اندازه‌گیری<input data-line-unit value="عدد" list="anbarin-invoice-unit-list" placeholder="عدد، کیلوگرم، کارتن..." autocomplete="off"></label><label class="field invoice-unit-mode-field" data-line-unit-mode-wrap hidden>ورود تعداد بر حسب<select data-line-unit-mode><option value="base">واحد پایه</option><option value="pack">واحد بسته</option></select></label><label class="field invoice-stock-field">موجودی فعلی<output data-line-stock class="invoice-line-stock">—</output></label><label class="field">تعداد<input data-line-qty data-recalc inputmode="decimal" value="1"></label><p class="hint" data-line-unit-hint hidden style="grid-column:1/-1;margin:0"></p><label class="field">قیمت واحد / مصرف‌کننده (${currency==='toman'?'تومان':'ریال'})<input data-line-price data-recalc inputmode="numeric" placeholder="۰"></label><label class="field">تخفیف (${currency==='toman'?'تومان':'ریال'})<input data-line-discount data-recalc inputmode="numeric" value="0"></label><label class="field invoice-line-total-field">مبلغ بعد از تخفیف<input data-line-total readonly value="۰"></label><div class="invoice-internal-profit" data-line-profit-box hidden><span>بهای: <b data-line-cogs>—</b></span><span>سود: <b data-line-gross-profit>—</b></span><span>حاشیه: <b data-line-margin>—</b></span></div><button type="button" class="btn btn-sm btn-secondary invoice-line-remove" data-remove-line>حذف ردیف</button>`;
  const productInput=row.querySelector<HTMLInputElement>('[data-line-product]')!;
  productInput.value=productId||'';
  const descField=row.querySelector<HTMLInputElement>('[data-line-desc]')!;
  const descLabel=descField.closest('label') as HTMLElement|null;
  const unitField=row.querySelector<HTMLInputElement>('[data-line-unit]')!;
  const stockOut=row.querySelector<HTMLOutputElement>('[data-line-stock]');
  const stockField=row.querySelector<HTMLElement>('.invoice-stock-field');
  const productLabel=row.querySelector<HTMLElement>('[data-line-product-label]');
  const productTitle=row.querySelector<HTMLElement>('[data-line-product-title]');
  const factorInput=row.querySelector<HTMLInputElement>('[data-line-unit-factor]')!;
  const modeWrap=row.querySelector<HTMLElement>('[data-line-unit-mode-wrap]');
  const modeSelect=row.querySelector<HTMLSelectElement>('[data-line-unit-mode]');
  const unitHint=row.querySelector<HTMLElement>('[data-line-unit-hint]');
  const refreshUnitUi=()=>{
    const product=products.find(p=>p.id===productInput.value);
    const factor=Math.max(1,Number(product?.unitFactor)||Number(factorInput.value)||1);
    factorInput.value=String(factor);
    const packName=(product?.packUnit||'').trim()||'بسته';
    const baseName=product?.unit||unitField.value||'عدد';
    const canPack=!!product && factor>1;
    if(modeWrap)modeWrap.hidden=!canPack;
    if(modeSelect && canPack){
      modeSelect.innerHTML=`<option value="base">${esc(baseName)} (پایه)</option><option value="pack">${esc(packName)} (×${fa(factor)})</option>`;
    }
    const mode=modeSelect?.value==='pack'?'pack':'base';
    if(canPack && mode==='pack'){
      unitField.value=packName;
      if(unitHint){unitHint.hidden=false;unitHint.textContent=`هر ${packName} = ${fa(factor)} ${baseName} · موجودی بر حسب ${baseName} کم/زیاد می‌شود · قیمت برای هر ${packName}`;}
    }else{
      unitField.value=baseName;
      if(unitHint){
        if(canPack){unitHint.hidden=false;unitHint.textContent=`واحد پایه: ${baseName} · در صورت نیاز ورود با «${packName}» را انتخاب کنید (ضریب ${fa(factor)})`;}
        else unitHint.hidden=true;
      }
    }
  };
  const applyProduct=(id:string)=>{
    productInput.value=id||'';
    const product=products.find(p=>p.id===id);
    if(product){
      descField.value=product.name;
      if(descLabel)descLabel.hidden=true;
      if(productLabel)productLabel.hidden=false;
      if(productTitle)productTitle.textContent=product.name;
      unitField.value=product.unit||'عدد';
      factorInput.value=String(Math.max(1,Number(product.unitFactor)||1));
      if(modeSelect)modeSelect.value='base';
      if(stockOut)stockOut.textContent=`${fa(Number(product.systemQty)||0)} ${product.unit||'عدد'}`;
      if(stockField)stockField.hidden=false;
      const price=row.querySelector<HTMLInputElement>('[data-line-price]')!;
      {
        const isPurchase=isPurchaseInvoiceType(activeInvoiceType);
        // فروش: قیمت واحد = قیمت مصرف‌کننده؛ مبلغ ردیف = بعد از تخفیف
        // خرید: قیمت واحد = قیمت خرید
        const unitPrice=isPurchase
          ?(Number(product.purchasePrice)||Number(product.price)||0)
          :(Number(product.consumerPrice)||Number(product.price)||0);
        if(unitPrice&&(!price.value.trim()||price.dataset.autoFilled==='true')){
          price.value=formatMoneyFromRial(unitPrice,currency);
          price.dataset.autoFilled='true';
        }
        // تخفیف خودکار فروش از درصد یا اختلاف قیمت مصرف‌کننده و قیمت فروش
        if(!isPurchase){
          const discountInput=row.querySelector<HTMLInputElement>('[data-line-discount]');
          if(discountInput && (!discountInput.value.trim() || discountInput.value==='0' || discountInput.dataset.autoFilled==='true')){
            const qty=lineBaseQty(row)||1;
            const discountTotal=suggestedProductDiscountRial(product,qty);
            discountInput.value=formatMoneyFromRial(discountTotal,currency);
            discountInput.dataset.autoFilled='true';
          }
        }
      }
    }else{
      if(descLabel)descLabel.hidden=false;
      if(productLabel)productLabel.hidden=true;
      if(productTitle)productTitle.textContent='';
      descField.readOnly=false;
      descField.placeholder='مثلاً اجرت نصب، مشاوره یا نام کالا';
      if(!descField.value.trim())descField.value='';
      if(stockOut)stockOut.textContent='—';
      if(stockField)stockField.hidden=true;
      factorInput.value='1';
      if(modeSelect)modeSelect.value='base';
    }
    refreshUnitUi();
    updateInvoiceTotals();
  };
  if(productId)applyProduct(productId); else { if(stockField)stockField.hidden=true; if(descLabel)descLabel.hidden=false; if(productLabel)productLabel.hidden=true; }
  row.querySelector('[data-remove-line]')?.addEventListener('click',()=>{if(host.children.length>1){row.remove();updateInvoiceLineNumbers(host);}else toast('فاکتور باید حداقل یک ردیف داشته باشد.','error');updateInvoiceTotals()});
  row.querySelector<HTMLInputElement>('[data-line-price]')?.addEventListener('input',event=>{(event.target as HTMLInputElement).dataset.autoFilled='false'});
  row.querySelector<HTMLInputElement>('[data-line-discount]')?.addEventListener('input',event=>{(event.target as HTMLInputElement).dataset.autoFilled='false'});
  modeSelect?.addEventListener('change',()=>{
    const product=products.find(p=>p.id===productInput.value);
    const factor=Math.max(1,Number(product?.unitFactor)||Number(factorInput.value)||1);
    const price=row.querySelector<HTMLInputElement>('[data-line-price]')!;
    const prev=modeSelect.dataset.prev||'base';
    const next=modeSelect.value==='pack'?'pack':'base';
    if(prev!==next && price.dataset.autoFilled!=='false'){
      const rial=parseMoneyToRial(digits(price.value||'0'),currency);
      if(rial>0){
        const adjusted=next==='pack'?Math.round(rial*factor):Math.round(rial/factor);
        if(adjusted>0){price.value=formatMoneyFromRial(adjusted,currency);price.dataset.autoFilled='true';}
      }
    }
    modeSelect.dataset.prev=next;
    refreshUnitUi();
    updateInvoiceTotals();
  });
  host.appendChild(row);
  updateInvoiceLineNumbers(host);
  row.querySelectorAll<HTMLInputElement>('[data-recalc]').forEach(input=>input.addEventListener('input',()=>updateInvoiceTotals()));
  refreshUnitUi();
  updateInvoiceTotals();
}
function addProductToInvoice(productId:string, keepScanReady=false):void {
  if(!products.some(p=>p.id===productId)){toast('کالای انتخاب‌شده پیدا نشد.','error');return;}
  const linesHost=el<HTMLDivElement>('#commerceInvoiceLines');
  if(linesHost?.children.length===1){const first=linesHost.firstElementChild as HTMLElement;const hasData=!!(first.querySelector<HTMLInputElement>('[data-line-desc]')?.value.trim()||first.querySelector<HTMLInputElement>('[data-line-price]')?.value.trim()||first.querySelector<HTMLInputElement>('[data-line-product]')?.value);if(!hasData)first.remove();}
  addInvoiceLine(productId);
  const host=el<HTMLInputElement>('#invoiceProductSearch');if(host){host.value='';}
  const barcode=el<HTMLInputElement>('#invoiceBarcodeInput');if(barcode)barcode.value='';
  if(keepScanReady){
    host?.focus({preventScroll:true});
  }else{
    el<HTMLElement>('#commerceInvoiceLines')?.lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
}
function invoiceProductMatches(value:string){
  const raw=(value||'').trim();if(!raw)return [];
  const q=normalizeSearchText(raw);
  if(!q)return [];
  const tokens=q.split(' ').filter(Boolean);
  return products.filter(p=>{
    const hay=normalizeSearchText([p.name,p.code,p.sku].filter(Boolean).join(' '));
    return tokens.every(t=>hay.includes(t));
  }).slice(0,20);
}
function resolveInvoiceProduct(value:string){
  const raw=(value||'').trim();if(!raw)return null;
  const q=normalizeSearchText(raw);
  const matches=invoiceProductMatches(value);
  return matches.find(p=>{
    const name=normalizeSearchText(p.name);
    const code=normalizeSearchText(p.code||'');
    const sku=normalizeSearchText(p.sku||'');
    return name===q||code===q||sku===q;
  }) || (matches.length===1?matches[0]:null);
}
function renderInvoiceProductSuggestions(value:string,activeIndex=0):void{
 const host=el<HTMLDivElement>('#invoiceProductSuggestions');if(!host)return;const matches=invoiceProductMatches(value);if(!matches.length){host.innerHTML='';host.hidden=true;return;}
 host.innerHTML=matches.map((p,i)=>`<button type="button" class="invoice-product-suggestion ${i===activeIndex?'active':''}" role="option" aria-selected="${i===activeIndex}" data-invoice-product-choice="${esc(p.id)}"><span><b>${esc(p.name)}</b><small>${esc(p.code||p.sku||'بدون کد')} · ${esc(p.unit||'عدد')}</small></span><span class="suggestion-stock">موجودی ${fa(Number(p.systemQty)||0)}</span></button>`).join('');host.hidden=false;
 host.querySelectorAll<HTMLButtonElement>('[data-invoice-product-choice]').forEach(b=>b.addEventListener('click',()=>{addProductToInvoice(b.dataset.invoiceProductChoice!);host.hidden=true;}));
}
function readInvoicePaymentPartsSafe():InvoicePaymentPart[]{try{return readInvoicePaymentParts()}catch{return []}}
function settlementRow(part?:InvoicePaymentPart, opts?:{autoRemaining?:boolean}):string {
 const method=part?.method||'cash';
 const isCheque=method==='cheque';
 const amountVal=part && part.amountRial>0?esc(formatMoneyFromRial(part.amountRial,currency)):'';
 const auto=opts?.autoRemaining?'1':'';
 return `<div class="settlement-payment-row settlement-stage-card">
 <div class="settlement-stage-top">
   <div class="settlement-method-picker" data-settle-method-wrap>
     <span class="settlement-method-label">روش پرداخت</span>
     <div class="settlement-method-chips" role="radiogroup" aria-label="روش پرداخت" dir="rtl">
       <button type="button" class="settlement-method-chip ${method==='card'?'is-active':''}" data-settle-method-btn="card" aria-pressed="${method==='card'}">کارت‌خوان</button>
       <button type="button" class="settlement-method-chip ${method==='cash'?'is-active':''}" data-settle-method-btn="cash" aria-pressed="${method==='cash'}">نقدی</button>
       <button type="button" class="settlement-method-chip ${method==='cheque'?'is-active':''}" data-settle-method-btn="cheque" aria-pressed="${method==='cheque'}">چک</button>
     </div>
     <select data-settle-method hidden aria-hidden="true">
       <option value="card" ${method==='card'?'selected':''}>کارت‌خوان</option>
       <option value="cash" ${method==='cash'?'selected':''}>نقدی</option>
       <option value="cheque" ${isCheque?'selected':''}>چک</option>
     </select>
   </div>
   <div class="settlement-payment-controls">
     <label class="field settlement-amount-field settlement-field-box">
       <span class="settlement-field-label">مبلغ (${currency==='toman'?'تومان':'ریال'})</span>
       <input data-settle-amount inputmode="numeric" value="${amountVal}" placeholder="مبلغ این مرحله" data-auto-remaining="${auto}">
     </label>
     <button type="button" class="btn btn-sm btn-secondary settlement-remove-btn" data-settle-remove title="حذف این مرحله">حذف</button>
   </div>
 </div>
 <div class="settlement-cheque-fields settlement-cheque-stack" data-settle-cheque-block dir="rtl" ${isCheque?'':'hidden'} style="${isCheque?'':'display:none'}">
   <div class="settlement-cheque-title">مشخصات چک</div>
   <label class="field settlement-field-box">شماره چک *<input data-settle-cheque-number value="${esc(part?.chequeNumber||'')}" autocomplete="off" inputmode="numeric" dir="rtl"></label>
   <label class="field settlement-field-box">بانک *<input data-settle-cheque-bank value="${esc(part?.chequeBank||'')}" autocomplete="off" dir="rtl"></label>
   <label class="field settlement-field-box">شماره صیادی *<input data-settle-cheque-account value="${esc(part?.chequeAccount||'')}" autocomplete="off" placeholder="شناسه صیادی ۱۶ یا ۲۰ رقمی" inputmode="numeric" dir="ltr" style="text-align:right"></label>
   <label class="field settlement-field-box">تاریخ سررسید چک *<input data-settle-cheque-due value="${esc(part?.chequeDueDate||'')}" placeholder="1405/01/30" inputmode="numeric" autocomplete="off" dir="ltr" style="text-align:right"></label>
   <label class="field settlement-field-box">توضیحات چک<input data-settle-cheque-note value="${esc(part?.note||'')}" autocomplete="off" dir="rtl"></label>
 </div>
 </div>`;
}
function openInvoiceSettlementSheet(invoiceId:string):void {
 const target=commerce?.invoices.find(i=>i.id===invoiceId);if(!target||!commerce)return;
 document.getElementById('invoiceSettlementSheet')?.remove();
 const party=commerce.parties.find(p=>p.id===target.partyId);
 const overlay=document.createElement('div');overlay.id='invoiceSettlementSheet';overlay.dir='rtl';
 overlay.style.cssText='position:fixed;inset:0;z-index:10220;background:var(--surface,#fff);color:var(--text,#222);overflow:auto;padding:clamp(12px,3vw,28px)';
 const isSale=isSaleInvoiceType(target.type);
 const actionLabel=isSale?'دریافت':'پرداخت';
 overlay.innerHTML=`<div style="max-width:1000px;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h2 style="margin:0 0 6px">تسویه فاکتور — ${actionLabel}</h2><p class="hint" style="margin:0">شماره ${esc(target.number)} · ${esc(party?.name||'—')} · مبلغ نهایی ${money(target.grossRial)}</p></div><button type="button" class="btn btn-secondary" id="settlementBack">بازگشت</button></div>
 <div class="card" style="margin-top:16px"><h3>نوع ${actionLabel}</h3><p class="hint">روش و مبلغ را مشخص کنید. می‌توانید چند روش را ترکیب کنید (مثلاً بخشی نقد و بخشی چک). مانده به‌صورت اعتباری ثبت می‌شود.</p><div id="settlementRows">${((target.paymentParts||[]).filter(x=>x.method!=='credit').length?(target.paymentParts||[]).filter(x=>x.method!=='credit'):[{method:'cash' as const,amountRial:Math.max(0,target.grossRial)}]).map(x=>settlementRow(x)).join('')}</div><button type="button" class="btn btn-secondary" id="settlementAdd">افزودن روش ${actionLabel}</button>
 <div class="settlement-credit-box" style="margin-top:12px"><label class="field settlement-field-box"><span class="settlement-field-label">سررسید مانده اعتباری (شمسی)</span><input id="settlementDueDate" value="${esc(target.dueDate||target.date||'')}" placeholder="1405/01/30" inputmode="numeric" autocomplete="off" dir="ltr" style="text-align:right"></label><p class="hint" style="margin:8px 0 0">اگر مبلغ را کامل نقد/کارت/چک بپردازید، سررسید لازم نیست. برای مانده اعتباری سررسید را مشخص کنید.</p></div><div class="card" style="margin-top:12px"><div id="settlementTotals">در حال محاسبه...</div><div id="settlementCredit" class="hint" style="margin-top:8px"></div></div>
 <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px"><button type="button" class="btn btn-primary" id="settlementConfirm">تأیید ${actionLabel} و ثبت قطعی</button><button type="button" class="btn btn-secondary" id="settlementCancel">انصراف</button></div></div></div>`;
 document.body.appendChild(overlay);
 // تقویم شمسی مثل بقیه فرم‌ها
 queueMicrotask(()=>{
   enhanceDateFields(overlay);
   overlay.querySelectorAll<HTMLInputElement>('[data-settle-cheque-due], #settlementDueDate').forEach(inp=>{
     delete inp.dataset.calendarEnhanced;
     attachJalaliCalendar(inp);
   });
 });
 const host=overlay.querySelector<HTMLDivElement>('#settlementRows')!;
 const unitLabel=currency==='toman'?'تومان':'ریال';
 const read=():InvoicePaymentPart[]=>[...host.querySelectorAll<HTMLElement>('.settlement-payment-row')].map(row=>{
   const method=(row.querySelector<HTMLSelectElement>('[data-settle-method]')?.value||'cash') as InvoicePaymentPart['method'];
   return {
     method,
     amountRial:parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-settle-amount]')?.value||'0'),currency),
     ...(method==='cheque'?{
       chequeNumber:row.querySelector<HTMLInputElement>('[data-settle-cheque-number]')?.value||'',
       chequeBank:row.querySelector<HTMLInputElement>('[data-settle-cheque-bank]')?.value||'',
       chequeAccount:row.querySelector<HTMLInputElement>('[data-settle-cheque-account]')?.value||'',
       chequeDueDate:digits(row.querySelector<HTMLInputElement>('[data-settle-cheque-due]')?.value||''),
       note:row.querySelector<HTMLInputElement>('[data-settle-cheque-note]')?.value||'',
     }:{}),
   };
 }).filter(x=>x.amountRial>0);
 const sumAllAmounts=()=>{
   let paid=0;
   host.querySelectorAll<HTMLInputElement>('[data-settle-amount]').forEach(inp=>{
     paid+=parseMoneyToRial(digits(inp.value||'0'),currency);
   });
   return paid;
 };
 const update=()=>{
   const paid=sumAllAmounts();
   const credit=Math.max(0,target.grossRial-paid);
   const totals=overlay.querySelector<HTMLElement>('#settlementTotals');
   if(totals){
     totals.innerHTML=`<div class="settlement-totals-grid">
       <div><span>مبلغ فاکتور</span><b>${money(target.grossRial)}</b></div>
       <div><span>ثبت‌شده در مراحل</span><b>${money(paid)}</b></div>
       <div class="${credit>0?'is-credit':''}"><span>مانده</span><b>${money(credit)}</b></div>
     </div>`;
   }
   const creditNode=overlay.querySelector<HTMLElement>('#settlementCredit');
   if(creditNode){
     creditNode.textContent=credit>0
       ?`مانده ${money(credit)} — می‌توانید مرحله بعد اضافه کنید یا همین مانده را اعتباری بگذارید.`
       :'مانده: ۰ — مبلغ کامل پوشش داده شده است.';
   }
   const addBtn=overlay.querySelector<HTMLButtonElement>('#settlementAdd');
   if(addBtn){
     addBtn.textContent=credit>0
       ?`+ مرحله بعد با مانده ${formatMoneyFromRial(credit,currency)} ${unitLabel}`
       :`افزودن روش ${actionLabel}`;
   }
 };
 const toggleChequeFields=(row:HTMLElement)=>{
   const method=row.querySelector<HTMLSelectElement>('[data-settle-method]')?.value||'cash';
   const isCheque=method==='cheque';
   const block=row.querySelector<HTMLElement>('[data-settle-cheque-block]');
   if(block){
     block.hidden=!isCheque;
     block.style.display=isCheque?'':'none';
   }
   row.querySelectorAll<HTMLButtonElement>('[data-settle-method-btn]').forEach(btn=>{
     const on=btn.dataset.settleMethodBtn===method;
     btn.classList.toggle('is-active',on);
     btn.setAttribute('aria-pressed',on?'true':'false');
   });
   if(isCheque){
     row.querySelectorAll<HTMLInputElement>('[data-settle-cheque-due]').forEach(inp=>{
       delete inp.dataset.calendarEnhanced;
       attachJalaliCalendar(inp);
     });
   }
 };
 const bind=(row:HTMLElement)=>{
   toggleChequeFields(row);
   row.querySelectorAll<HTMLButtonElement>('[data-settle-method-btn]').forEach(btn=>{
     btn.addEventListener('click',()=>{
       const method=btn.dataset.settleMethodBtn||'cash';
       const sel=row.querySelector<HTMLSelectElement>('[data-settle-method]');
       if(sel) sel.value=method;
       toggleChequeFields(row);
       update();
     });
   });
   row.querySelector<HTMLSelectElement>('[data-settle-method]')?.addEventListener('change',()=>{toggleChequeFields(row);update();});
   const amountInp=row.querySelector<HTMLInputElement>('[data-settle-amount]');
   amountInp?.addEventListener('input',()=>{
     amountInp.dataset.autoRemaining='0';
     update();
     const rows=[...host.querySelectorAll<HTMLElement>('.settlement-payment-row')];
     // هم‌تراز کردن آخرین مرحله auto با مانده
     if(rows.length>1){
       const last=rows[rows.length-1];
       const lastInp=last.querySelector<HTMLInputElement>('[data-settle-amount]');
       if(lastInp && lastInp!==amountInp && lastInp.dataset.autoRemaining==='1'){
         let paidOthers=0;
         rows.forEach(r=>{
           const inp=r.querySelector<HTMLInputElement>('[data-settle-amount]');
           if(inp && inp!==lastInp) paidOthers+=parseMoneyToRial(digits(inp.value||'0'),currency);
         });
         const rem=Math.max(0,target.grossRial-paidOthers);
         lastInp.value=rem?formatMoneyFromRial(rem,currency):'';
         update();
       }
     }
   });
   amountInp?.addEventListener('focus',()=>{
     if(!digits(amountInp.value||'').trim()){
       // مانده بدون این فیلد
       let paidOthers=0;
       host.querySelectorAll<HTMLInputElement>('[data-settle-amount]').forEach(inp=>{
         if(inp!==amountInp) paidOthers+=parseMoneyToRial(digits(inp.value||'0'),currency);
       });
       const rem=Math.max(0,target.grossRial-paidOthers);
       if(rem>0){
         amountInp.value=formatMoneyFromRial(rem,currency);
         amountInp.dataset.autoRemaining='1';
         update();
       }
     }
   });
   row.querySelector('[data-settle-remove]')?.addEventListener('click',()=>{
     if(host.querySelectorAll('.settlement-payment-row').length<=1){
       toast('حداقل یک مرحله پرداخت لازم است.','info');
       return;
     }
     row.remove();
     update();
   });
 };
 host.querySelectorAll<HTMLElement>('.settlement-payment-row').forEach(bind);
 const add=()=>{
   const paid=sumAllAmounts();
   const rem=Math.max(0,target.grossRial-paid);
   const wrap=document.createElement('div');
   wrap.innerHTML=settlementRow(
     rem>0?{method:'cash',amountRial:rem}:{method:'cash',amountRial:0},
     {autoRemaining:rem>0}
   );
   const row=wrap.firstElementChild as HTMLElement;
   host.appendChild(row);
   bind(row);
   update();
   row.querySelector<HTMLInputElement>('[data-settle-amount]')?.focus();
 };
 overlay.querySelector('#settlementAdd')!.addEventListener('click',add);
 const closeSettlement=async()=>{
   overlay.remove();
   if(document.getElementById('commercePanelSheet') && (activeCommerceSection==='sale'||activeCommerceSection==='purchase')){
     try{ await openCommercePanelSheet(activeCommerceSection); }catch (e) { console.error('[Anbarin] swallowed error', e); }
   }
 };
 overlay.querySelector('#settlementBack')!.addEventListener('click',()=>{void closeSettlement();});
 overlay.querySelector('#settlementCancel')!.addEventListener('click',()=>{void closeSettlement();});
 host.addEventListener('input',update);host.addEventListener('change',update);update();
 const resolveCashAccountId=async():Promise<string>=>{
   try{
     const acc=await ensureCommerceAccounts();
     const cash=acc.accounts.find(a=>a.isActive&&a.id==='det-cash')
       ||acc.accounts.find(a=>a.isActive&&a.id==='det-bank')
       ||acc.accounts.find(a=>a.isActive&&a.level==='detail'&&/صندوق|بانک|cash|bank/i.test(a.title||''));
     if(cash){
       accountOptionsCache=acc.accounts
         .filter(a=>a.isActive&&a.level==='detail'&&(a.id==='det-cash'||a.id==='det-bank'||/صندوق|بانک/i.test(a.title||'')))
         .map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('');
       return cash.id;
     }
   }catch(e){ console.warn('[anbarin] resolveCashAccountId', e); }
   const fromCache=accountOptionsCache.match(/value="([^"]+)"/)?.[1]||'';
   return fromCache;
 };

overlay.querySelector<HTMLButtonElement>('#settlementConfirm')!.addEventListener('click',async()=>{
 try{
  const activeCommerce=commerce;
  if(!activeCommerce)throw new Error('اطلاعات فاکتور در دسترس نیست.');
  // فقط مبالغ مثبت؛ ردیف‌های خالی باعث خطای بعد از قطعی‌سازی نشوند
  const realParts=read().filter(x=>x.method!=='credit'&&x.amountRial>0);
  const total=realParts.reduce((n,x)=>n+x.amountRial,0);
  if(total>target.grossRial)throw new Error('جمع دریافت/پرداخت نباید از مبلغ فاکتور بیشتر شود.');
  const creditAmount=Math.max(0,target.grossRial-total);
  const parts:InvoicePaymentPart[]=[
    ...realParts,
    ...(creditAmount>0?[{method:'credit' as const,amountRial:creditAmount,note:'مانده اعتباری فاکتور'}]:[]),
  ];
  let dueDate=digits(overlay.querySelector<HTMLInputElement>('#settlementDueDate')!.value||'');
  if(creditAmount>0&&!dueDate) dueDate=digits(target.date||'');
  if(creditAmount>0&&!dueDate)throw new Error('برای مانده اعتباری، تاریخ سررسید را مشخص کنید.');
  if(dueDate&&!/^\d{4}\/\d{2}\/\d{2}$/.test(dueDate))throw new Error('تاریخ سررسید باید به شکل سال/ماه/روز شمسی باشد.');
  const chequeParts=parts.filter(x=>x.method==='cheque');
  if(chequeParts.some(x=>!x.chequeNumber?.trim()||!x.chequeBank?.trim()||!x.chequeAccount?.trim()||!x.chequeDueDate))
    throw new Error('برای هر چک، شماره چک، بانک، شماره صیادی و تاریخ سررسید الزامی است.');
const isActiveChequeStatus=(s?:string)=>!s||s==='pending'||s==='cleared';
  const chequeKey=(x:{chequeNumber?:string;chequeBank?:string;chequeAccount?:string})=>[
    (x.chequeNumber||'').trim(),
    (x.chequeBank||'').trim().toLocaleLowerCase(),
    (x.chequeAccount||'').replace(/\s+/g,'').toLocaleLowerCase(),
  ].join('|');
  const settleType=(target.type==='sale'||target.type==='return-purchase')?'receipt':'payment';
  const chequeKeys=chequeParts.map(chequeKey);
  if(new Set(chequeKeys).size!==chequeKeys.length)
    throw new Error('در این تسویه دو ردیف با مشخصات یکسان چک وجود دارد.');
  if(chequeKeys.some(k=>activeCommerce.cashTransactions.some(t=>
    t.type===settleType
    && t.method==='cheque'
    && isActiveChequeStatus(t.chequeStatus)
    && chequeKey(t)===k
  ))) throw new Error('این مشخصات چک (شماره، بانک و شناسه صیادی) در همین نوع سند قبلاً به‌صورت فعال ثبت شده است.');
  const cashAccountId=realParts.length?await resolveCashAccountId():'';
  if(realParts.length&&!cashAccountId)throw new Error('برای ثبت دریافت/پرداخت، ابتدا حساب صندوق یا بانک فعال تعریف کنید.');

  const latest=await loadCommerceData();
  const draft=latest.invoices.find(i=>i.id===target.id);
  if(!draft)throw new Error('فاکتور پیدا نشد.');

  // پشتیبانی از تسویه مانده فاکتور قطعی‌شده (بدون قطعی‌سازی مجدد)
  const alreadyPosted=draft.status==='posted';
  if(draft.status!=='draft'&&draft.status!=='posted')throw new Error('وضعیت فاکتور برای تسویه معتبر نیست.');
  if(alreadyPosted){
    const left=invoiceOutstanding(target.id,latest);
    if(left<=0)throw new Error('این فاکتور مانده قابل تسویه ندارد.');
    if(total>left)throw new Error(`جمع دریافت/پرداخت از مانده فاکتور (${left.toLocaleString('fa-IR')} ریال) بیشتر است.`);
  }else{
    draft.paymentParts=parts;
    draft.paymentTerms=invoicePaymentTermsLabel(parts);
    draft.dueDate=dueDate;
    draft.updatedAt=new Date().toISOString();
    await saveCommerceData(latest);
    commerce=latest;
    const result=await postInvoice(target.id,commerce);
    commerce=result.commerce;
    try{costingCache=await loadInventoryCostData();}catch (e) { console.error('[Anbarin] ignored error', e); }
  }

  // ثبت دریافت/پرداخت‌ها — هر کدام با بارگذاری مجدد از دیسک تا مانده درست کم شود
  let paidOk=0;
  const cashErrors:string[]=[];
  for(let n=0;n<realParts.length;n++){
    const part=realParts[n];
    try{
      const period=await invoicePeriodForDate(target.date);
      const isReceipt=target.type==='sale'||target.type==='return-purchase';
      const method=part.method==='cash'?'cash':part.method==='card'?'card':'cheque';
      const transactionCommerce = commerce;
      if (!transactionCommerce) throw new Error('اطلاعات دریافت/پرداخت در دسترس نیست.');
      const tx=await createCashTransaction({
        type:isReceipt?'receipt':'payment',
        number:`${isReceipt?'IR':'IP'}-${target.number}-${Date.now().toString(36).slice(-4)}-${n+1}`,
        date:target.date,
        fiscalPeriodId:period,
        partyId:target.partyId,
        cashAccountId,
        amountRial:part.amountRial,
        description:`تسویه فاکتور ${target.number} (${part.method==='cash'?'نقدی':part.method==='card'?'کارت':'چک'})`,
        method,
        allocations:[{invoiceId:target.id,amountRial:part.amountRial}],
        chequeNumber:part.chequeNumber,
        chequeBank:part.chequeBank,
        chequeAccount:part.chequeAccount,
        chequeNote:part.note,
        chequeDueDate:part.chequeDueDate,
      },transactionCommerce);
      commerce=tx.commerce;
      paidOk+=1;
    }catch(err){
      cashErrors.push(err instanceof Error?err.message:String(err));
      break;
    }
  }

  if(cashErrors.length){
    const left=commerce?invoiceOutstanding(target.id,commerce):0;
    throw new Error(
      (alreadyPosted?'':'فاکتور قطعی شد اما ') +
      `ثبت دریافت/پرداخت ناقص ماند (${paidOk} از ${realParts.length}). ${cashErrors[0]}` +
      (left>0?` مانده فعلی: ${left.toLocaleString('fa-IR')} ریال.`:'')
    );
  }

  // کنترل نهایی: مانده باید با اعتبار توافق‌شده یکی باشد
  if(commerce&&realParts.length){
    const left=invoiceOutstanding(target.id,commerce);
    const expectedLeft=alreadyPosted
      ? Math.max(0, invoiceOutstanding(target.id, latest) - total)
      : creditAmount;
    // برای فاکتور تازه قطعی‌شده expectedLeft = creditAmount
    // تحمل ۱ ریال برای گرد کردن
    if(!alreadyPosted && Math.abs(left-creditAmount)>1){
      throw new Error(`تسویه ناقص است: مانده فاکتور ${left.toLocaleString('fa-IR')} ریال است در حالی که اعتبار توافق‌شده ${creditAmount.toLocaleString('fa-IR')} ریال بود. از بخش دریافت/پرداخت مانده را تسویه کنید.`);
    }
  }

  // فاکتور و هر دریافت/پرداخت در لایه عملیاتی خودشان به‌صورت پایدار ذخیره شده‌اند؛
  // ذخیره دوباره snapshot اینجا می‌تواند commit جدیدتر را با داده قدیمی بپوشاند.
  overlay.remove();
  await render();
  refreshAccounting();
  toast(
    realParts.length
      ? (creditAmount>0
          ? `تسویه ثبت شد؛ مانده اعتباری ${money(creditAmount)}`
          : 'تسویه کامل ثبت شد')
      : 'فاکتور قطعی شد (تماماً اعتباری)',
    'success'
  );
 }catch(e){
   // عملیات تسویه چندمرحله‌ای است؛ پس از خطا وضعیت قطعی را از دیسک بازیابی کن.
   try{
     const recovered=await loadCommerceData();
     if(recovered) commerce=recovered;
     await render();
     refreshAccounting();
   }catch(recoveryError){
     console.error('[anbarin] settlement recovery failed',recoveryError);
   }
   toast(e instanceof Error?e.message:'خطا در ثبت دریافت / پرداخت','error');
 }
});
}

/** محاسبات تعداد و ضریب واحد از ماژول مستقل فاکتور می‌آیند. */
const lineEnteredQty=invoiceLineEnteredQty;
const lineUnitFactor=(row:HTMLElement)=>invoiceLineUnitFactor(row,products);
const lineBaseQty=(row:HTMLElement)=>invoiceLineBaseQty(row,products);

/** برآورد بهای تمام‌شده ردیف از موجودی فعلی (میانگین واحد) — فقط نمایش داخلی */
function estimateLineCogsRial(productId:string|undefined, quantityMilli:number, warehouse?:string):{cogsRial:number; known:boolean}{
  if(!productId || quantityMilli<=0) return {cogsRial:0, known:false};
  const product=products.find(p=>p.id===productId);
  if(!product) return {cogsRial:0, known:false};
  const wh=warehouseName(warehouse||product.warehouse);
  const bal=costingCache ? getCostBalance(costingCache, productId, wh) : null;
  const unit=bal && bal.averageUnitCostRial>0 ? bal.averageUnitCostRial : 0;
  if(unit<=0) return {cogsRial:0, known:false};
  return {cogsRial:Math.round(quantityMilli*unit/1000), known:true};
}

function updateInvoiceTotals():void {
  // اگر تخفیف فروش به‌صورت خودکار پر شده، با تغییر تعداد هم‌تراز بماند (بدون دست زدن به تخفیف دستی)
  if (!isPurchaseInvoiceType(activeInvoiceType)) {
    document.querySelectorAll<HTMLElement>('.commerce-line').forEach(row => {
      const discountInput = row.querySelector<HTMLInputElement>('[data-line-discount]');
      const productId = row.querySelector<HTMLInputElement>('[data-line-product]')?.value || '';
      if (!discountInput || discountInput.dataset.autoFilled !== 'true' || !productId) return;
      const product = products.find(p => p.id === productId);
      if (!product) return;
      const qty = lineBaseQty(row);
      discountInput.value = formatMoneyFromRial(suggestedProductDiscountRial(product,qty), currency);
    });
  }

  let net=0;
  let cogsTotal=0;
  let costedRevenue=0;
  let allCostKnown=true;
  const showProfit=activeInvoiceType==='sale';
  document.querySelectorAll<HTMLElement>('.commerce-line').forEach(row=>{
    const q=lineEnteredQty(row); // تعداد بر حسب واحد انتخاب‌شده (پایه یا بسته)
    const baseQty=lineBaseQty(row); // معادل واحد پایه برای موجودی
    const price=parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-line-price]')?.value||'0'),currency);
    const discount=parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-line-discount]')?.value||'0'),currency);
    const raw=Math.round(q*price); const total=Math.max(0,raw-discount); net+=total;
    const out=row.querySelector<HTMLInputElement>('[data-line-total]'); if(out)out.value=fa(currency==='toman'?Math.round(total/10):total);
    const profitBox=row.querySelector<HTMLElement>('[data-line-profit-box]');
    if(profitBox){
      if(!showProfit){ profitBox.hidden=true; }
      else {
        profitBox.hidden=false;
        const productId=row.querySelector<HTMLInputElement>('[data-line-product]')?.value||'';
        const qtyMilli=Math.round(baseQty*1000);
        const est=estimateLineCogsRial(productId||undefined, qtyMilli);
        const cogsEl=row.querySelector<HTMLElement>('[data-line-cogs]');
        const profitEl=row.querySelector<HTMLElement>('[data-line-gross-profit]');
        const marginEl=row.querySelector<HTMLElement>('[data-line-margin]');
        if(!productId){
          if(cogsEl)cogsEl.textContent='—';
          if(profitEl)profitEl.textContent='—';
          if(marginEl)marginEl.textContent='—';
        }else if(!est.known){
          allCostKnown=false;
          if(cogsEl)cogsEl.textContent='بهای نامشخص';
          if(profitEl)profitEl.textContent='—';
          if(marginEl)marginEl.textContent='—';
        }else{
          cogsTotal+=est.cogsRial;
          costedRevenue+=total;
          const gp=total-est.cogsRial;
          const margin=total>0?(gp/total*100):0;
          if(cogsEl)cogsEl.textContent=money(est.cogsRial);
          if(profitEl)profitEl.textContent=money(gp);
          if(marginEl)marginEl.textContent=`${fa(Math.round(margin*10)/10)}٪`;
        }
      }
    }
  });
  const rate=Number(digits(el<HTMLInputElement>('#invoiceTaxRate')?.value||'0').replace(',','.'));
  const taxInput=el<HTMLInputElement>('#invoiceTax');
  if(Number.isFinite(rate)&&rate>0&&rate<=100&&taxInput&&taxInput.dataset.autoFilled!=='false'){
    taxInput.value=formatMoneyFromRial(Math.round(net*rate/100),currency);
    taxInput.dataset.autoFilled='true';
  }
  const tax=parseMoneyToRial(digits(el<HTMLInputElement>('#invoiceTax')?.value||'0'),currency);
  const netOut=el<HTMLElement>('#invoiceNetPreview'); if(netOut)netOut.textContent=money(net);
  const taxOut=el<HTMLElement>('#invoiceTaxPreview'); if(taxOut)taxOut.textContent=money(tax);
  const landed =
    parseMoneyToRial(digits(el<HTMLInputElement>('#invoiceLandedFreight')?.value||'0'),currency) +
    parseMoneyToRial(digits(el<HTMLInputElement>('#invoiceLandedCustoms')?.value||'0'),currency) +
    parseMoneyToRial(digits(el<HTMLInputElement>('#invoiceLandedInsurance')?.value||'0'),currency) +
    parseMoneyToRial(digits(el<HTMLInputElement>('#invoiceLandedOther')?.value||'0'),currency);
  const landedSum=el<HTMLElement>('#invoiceLandedSummary'); if(landedSum)landedSum.textContent=money(landed);
  const landedPrev=el<HTMLElement>('#invoiceLandedTotalPreview'); if(landedPrev)landedPrev.textContent=`جمع هزینه جانبی: ${money(landed)} (به بهای موجودی اضافه می‌شود؛ در مبلغ نهایی فاکتور تأمین‌کننده لحاظ نمی‌شود)`;
  const grossOut=el<HTMLElement>('#invoiceGrossPreview'); if(grossOut)grossOut.textContent=money(net+tax);
  const profitPanel=el<HTMLElement>('#invoiceInternalProfitPanel');
  if(profitPanel){
    if(!showProfit){ profitPanel.hidden=true; }
    else {
      profitPanel.hidden=false;
      const gp=costedRevenue-cogsTotal;
      const margin=costedRevenue>0?(gp/costedRevenue*100):0;
      const cogsOut=el<HTMLElement>('#invoiceCogsPreview'); if(cogsOut)cogsOut.textContent=allCostKnown&&costedRevenue>0?money(cogsTotal):(cogsTotal>0?money(cogsTotal)+' (ناقص)':'بهای نامشخص');
      const gpOut=el<HTMLElement>('#invoiceGrossProfitPreview'); if(gpOut)gpOut.textContent=costedRevenue>0?money(gp):'—';
      const mOut=el<HTMLElement>('#invoiceMarginPreview'); if(mOut)mOut.textContent=costedRevenue>0?`${fa(Math.round(margin*10)/10)}٪`:'—';
    }
  }
  const payParts=readInvoicePaymentPartsSafe();const paid=payParts.reduce((sum,x)=>sum+x.amountRial,0);const summary=el<HTMLElement>('#invoicePaymentSummary');if(summary)summary.textContent=`جمع پرداخت‌ها: ${money(paid)} · مانده اعتباری/بدهی: ${money(Math.max(0,net+tax-paid))}`;
}
function applyInvoiceTaxRate():void {
  let net=0;
  document.querySelectorAll<HTMLElement>('.commerce-line').forEach(row=>{
    const q=Number(digits(row.querySelector<HTMLInputElement>('[data-line-qty]')?.value||'0').replace(',','.'))||0;
    const price=parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-line-price]')?.value||'0'),currency);
    const discount=parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-line-discount]')?.value||'0'),currency);
    net+=Math.max(0,Math.round(q*price)-discount);
  });
  const rate=Number(digits(el<HTMLInputElement>('#invoiceTaxRate')?.value||'0').replace(',','.'));
  if(!Number.isFinite(rate)||rate<0||rate>100){toast('نرخ مالیات باید بین صفر تا ۱۰۰ درصد باشد.','error');return;}
  const tax=Math.round(net*rate/100);
  const taxInput=el<HTMLInputElement>('#invoiceTax'); if(taxInput){taxInput.value=formatMoneyFromRial(tax,currency);taxInput.dataset.autoFilled='true';}
  updateInvoiceTotals();
}
function businessProfile(){
  const name=(settings.businessName||'').trim()||'فروشگاه / شرکت';
  return {
    name,
    slogan:(settings.businessSlogan||'').trim(),
    phone:(settings.businessPhone||'').trim(),
    address:(settings.businessAddress||'').trim(),
    nationalId:(settings.businessNationalId||'').trim(),
    economicCode:(settings.businessEconomicCode||'').trim(),
    postalCode:(settings.businessPostalCode||'').trim(),
    logo:(settings.businessLogoDataUrl||'').trim(),
  };
}

function buildInvoiceHtml(invoiceId:string, opts?:{internal?:boolean}):{title:string;html:string;text:string}|null {
  const invoice=commerce?.invoices.find(i=>i.id===invoiceId); if(!invoice||!commerce)return null;
  const party=commerce.parties.find(p=>p.id===invoice.partyId); if(!party)return null;
  const biz=businessProfile();
  const internal=!!opts?.internal && invoice.type==='sale';
  const lineProfit=invoice.lines.map(l=>{
    if(!internal || !l.productId) return {cogsRial:0, known:false};
    if(invoice.status==='posted' && costingCache){
      const mov=costingCache.movements.find(m=>m.sourceDocumentId===invoice.id&&m.productId===l.productId&&m.type==='sale');
      if(mov) return {cogsRial:Math.max(0,mov.totalCostRial), known:true};
    }
    return estimateLineCogsRial(l.productId,l.quantityMilli,l.warehouse);
  });
  return buildInvoiceDocumentHtml(invoice,party,biz,internal,lineProfit,{fa,esc,money,invoiceTypeTitle,isSaleInvoiceType});
}

/** تنظیم دقیق قالب فاکتور برای کاغذهای برگه‌ای؛ فقط روی سند چاپ فاکتور اثر دارد. */

/** فاکتور رسیدی فشرده برای رول‌های حرارتی جیبی ۵۸mm و فروشگاهی ۸۰mm */
function buildInvoiceHtmlThermalTemplate(invoiceId:string,widthMm:58|80):{title:string;html:string;text:string}|null {
  const invoice=commerce?.invoices.find(i=>i.id===invoiceId); if(!invoice||!commerce)return null;
  const party=commerce.parties.find(p=>p.id===invoice.partyId); if(!party)return null;
  return buildThermalInvoiceHtml(invoice,party,businessProfile(),widthMm,{fa,esc,money,invoiceTypeTitle,isSaleInvoiceType});
}

function buildInvoiceHtmlThermal(invoiceId:string,widthMm:58|80):{title:string;html:string;text:string}|null {
  // تنها یک قالب مشترک برای هر دو رول؛ تفاوت اندازه فقط از پارامتر widthMm می‌آید.
  return buildInvoiceHtmlThermalTemplate(invoiceId,widthMm);
}

function resolveInvoiceForPrint():string|null{
  if(editingInvoiceId && commerce?.invoices.some(i=>i.id===editingInvoiceId)) return editingInvoiceId;
  if(lastPrintableInvoiceId && commerce?.invoices.some(i=>i.id===lastPrintableInvoiceId)) return lastPrintableInvoiceId;
  // آخرین فاکتور هم‌نوع
  const list=(commerce?.invoices||[]).filter(i=>i.type===activeInvoiceType).slice().reverse();
  return list[0]?.id||null;
}
async function printInvoice(invoiceId:string, opts?:{internal?:boolean}):Promise<void> {
  const size=await choosePaperSize({mode:'document',title:opts?.internal?'سایز چاپ داخلی':'سایز چاپ فاکتور'});
  if(!size)return;
  // رول‌های حرارتی ۵۸ و ۸۰mm همیشه نسخه مشتری (بدون سود)
  const thermal=size==='label80'||size==='pocket58';
  const doc=thermal?buildInvoiceHtmlThermal(invoiceId,size==='pocket58'?58:80):buildInvoiceHtml(invoiceId,{internal:!!opts?.internal});
  if(!doc){toast('فاکتور برای چاپ پیدا نشد.','error');return;}
  const printHtml=thermal?doc.html:applyInvoicePaperLayout(doc.html,size);
  printHtmlSafely(printHtml, doc.title || `فاکتور-${invoiceId}`, {
    paperSize: size,
    onSuccess: () => toast(opts?.internal?'چاپ داخلی (با سود) آماده شد':(thermal?`چاپ فاکتور ${size==='pocket58'?'جیبی ۵۸mm':'۸۰mm'} آماده شد`:'پنجره چاپ باز شد؛ پس از اتمام به همین صفحه برمی‌گردید'), 'success'),
    onError: () => toast('باز کردن چاپ ناموفق بود؛ دوباره تلاش کنید', 'error'),
  });
}
async function shareInvoice(invoiceId:string):Promise<void> {
  // برای رول ۸۰mm هم نسخه کامل HTML مناسب‌تر است (خوانایی در پیام‌رسان)
  const doc=buildInvoiceHtml(invoiceId);
  if(!doc){toast('فاکتور برای اشتراک‌گذاری پیدا نشد.','error');return;}
  const safeNum=(commerce?.invoices.find(i=>i.id===invoiceId)?.number||invoiceId).replace(/[^\w\u0600-\u06FF-]+/g,'_');
  const fileName=`invoice-${safeNum}.html`;
  const mime='text/html;charset=utf-8';
  const title=doc.title || 'فاکتور انبارین';
  const textPreview=(doc.text||'').slice(0,800);

  // ۱) شیت بومی اندروید / Web Share با فایل
  const shareResult=await shareFileContent(doc.html,fileName,mime,{
    title,
    text: textPreview,
  });
  if(shareResult==='shared'){
    toast('فاکتور آماده ارسال است؛ پیام‌رسان یا Drive را انتخاب کنید','success');
    return;
  }
  if(shareResult==='cancelled')return;

  // ۲) کپی متن برای Paste دستی در پیام‌رسان
  try{
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(doc.text);
      toast('متن فاکتور کپی شد؛ در پیام‌رسان Paste کنید','success');
      return;
    }
  }catch{ /* ادامه */ }

  // ۳) ذخیره فایل روی دستگاه
  const saved=await downloadFile(doc.html,fileName,mime);
  if(saved==='saved'){
    toast('فایل فاکتور در دستگاه ذخیره شد','success');
    return;
  }
  if(saved==='cancelled')return;
  toast('اشتراک‌گذاری در این دستگاه پشتیبانی نشد','error');
}

async function bankPanel():Promise<string>{
  const [balances,recon,accData,reconSum]=await Promise.all([
    getBankAccountBalances(),loadBankReconciliation(),loadAccountingData(),getBankReconciliationSummary()
  ]);
  const opts=balances.map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('');
  const feeOpts=accData.accounts.filter(a=>a.isActive&&a.level==='detail'&&(a.code.startsWith('6')||/(هزینه|کارمزد)/.test(a.title)))
    .map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('');
  const txs=(commerce?.cashTransactions||[]).slice().reverse();
  const partyName=(id?:string)=>esc(commerce?.parties.find(p=>p.id===id)?.name||'—');
  const chequeSt=(s?:string)=>s==='pending'?'در جریان':s==='cleared'?'وصول':s==='bounced'?'برگشتی':s==='void'?'باطل':(s||'—');
  const recvCheques=txs.filter(t=>t.method==='cheque'&&t.type==='receipt');
  const payCheques=txs.filter(t=>t.method==='cheque'&&t.type==='payment');
  const defaultLedgerId=balances[0]?.id||'';
  const ledger=defaultLedgerId?await getBankAccountLedger(defaultLedgerId):[];
  const ledgerRows=ledger.slice(-80).reverse().map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.number)}</td><td>${esc(r.description)}</td><td>${money(r.debitRial)}</td><td>${money(r.creditRial)}</td><td>${money(r.balanceRial)}</td></tr>`).join('')
    ||'<tr><td colspan="6">گردشی برای این حساب ثبت نشده است.</td></tr>';
  const reconRows=recon.rows.slice().reverse().slice(0,100).map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.reference||'—')}</td><td>${esc(r.description)}</td><td>${money(Math.abs(r.amountRial))} ${r.amountRial>0?'واریز':'برداشت'}</td><td>${r.matched?'تطبیق‌شده':'تطبیق‌نشده'}</td></tr>`).join('')
    ||'<tr><td colspan="5">صورت‌حساب بانکی وارد نشده است.</td></tr>';
  const chequeRow=(t:typeof txs[0],showActions:boolean)=>{
    const pending=t.chequeStatus==='pending';
    const actions=showActions&&pending
      ?`<button type="button" class="btn btn-sm btn-primary" data-cheque-clear="${t.id}">وصول</button> <button type="button" class="btn btn-sm btn-secondary" data-cheque-bounce="${t.id}">برگشت</button>`
      :chequeSt(t.chequeStatus);
    return `<tr><td>${esc(t.date)}</td><td>${esc(t.number)}</td><td>${partyName(t.partyId)}</td><td>${money(t.amountRial)}</td><td>${esc(t.chequeNumber||'—')}</td><td>${esc(t.chequeDueDate||'—')}</td><td>${actions}</td></tr>`;
  };
  const totalBalance=balances.reduce((s,a)=>s+a.balanceRial,0);
  const balancesRowsHtml = joinRowsOrEmpty(
    balances.map(a=>`<tr><td>${esc(a.code)}</td><td>${esc(a.title)}</td><td>${money(a.balanceRial)}</td></tr>`),
    '<tr><td colspan="3">حساب صندوق/بانک تعریف نشده</td></tr>',
  );
  const recvChequeRowsHtml = limitTableRowItems(
    recvCheques.map(t=>chequeRow(t,true)),
    { emptyHtml: '<tr><td colspan="7">چک دریافتی نیست</td></tr>', limit: 80 },
  );
  const payChequeRowsHtml = limitTableRowItems(
    payCheques.map(t=>chequeRow(t,true)),
    { emptyHtml: '<tr><td colspan="7">چک پرداختی نیست</td></tr>', limit: 80 },
  );
  const reconRowsLimited = limitTableRowItems(
    recon.rows.slice().reverse().map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.reference||'—')}</td><td>${esc(r.description)}</td><td>${money(Math.abs(r.amountRial))} ${r.amountRial>0?'واریز':'برداشت'}</td><td>${r.matched?'تطبیق‌شده':'تطبیق‌نشده'}</td></tr>`),
    { emptyHtml: '<tr><td colspan="5">صورت‌حساب بانکی وارد نشده است.</td></tr>', limit: 100 },
  );
  // ledgerRows already sliced upstream
  return buildBankPanelHtml({
    totalBalanceHtml: money(totalBalance),
    matchedStatHtml: `${fa(reconSum.matched)} / ${fa(reconSum.totalRows)}`,
    unmatchedBankHtml: money(reconSum.unmatchedBankRial),
    balancesRowsHtml,
    accountOptsHtml: opts,
    ledgerRowsHtml: ledgerRows,
    todayJalali: todayJalali(),
    feeOptsHtml: feeOpts,
    recvChequeRowsHtml,
    payChequeRowsHtml,
    reconTotalHtml: fa(reconSum.totalRows),
    reconMatchedHtml: fa(reconSum.matched),
    reconUnmatchedHtml: fa(reconSum.unmatched),
    reconBookBalanceHtml: money(reconSum.bookBalanceRial),
    reconRowsHtml: reconRowsLimited,
  });
}
async function chequePanel():Promise<string>{
  if (!commerce) return '<p class="hint">داده بازرگانی بارگذاری نشده است.</p>';
  return buildChequePanelHtml({ commerce, money, esc, fa });
}
async function agingPanel():Promise<string>{
  const parts=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const today=`${parts.find(x=>x.type==='year')?.value}/${parts.find(x=>x.type==='month')?.value}/${parts.find(x=>x.type==='day')?.value}`;
  const d=await getAgingDashboard(today);
  const bucketLabels:Record<AgingBucket,string>={current:'سررسیدنشده', '1_30':'۱ تا ۳۰ روز', '31_60':'۳۱ تا ۶۰ روز', '61_90':'۶۱ تا ۹۰ روز', over_90:'بیش از ۹۰ روز'};
  const bucketRows=(Object.keys(bucketLabels) as AgingBucket[]).map(k=>`<tr><td>${bucketLabels[k]}</td><td>${money(d.buckets[k])}</td></tr>`).join('');
  const invoiceRows=d.invoices.slice(0,100).map(i=>`<tr><td>${esc(i.number)}</td><td>${i.type==='sale'?'مطالبه از مشتری':'بدهی به تأمین‌کننده'}</td><td>${esc(i.partyName)}</td><td>${esc(i.dueDate)}</td><td>${i.overdueDays?fa(i.overdueDays)+' روز':'—'}</td><td>${money(i.outstandingRial)}</td></tr>`).join('')||'<tr><td colspan="6">فاکتور قطعی دارای مانده وجود ندارد.</td></tr>';
  const chequeRows=[...d.overdueCheques,...d.dueSoonCheques].map(c=>`<tr><td>${esc(c.chequeNumber||c.number)}</td><td>${c.type==='receipt'?'دریافتنی':'پرداختنی'}</td><td>${esc(c.partyName)}</td><td>${esc(c.dueDate)}</td><td>${c.risk==='overdue'?`معوق · ${fa(c.overdueDays)} روز`:'سررسید تا ۷ روز'}</td><td>${money(c.amountRial)}</td></tr>`).join('')||'<tr><td colspan="6">چک معوق یا نزدیک سررسید وجود ندارد.</td></tr>';
  return `<div class="card" style="margin-top:12px"><h3>داشبورد مطالبات، بدهی‌ها و ریسک سررسید</h3><p class="hint">تاریخ مبنای گزارش: ${esc(today)} · فقط فاکتورهای قطعی و مانده پس از تخصیص دریافت‌ها/پرداخت‌ها محاسبه شده‌اند.</p><div class="form-grid"><div class="stat-card"><b>${money(d.receivableRial)}</b><span>مطالبات باز از مشتریان</span></div><div class="stat-card"><b>${money(d.payableRial)}</b><span>بدهی باز به تأمین‌کنندگان</span></div><div class="stat-card"><b>${money(d.netPositionRial)}</b><span>خالص مطالبات منهای بدهی‌ها</span></div><div class="stat-card"><b>${money(d.overdueReceivableRial)}</b><span>مطالبات سررسیدگذشته</span></div><div class="stat-card"><b>${money(d.overduePayableRial)}</b><span>بدهی سررسیدگذشته</span></div><div class="stat-card"><b>${money(d.chequesReceivableRial+d.chequesPayableRial)}</b><span>چک‌های در جریان</span></div></div><h4>سن مطالبات و بدهی‌ها</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>بازه</th><th>مجموع مانده</th></tr></thead><tbody>${bucketRows}</tbody></table></div><h4>فاکتورهای دارای مانده</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>شماره</th><th>نوع</th><th>طرف حساب</th><th>سررسید</th><th>تأخیر</th><th>مانده</th></tr></thead><tbody>${invoiceRows}</tbody></table></div><h4>چک‌های معوق و نزدیک سررسید</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>شماره چک</th><th>نوع</th><th>طرف حساب</th><th>سررسید</th><th>ریسک</th><th>مبلغ</th></tr></thead><tbody>${chequeRows}</tbody></table></div><p class="hint">این داشبورد گزارش مدیریتی است و هیچ سند حسابداری، فاکتور یا وضعیت چکی را تغییر نمی‌دهد. چک‌های ظهرنویسی‌شده پس از خروج از مالکیت شرکت در گردش زنجیره‌ای مراحل قبلی گزارش می‌شوند.</p></div>`;
}

async function cashflowPanel():Promise<string>{
  const parts=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const today=`${parts.find(x=>x.type==='year')?.value}/${parts.find(x=>x.type==='month')?.value}/${parts.find(x=>x.type==='day')?.value}`;
  const d=await getCashflowDashboard(today);
  const forecastRows=d.forecast.slice(0,100).map(x=>`<tr><td>${esc(x.date)}</td><td>${x.source==='invoice'?'مانده فاکتور':'چک در جریان'}</td><td>${esc(x.reference)}</td><td>${esc(x.partyName)}</td><td>${x.inflowRial?money(x.inflowRial):'—'}</td><td>${x.outflowRial?money(x.outflowRial):'—'}</td></tr>`).join('')||'<tr><td colspan="6">در بازه آینده، مورد سررسیدداری ثبت نشده است.</td></tr>';
  const partyRows=d.parties.slice(0,50).map(x=>`<tr><td>${esc(x.partyName)}</td><td>${x.role==='customer'?'مشتری':'تأمین‌کننده'}</td><td>${money(x.invoicedRial)}</td><td>${money(x.allocatedRial)}</td><td>${money(x.outstandingRial)}</td><td>${fa(Math.round(x.collectionPercent))}٪</td></tr>`).join('')||'<tr><td colspan="6">برای رتبه‌بندی، فاکتور قطعی و تخصیص پرداخت ثبت نشده است.</td></tr>';
  return `<div class="card" style="margin-top:12px"><h3>پیش‌بینی جریان نقد و رفتار پرداخت</h3><p class="hint">مبنای گزارش: ${esc(today)} · پیش‌بینی بر اساس سررسید فاکتورهای قطعی و چک‌های در جریان است؛ ارقام قطعیِ آینده نیستند.</p><div class="form-grid"><div class="stat-card"><b>${money(d.next7InRial)}</b><span>ورودی پیش‌بینی‌شده تا ۷ روز</span></div><div class="stat-card"><b>${money(d.next7OutRial)}</b><span>خروجی پیش‌بینی‌شده تا ۷ روز</span></div><div class="stat-card"><b>${money(d.next30InRial)}</b><span>ورودی پیش‌بینی‌شده تا ۳۰ روز</span></div><div class="stat-card"><b>${money(d.next30OutRial)}</b><span>خروجی پیش‌بینی‌شده تا ۳۰ روز</span></div><div class="stat-card"><b>${money(d.next60InRial)}</b><span>ورودی پیش‌بینی‌شده تا ۶۰ روز</span></div><div class="stat-card"><b>${money(d.next60OutRial)}</b><span>خروجی پیش‌بینی‌شده تا ۶۰ روز</span></div></div><h4>تقویم سررسیدهای پیش‌رو</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>تاریخ</th><th>منبع</th><th>شماره</th><th>طرف حساب</th><th>ورودی</th><th>خروجی</th></tr></thead><tbody>${forecastRows}</tbody></table></div><h4>رتبه‌بندی رفتار پرداخت طرف‌حساب‌ها</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>طرف حساب</th><th>نقش</th><th>فاکتور قطعی</th><th>پرداخت تخصیص‌یافته</th><th>مانده باز</th><th>نسبت تخصیص</th></tr></thead><tbody>${partyRows}</tbody></table></div><p class="hint">نسبت پرداخت فقط از مبالغ تخصیص‌یافته به فاکتورهای قطعی محاسبه می‌شود؛ پرداخت‌های علی‌الحساب در این نسبت منظور نمی‌شوند. این گزارش سود خالص یا توان اعتباری قطعی اشخاص را ادعا نمی‌کند و هیچ سند یا داده‌ای را تغییر نمی‌دهد.</p></div>`;
}

/** گزارش تحلیلی موجودی راکد و حاشیه پایین — فقط‌خواندنی */
async function inventoryMarginAnalyticsPanel():Promise<string>{
  if(!commerce) return '';
  const costing=await loadInventoryCostData();
  const idleDays=Number(digits((el<HTMLInputElement>('#analyticsIdleDays')?.value||'90')).replace(',','.'))||90;
  const lowMargin=Number(digits((el<HTMLInputElement>('#analyticsLowMargin')?.value||'10')).replace(',','.'))||10;
  const highVol=Number(digits((el<HTMLInputElement>('#analyticsHighVol')?.value||'10')).replace(',','.'))||10;
  const a=buildInventoryMarginAnalytics(commerce,costing,products,{
    idleDays,
    lowMarginPercent:lowMargin,
    highVolumeQty:highVol,
  });
  const slow=a.slowMoving.slice(0,80).map(r=>`<tr>
    <td>${esc(r.productName)}</td><td>${esc(r.warehouse)}</td><td>${fa(r.quantityMilli/1000)}</td>
    <td>${money(r.valueRial)}</td>
    <td>${r.neverSold?'هرگز فروخته نشده':esc(r.lastSaleDate||'—')}</td>
    <td>${r.neverSold?'—':fa(r.daysSinceSale||0)}</td>
  </tr>`).join('')||'<tr><td colspan="6">با آستانه فعلی کالای راکدی یافت نشد.</td></tr>';
  const low=a.lowMarginSales.slice(0,80).map(r=>`<tr>
    <td>${esc(r.date)}</td><td>${esc(r.invoiceNumber)}</td><td>${esc(r.productName)}</td>
    <td>${esc(r.customerName)}</td><td>${money(r.revenueRial)}</td><td>${money(r.grossProfitRial)}</td>
    <td>${fa(Math.round(r.marginPercent*10)/10)}٪</td>
  </tr>`).join('')||'<tr><td colspan="7">فروش کم‌حاشیه در آستانه فعلی یافت نشد.</td></tr>';
  const vol=a.highVolumeLowMargin.slice(0,50).map(r=>`<tr>
    <td>${esc(r.productName)}</td><td>${fa(r.quantityMilli/1000)}</td>
    <td>${money(r.revenueRial)}</td><td>${money(r.grossProfitRial)}</td>
    <td>${fa(Math.round(r.marginPercent*10)/10)}٪</td>
  </tr>`).join('')||'<tr><td colspan="5">کالای پرفروش با حاشیه پایین یافت نشد.</td></tr>';
  return `<div class="card" style="margin-top:12px"><h3>تحلیل موجودی راکد و حاشیه سود</h3>
<p class="hint">گزارش فقط‌خواندنی است و هیچ سند یا موجودی‌ای را تغییر نمی‌دهد. آستانه‌ها را تنظیم و «بازمحاسبه» را بزنید.</p>
<div class="form-grid" style="margin:10px 0">
  <label class="field">روز راکد (از آخرین فروش)<input id="analyticsIdleDays" inputmode="numeric" value="${fa(idleDays)}"></label>
  <label class="field">حداکثر حاشیه٪ (کم‌حاشیه)<input id="analyticsLowMargin" inputmode="decimal" value="${fa(lowMargin)}"></label>
  <label class="field">حداقل تعداد پرفروش<input id="analyticsHighVol" inputmode="decimal" value="${fa(highVol)}"></label>
  <div style="display:flex;align-items:end"><button type="button" class="btn btn-secondary" id="analyticsRefresh">بازمحاسبه</button></div>
</div>
<div class="form-grid">
  <div class="stat-card"><b>${fa(a.slowMoving.length)}</b><span>کالای راکد / کم‌گردش</span></div>
  <div class="stat-card"><b>${fa(a.lowMarginSales.length)}</b><span>ردیف فروش کم‌حاشیه</span></div>
  <div class="stat-card"><b>${fa(a.highVolumeLowMargin.length)}</b><span>پرفروش با حاشیه پایین</span></div>
  <div class="stat-card"><b>${money(a.slowMoving.reduce((s,x)=>s+x.valueRial,0))}</b><span>ارزش موجودی راکد</span></div>
</div>
<h4 style="margin:14px 0 8px">موجودی راکد / کم‌گردش</h4>
<div class="table-wrap"><table class="data-table"><thead><tr>
  <th>کالا</th><th>انبار</th><th>موجودی</th><th>ارزش</th><th>آخرین فروش</th><th>روز از فروش</th>
</tr></thead><tbody>${slow}</tbody></table></div>
<h4 style="margin:14px 0 8px">فروش با حاشیه پایین یا زیان</h4>
<div class="table-wrap"><table class="data-table"><thead><tr>
  <th>تاریخ</th><th>فاکتور</th><th>کالا</th><th>مشتری</th><th>فروش</th><th>سود ناخالص</th><th>حاشیه</th>
</tr></thead><tbody>${low}</tbody></table></div>
<h4 style="margin:14px 0 8px">پرفروش با حاشیه ضعیف</h4>
<div class="table-wrap"><table class="data-table"><thead><tr>
  <th>کالا</th><th>تعداد فروش</th><th>فروش</th><th>سود ناخالص</th><th>حاشیه</th>
</tr></thead><tbody>${vol}</tbody></table></div>
</div>`;
}

async function profitabilityPanel():Promise<string>{
  const d=await getProfitabilityDashboard(profitabilityFilter);
  const adjusted=await getExpenseAdjustedProfitability(d,profitabilityFilter);
  const periodRows=await getProfitabilityPeriodComparison(profitabilityFilter);
  const trendRows=await getMonthlyProfitabilityTrend(profitabilityFilter);
  const trendMax=Math.max(1,...trendRows.map(x=>Math.max(x.salesRial,x.grossProfitRial,x.expensesRial)));
  const trendBars=trendRows.map(x=>`<div style="padding:9px 0;border-bottom:1px solid var(--border-color,#ddd)"><b>${esc(x.month)}</b><div style="display:grid;grid-template-columns:90px 1fr auto;gap:8px;align-items:center;margin-top:5px"><span>فروش</span><div style="height:9px;background:var(--border-color,#ddd);border-radius:8px;overflow:hidden"><div style="height:100%;width:${Math.max(0,Math.min(100,x.salesRial/trendMax*100))}%;background:#2878bd"></div></div><small>${money(x.salesRial)}</small><span>سود ناخالص</span><div style="height:9px;background:var(--border-color,#ddd);border-radius:8px;overflow:hidden"><div style="height:100%;width:${Math.max(0,Math.min(100,x.grossProfitRial/trendMax*100))}%;background:#26945e"></div></div><small>${money(x.grossProfitRial)}</small><span>هزینه گروه ۶</span><div style="height:9px;background:var(--border-color,#ddd);border-radius:8px;overflow:hidden"><div style="height:100%;width:${Math.max(0,Math.min(100,x.expensesRial/trendMax*100))}%;background:#c58a27"></div></div><small>${money(x.expensesRial)}</small></div><p class="hint" style="margin:4px 0 0">سود پس از هزینه ثبت‌شده: ${money(x.adjustedProfitRial)}</p></div>`).join('')||'<p class="hint">برای نمایش روند، فاکتور فروش قطعی یا سند هزینه تاریخ‌دار در بازه انتخاب‌شده لازم است.</p>';
  const periodComparisonRows=periodRows.map(x=>`<tr><td>${esc(x.periodTitle)}</td><td>${esc(x.startDate)} تا ${esc(x.endDate)}</td><td>${money(x.salesRial)}</td><td>${money(x.costedSalesRial)}</td><td>${money(x.cogsRial)}</td><td>${money(x.grossProfitRial)}</td><td>${money(x.postedExpensesRial)}</td><td>${money(x.adjustedProfitRial)}</td><td>${fa(Math.round(x.marginPercent*10)/10)}٪</td><td>${money(x.uncostedRevenueRial)}</td></tr>`).join('')||'<tr><td colspan="10">سال مالی تعریف‌شده‌ای برای مقایسه وجود ندارد.</td></tr>';

  const productRows=d.products.slice(0,50).map(x=>`<tr><td>${esc(x.name)}</td><td>${fa(x.quantityMilli/1000)}</td><td>${money(x.revenueRial)}</td><td>${money(x.costRial)}</td><td>${money(x.grossProfitRial)}</td><td>${fa(Math.round(x.marginPercent*10)/10)}٪</td></tr>`).join('')||'<tr><td colspan="6">برای محاسبه، فروش قطعی دارای بهای تمام‌شده ثبت‌شده لازم است.</td></tr>';
  const customerRows=d.customers.slice(0,50).map(x=>`<tr><td>${esc(x.name)}</td><td>${money(x.revenueRial)}</td><td>${money(x.costRial)}</td><td>${money(x.grossProfitRial)}</td><td>${fa(Math.round(x.marginPercent*10)/10)}٪</td></tr>`).join('')||'<tr><td colspan="5">اطلاعات سودآوری قابل محاسبه وجود ندارد.</td></tr>';
  const expenseRows=adjusted.expenseAccounts.map(x=>`<tr><td>${esc(x.code)}</td><td>${esc(x.title)}</td><td>${money(x.amountRial)}</td></tr>`).join('')||'<tr><td colspan="3">هزینه قطعی در حساب‌های گروه ۶ ثبت نشده است.</td></tr>';
  const adjustedProductRows=adjusted.products.slice(0,50).map(x=>`<tr><td>${esc(x.name)}</td><td>${money(x.revenueRial)}</td><td>${money(x.allocatedExpenseRial)}</td><td>${money(x.adjustedProfitRial)}</td><td>${fa(Math.round(x.adjustedMarginPercent*10)/10)}٪</td></tr>`).join('')||'<tr><td colspan="5">داده کافی برای تخصیص هزینه وجود ندارد.</td></tr>';
  const adjustedCustomerRows=adjusted.customers.slice(0,50).map(x=>`<tr><td>${esc(x.name)}</td><td>${money(x.revenueRial)}</td><td>${money(x.allocatedExpenseRial)}</td><td>${money(x.adjustedProfitRial)}</td><td>${fa(Math.round(x.adjustedMarginPercent*10)/10)}٪</td></tr>`).join('')||'<tr><td colspan="5">داده کافی برای تخصیص هزینه وجود ندارد.</td></tr>';
  return `<div class="card" style="margin-top:12px"><h3>تحلیل سود ناخالص کالا و مشتری</h3><div class="form-grid" style="margin:10px 0"><label class="field">سال مالی<select id="profitabilityPeriod"><option value="">همه سال‌های مالی</option>${(await getProfitabilityPeriodComparison()).map(x=>`<option value="${esc(x.periodId)}" ${profitabilityFilter.fiscalPeriodId===x.periodId?'selected':''}>${esc(x.periodTitle)}</option>`).join('')}</select></label><label class="field">از تاریخ شمسی<input id="profitabilityFrom" placeholder="1405/01/01" value="${esc(profitabilityFilter.fromDate||'')}"></label><label class="field">تا تاریخ شمسی<input id="profitabilityTo" placeholder="1405/12/29" value="${esc(profitabilityFilter.toDate||'')}"></label><button class="btn btn-primary" id="profitabilityApplyFilter" type="button">اعمال فیلتر</button><button class="btn btn-secondary" id="profitabilityClearFilter" type="button">پاک‌کردن فیلتر</button><button class="btn btn-secondary" id="profitabilityExportXlsx" type="button">خروجی Excel همین بازه</button><button class="btn btn-secondary" id="profitabilityPrintPdf" type="button">چاپ / PDF همین بازه</button></div><p class="hint">گزارش فقط‌خواندنی بر اساس فاکتورهای فروش قطعی و گردش بهای تمام‌شده انبار؛ هزینه‌های عملیاتی، مالیات و هزینه‌های سربار در سود خالص لحاظ نشده‌اند.</p><div class="form-grid"><div class="stat-card"><b>${money(d.salesRial)}</b><span>کل فروش قطعی</span></div><div class="stat-card"><b>${money(d.costedSalesRial)}</b><span>فروش دارای بهای معتبر</span></div><div class="stat-card"><b>${money(d.cogsRial)}</b><span>بهای تمام‌شده کالای فروش‌رفته</span></div><div class="stat-card"><b>${money(d.grossProfitRial)}</b><span>سود ناخالص قابل محاسبه</span></div><div class="stat-card"><b>${fa(Math.round(d.marginPercent*10)/10)}٪</b><span>حاشیه سود ناخالص</span></div></div><p class="hint">فروش فاقد بهای قابل اتکا: ${money(d.uncostedRevenueRial)} · فروش با بهای موقت ناشی از کسری موجودی: ${money(d.provisionalRevenueRial)}. این مبالغ از محاسبه سود کنار گذاشته شده‌اند.</p><h4>روند ماهانه فروش، سود و هزینه‌ها</h4><p class="hint">طول میله‌ها نسبت به بیشترین مقدار همین نمودار مقیاس شده است؛ سود پس از هزینه، شاخص مدیریتی است و سود خالص رسمی محسوب نمی‌شود.</p><div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin-bottom:8px"><span>■ فروش</span><span>■ سود ناخالص</span><span>■ هزینه گروه ۶</span></div><div>${trendBars}</div><h4>سودآوری کالاها</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>کالا</th><th>مقدار</th><th>فروش</th><th>بهای تمام‌شده</th><th>سود ناخالص</th><th>حاشیه</th></tr></thead><tbody>${productRows}</tbody></table></div><h4>سودآوری مشتریان</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>مشتری</th><th>فروش</th><th>بهای تمام‌شده</th><th>سود ناخالص</th><th>حاشیه</th></tr></thead><tbody>${customerRows}</tbody></table></div><p class="hint">فاکتورهای پیش‌نویس، ردیف‌های خدماتی بدون بهای انبار، و فروش‌های دارای بهای موقت در سود محاسبه نمی‌شوند.</p><hr><h3>تخصیص تحلیلی هزینه‌ها و سود تعدیل‌شده</h3><p class="hint">هزینه‌های ثبت‌شده در اسناد قطعی حساب‌های گروه ۶، به نسبت فروش دارای بهای معتبر بین کالاها و مشتریان سرشکن شده‌اند. این تخصیص صرفاً گزارشی است و هیچ سند حسابداری یا گردش مالی را تغییر نمی‌دهد.</p><div class="form-grid"><div class="stat-card"><b>${money(adjusted.totalPostedExpensesRial)}</b><span>خالص هزینه ثبت‌شده در حساب‌های گروه ۶</span></div><div class="stat-card"><b>${money(adjusted.allocatedExpensesRial)}</b><span>هزینه تخصیص‌یافته به فروش‌های بهای‌دار</span></div><div class="stat-card"><b>${money(adjusted.unallocatedExpensesRial)}</b><span>هزینه تخصیص‌نیافته</span></div><div class="stat-card"><b>${money(adjusted.adjustedProfitRial)}</b><span>سود پس از کسر هزینه تخصیص‌یافته</span></div><div class="stat-card"><b>${fa(Math.round(adjusted.adjustedMarginPercent*10)/10)}٪</b><span>حاشیه پس از تخصیص هزینه</span></div></div><h4>ترکیب هزینه‌های ثبت‌شده</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>کد حساب</th><th>عنوان حساب</th><th>خالص هزینه</th></tr></thead><tbody>${expenseRows}</tbody></table></div><h4>سود تعدیل‌شده کالاها</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>کالا</th><th>فروش معتبر</th><th>هزینه تخصیصی</th><th>سود تعدیل‌شده</th><th>حاشیه</th></tr></thead><tbody>${adjustedProductRows}</tbody></table></div><h4>سود تعدیل‌شده مشتریان</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>مشتری</th><th>فروش معتبر</th><th>هزینه تخصیصی</th><th>سود تعدیل‌شده</th><th>حاشیه</th></tr></thead><tbody>${adjustedCustomerRows}</tbody></table></div><p class="hint">مهم: این عدد «سود خالص رسمی» نیست؛ هزینه‌های گروه ۶ ممکن است مربوط به دوره‌های متفاوت یا درآمدهای خارج از فروش انبار باشند. تخصیص بر اساس نسبت فروش انجام شده و برای گزارش مدیریتی است. برای صورت سود و زیان رسمی، گزارش حسابداری با فیلتر سال مالی و تاریخ مبنا قرار گیرد.</p><hr><h3>مقایسه نموداری سال‌های مالی</h3><div>${periodRows.map(x=>{const max=Math.max(1,...periodRows.map(y=>Math.max(y.salesRial,y.grossProfitRial,y.postedExpensesRial)));return `<div style="padding:7px 0"><b>${esc(x.periodTitle)}</b><div style="display:grid;grid-template-columns:80px 1fr auto;gap:7px;align-items:center"><span>فروش</span><div style="height:8px;background:var(--border-color,#ddd);border-radius:8px;overflow:hidden"><div style="height:100%;width:${x.salesRial/max*100}%;background:#2878bd"></div></div><small>${money(x.salesRial)}</small><span>سود ناخالص</span><div style="height:8px;background:var(--border-color,#ddd);border-radius:8px;overflow:hidden"><div style="height:100%;width:${Math.max(0,x.grossProfitRial)/max*100}%;background:#26945e"></div></div><small>${money(x.grossProfitRial)}</small><span>هزینه</span><div style="height:8px;background:var(--border-color,#ddd);border-radius:8px;overflow:hidden"><div style="height:100%;width:${Math.max(0,x.postedExpensesRial)/max*100}%;background:#c58a27"></div></div><small>${money(x.postedExpensesRial)}</small></div></div>`}).join('')||'<p class="hint">دوره مالی برای نمودار وجود ندارد.</p>'}</div><h3>مقایسه عملکرد سال‌های مالی</h3><p class="hint">هر ردیف فقط شامل فاکتورهای فروش و اسناد هزینه قطعی همان سال مالی است. فروش فاقد بهای معتبر جداگانه نمایش داده می‌شود و از سود ناخالص کنار گذاشته شده است.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>سال مالی</th><th>بازه شمسی</th><th>فروش</th><th>فروش بهای‌دار</th><th>بهای تمام‌شده</th><th>سود ناخالص</th><th>هزینه گروه ۶</th><th>سود تعدیل‌شده</th><th>حاشیه ناخالص</th><th>فروش بی‌بها/موقت</th></tr></thead><tbody>${periodComparisonRows}</tbody></table></div><p class="hint">سود تعدیل‌شده این جدول یک شاخص مدیریتی است، نه سود خالص رسمی؛ تخصیص هزینه‌ها همچنان بر مبنای نسبت فروش دارای بهای معتبر انجام می‌شود.</p></div>`;
}

async function managementDashboardPanel():Promise<string>{
  const parts=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const today=`${parts.find(x=>x.type==='year')?.value}/${parts.find(x=>x.type==='month')?.value}/${parts.find(x=>x.type==='day')?.value}`;
  const periods=await getProfitabilityPeriodComparison();
  const selectedPeriod=periods.find(x=>x.periodId===managementFilter.fiscalPeriodId);
  const from=managementFilter.fromDate||selectedPeriod?.startDate||'';
  const to=managementFilter.toDate||selectedPeriod?.endDate||'';
  const anchor=to||today;
  const filter:ProfitabilityFilter={...managementFilter};
  const [aging,cashflow,profitability,banks,monthlyTrend]=await Promise.all([getAgingDashboard(anchor),getCashflowDashboard(anchor),getProfitabilityDashboard(filter),getBankAccountBalances(),getMonthlyProfitabilityTrend(filter)]);
  const normalize=(v:string)=>digits(String(v||'')).replace(/-/g,'/').slice(0,10);
  const inRange=(v:string)=>{const d=normalize(v);return (!from||d>=normalize(from))&&(!to||d<=normalize(to));};
  const postedSales=(commerce!.invoices||[]).filter(i=>i.status==='posted'&&i.type==='sale'&&inRange(i.date));
  const monthSales=postedSales.reduce((sum,i)=>sum+i.grossRial,0);
  const lowStock=products.filter(p=>Number.isFinite(Number(p.minQty))&&p.minQty!==null&&p.minQty!==undefined&&p.systemQty<=Number(p.minQty));
  const stockValueQty=products.reduce((sum,p)=>sum+Math.max(0,Number(p.systemQty)||0),0);
  const bankBalance=banks.reduce((sum,a)=>sum+a.balanceRial,0);
  const net30=cashflow.next30InRial-cashflow.next30OutRial;
  const alerts=[
    aging.overdueReceivableRial>0?`مطالبات سررسیدگذشته: ${money(aging.overdueReceivableRial)}`:'مطالبه سررسیدگذشته‌ای شناسایی نشد',
    lowStock.length?`${fa(lowStock.length)} قلم کالا در حداقل موجودی یا پایین‌تر قرار دارد`:'کالای زیر حداقل موجودی ثبت نشده است',
    aging.overdueCheques.length?`${fa(aging.overdueCheques.length)} چک در جریان سررسیدگذشته دارد`:'چک سررسیدگذشته‌ای شناسایی نشد'
  ];
  const selectedLabel=managementFilter.fiscalPeriodId?(selectedPeriod?.periodTitle||'سال مالی انتخاب‌شده'):'همه سال‌های مالی';
  const monthKey=(value:string)=>digits(String(value||'')).replace(/[^0-9]/g,'').slice(0,6);
  const monthly=new Map(monthlyTrend.map(x=>[x.month,{...x,receiptsRial:0,paymentsRial:0,receivableRial:0}]));
  for(const tx of commerce!.cashTransactions){
    if(!inRange(tx.date)||tx.chequeStatus==='bounced'||tx.chequeStatus==='void'||(tx.method==='cheque'&&tx.chequeStatus!=='cleared'))continue;
    const key=monthKey(tx.date);if(key.length!==6)continue;const month=`${key.slice(0,4)}/${key.slice(4,6)}`;
    const row=monthly.get(month)||{month,salesRial:0,grossProfitRial:0,expensesRial:0,adjustedProfitRial:0,receiptsRial:0,paymentsRial:0,receivableRial:0};
    if(tx.type==='receipt')row.receiptsRial+=tx.amountRial;else row.paymentsRial+=tx.amountRial;monthly.set(month,row);
  }
  for(const invoice of commerce!.invoices){
    if(invoice.status!=='posted'||invoice.type!=='sale'||!inRange(invoice.date))continue;
    const key=monthKey(invoice.date);if(key.length!==6)continue;const month=`${key.slice(0,4)}/${key.slice(4,6)}`;
    const row=monthly.get(month)||{month,salesRial:0,grossProfitRial:0,expensesRial:0,adjustedProfitRial:0,receiptsRial:0,paymentsRial:0,receivableRial:0};
    row.receivableRial+=invoiceOutstanding(invoice.id,commerce!);monthly.set(month,row);
  }
  const trendRows=[...monthly.values()].sort((a,b)=>a.month.localeCompare(b.month)).slice(-18);
  const trendMax=Math.max(1,...trendRows.flatMap(x=>[x.salesRial,x.grossProfitRial,x.expensesRial,x.receiptsRial,x.paymentsRial,x.receivableRial]));
  const accountingData=await loadAccountingData();
  const monthOf=(value:string)=>monthKey(value).slice(0,6);
  const monthDetails=(month:string)=>{
    const invoices=commerce!.invoices.filter(i=>i.status==='posted'&&i.type==='sale'&&monthOf(i.date)===month.replace('/','')&&inRange(i.date));
    const transactions=commerce!.cashTransactions.filter(t=>monthOf(t.date)===month.replace('/','')&&inRange(t.date)&&t.chequeStatus!=='bounced'&&t.chequeStatus!=='void'&&(t.method!=='cheque'||t.chequeStatus==='cleared'));
    const expenses=accountingData.journalEntries.filter(j=>j.status==='posted'&&monthOf(j.date)===month.replace('/','')&&inRange(j.date)).flatMap(j=>j.lines.map(line=>{const account=accountingData.accounts.find(a=>a.id===line.accountId);const code=line.accountCodeSnapshot||account?.code||'';const amount=Number(line.debitRial||0)-Number(line.creditRial||0);return code.startsWith('6')&&amount!==0?{number:j.number,date:j.date,description:line.description||j.description,account:line.accountTitleSnapshot||account?.title||code,amount}:null}).filter((x):x is {number:string;date:string;description:string;account:string;amount:number}=>!!x));
    const invoiceRows=invoices.map(i=>{const party=commerce!.parties.find(p=>p.id===i.partyId);return `<tr><td>${esc(i.number)}</td><td>${esc(i.date)}</td><td>${esc(party?.name||'—')}</td><td>${money(i.grossRial)}</td></tr>`}).join('')||'<tr><td colspan="4">فاکتور فروش قطعی ندارد.</td></tr>';
    const cashRows=transactions.map(t=>{const party=commerce!.parties.find(p=>p.id===t.partyId);return `<tr><td>${t.type==='receipt'?'دریافت':'پرداخت'}</td><td>${esc(t.number)}</td><td>${esc(t.date)}</td><td>${esc(party?.name||'—')}</td><td>${money(t.amountRial)}</td></tr>`}).join('')||'<tr><td colspan="5">دریافت یا پرداخت قطعی ندارد.</td></tr>';
    const expenseRows=expenses.map(x=>`<tr><td>${esc(x.number)}</td><td>${esc(x.date)}</td><td>${esc(x.account)}</td><td>${esc(x.description)}</td><td>${money(x.amount)}</td></tr>`).join('')||'<tr><td colspan="5">هزینه ثبت‌شده در حساب‌های گروه ۶ ندارد.</td></tr>';
    return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button type="button" class="btn btn-sm btn-secondary" data-management-month-xlsx="${esc(month)}" data-management-month-from="${esc(from)}" data-management-month-to="${esc(to)}">خروجی Excel این ماه</button><button type="button" class="btn btn-sm btn-secondary" data-management-month-pdf="${esc(month)}" data-management-month-from="${esc(from)}" data-management-month-to="${esc(to)}">چاپ / PDF این ماه</button></div><div class="table-wrap"><h5>فاکتورهای فروش قطعی</h5><table class="data-table"><thead><tr><th>شماره</th><th>تاریخ</th><th>مشتری</th><th>مبلغ</th></tr></thead><tbody>${invoiceRows}</tbody></table></div><div class="table-wrap"><h5>دریافت‌ها و پرداخت‌های قطعی</h5><table class="data-table"><thead><tr><th>نوع</th><th>شماره</th><th>تاریخ</th><th>طرف حساب</th><th>مبلغ</th></tr></thead><tbody>${cashRows}</tbody></table></div><div class="table-wrap"><h5>ریز هزینه‌های قطعی گروه ۶</h5><table class="data-table"><thead><tr><th>سند</th><th>تاریخ</th><th>حساب</th><th>شرح</th><th>خالص هزینه</th></tr></thead><tbody>${expenseRows}</tbody></table></div>`;
  };
  const comparisonMetrics=[['فروش قطعی','salesRial'],['سود ناخالص','grossProfitRial'],['هزینه ثبت‌شده گروه ۶','expensesRial'],['دریافت قطعی','receiptsRial'],['پرداخت قطعی','paymentsRial'],['مانده فعلی مطالبات','receivableRial']] as const;
  const initialCurrent=trendRows[trendRows.length-1]?.month||'';
  const initialPrevious=trendRows[trendRows.length-2]?.month||initialCurrent;
  const comparisonMonthOptions=trendRows.map(x=>`<option value="${esc(x.month)}" ${x.month===initialPrevious?'data-first-default="1"':''} ${x.month===initialCurrent?'data-second-default="1"':''}>${esc(x.month)}</option>`).join('');
  const comparisonHtml=(first:string,second:string)=>{const a=trendRows.find(x=>x.month===first),b=trendRows.find(x=>x.month===second);if(!a||!b)return '<p class="hint">برای مقایسه، دست‌کم یک ماه دارای داده لازم است.</p>';const rows=comparisonMetrics.map(([label,key])=>{const av=Number(a[key]||0),bv=Number(b[key]||0),delta=bv-av,pct=av===0?null:delta/Math.abs(av)*100;return `<tr><td>${label}</td><td>${money(av)}</td><td>${money(bv)}</td><td>${delta>0?'+':''}${money(delta)}</td><td>${pct===null?'—':`${pct>0?'+':''}${pct.toFixed(1)}٪`}</td></tr>`}).join('');return `<div class="table-wrap"><table class="data-table"><thead><tr><th>شاخص</th><th>${esc(first)}</th><th>${esc(second)}</th><th>اختلاف (ماه دوم − اول)</th><th>تغییر درصدی</th></tr></thead><tbody>${rows}</tbody></table></div><p class="hint">درصد تغییر نسبت به ماه اول محاسبه می‌شود؛ اگر مقدار ماه اول صفر باشد، درصد تغییر قابل محاسبه نیست.</p>`};
  const anomalyHtml=(threshold:number)=>{const alerts=detectManagementMonthAnomalies(trendRows,threshold);if(!alerts.length)return '<p class="hint">در آستانه انتخابی، تغییر غیرعادی معناداری در ماه‌های دارای داده پیدا نشد. تغییرات با مبنای صفر برای جلوگیری از درصد گمراه‌کننده نادیده گرفته می‌شوند.</p>';return `<div class="table-wrap"><table class="data-table"><thead><tr><th>وضعیت</th><th>شاخص</th><th>بازه مقایسه</th><th>مقدار قبلی</th><th>مقدار جدید</th><th>تغییر</th></tr></thead><tbody>${alerts.map(a=>`<tr><td>${a.severity==='warning'?'نیازمند بررسی':'بهبود'}</td><td>${a.label}</td><td>${esc(a.previousMonth)} ← ${esc(a.month)}</td><td>${money(a.previousValue)}</td><td>${money(a.currentValue)}</td><td>${a.percentChange>0?'+':''}${a.percentChange.toFixed(1)}٪</td></tr>`).join('')}</tbody></table></div><p class="hint">هشدارها تحلیلی‌اند؛ کاهش فروش/سود/دریافت و افزایش هزینه/پرداخت/مطالبات به‌عنوان وضعیت نیازمند بررسی علامت‌گذاری می‌شود.</p>`;};
  const trendHtml=trendRows.length?trendRows.map(x=>{const bar=(label:string,value:number,color:string)=>`<div style="display:grid;grid-template-columns:92px minmax(50px,1fr) auto;gap:7px;align-items:center;margin:4px 0"><small>${label}</small><div style="height:9px;background:var(--border-color,#ddd);border-radius:8px;overflow:hidden"><div style="height:100%;width:${Math.max(0,Math.min(100,value/trendMax*100))}%;background:${color}"></div></div><small>${money(value)}</small></div>`;return `<div style="padding:9px 0;border-bottom:1px solid var(--border-color,#ddd)"><button type="button" class="btn btn-secondary btn-sm" data-management-month="${esc(x.month)}" aria-expanded="false">مشاهده جزئیات ${esc(x.month)}</button>${bar('فروش',x.salesRial,'#2878bd')}${bar('سود ناخالص',x.grossProfitRial,'#26945e')}${bar('هزینه ثبت‌شده',x.expensesRial,'#c58a27')}${bar('دریافت قطعی',x.receiptsRial,'#168a83')}${bar('پرداخت قطعی',x.paymentsRial,'#b85b5b')}${bar('مانده فعلی مطالبات',x.receivableRial,'#8064a2')}<div id="managementMonthDetail_${x.month.replace('/','')}" hidden style="margin-top:10px;padding:10px;background:var(--surface-color,#f7f7f7);border-radius:8px">${monthDetails(x.month)}</div></div>`}).join(''):'<p class="hint">برای بازه انتخابی داده ماهانه‌ای جهت نمودار وجود ندارد.</p>';
  // نمودار ستونی SVG ماهانه (فروش / سود / هزینه)
  const chartMax=Math.max(1,...trendRows.map(x=>Math.max(x.salesRial,x.grossProfitRial,x.expensesRial,0)));
  const chartW=Math.max(320,trendRows.length*56+40);
  const chartH=180;
  const chartPad={t:16,r:12,b:36,l:12};
  const plotH=chartH-chartPad.t-chartPad.b;
  const groupW=trendRows.length? (chartW-chartPad.l-chartPad.r)/trendRows.length : 40;
  const barW=Math.max(4,Math.min(14,(groupW-8)/3));
  const chartBars=trendRows.map((x,i)=>{
    const gx=chartPad.l+i*groupW+groupW/2;
    const hSales=Math.round((Math.max(0,x.salesRial)/chartMax)*plotH);
    const hProfit=Math.round((Math.max(0,x.grossProfitRial)/chartMax)*plotH);
    const hExp=Math.round((Math.max(0,x.expensesRial)/chartMax)*plotH);
    const y0=chartPad.t+plotH;
    const label=esc(x.month.length>=7?x.month.slice(5):x.month);
    return `<g>
      <rect x="${gx-barW*1.5-2}" y="${y0-hSales}" width="${barW}" height="${hSales}" fill="#2878bd" rx="2"><title>فروش ${esc(x.month)}: ${money(x.salesRial)}</title></rect>
      <rect x="${gx-barW/2}" y="${y0-hProfit}" width="${barW}" height="${hProfit}" fill="#26945e" rx="2"><title>سود ${esc(x.month)}: ${money(x.grossProfitRial)}</title></rect>
      <rect x="${gx+barW/2+2}" y="${y0-hExp}" width="${barW}" height="${hExp}" fill="#c58a27" rx="2"><title>هزینه ${esc(x.month)}: ${money(x.expensesRial)}</title></rect>
      <text x="${gx}" y="${chartH-10}" text-anchor="middle" font-size="10" fill="currentColor">${label}</text>
    </g>`;
  }).join('');
  const trendChartSvg=trendRows.length?`<div class="management-trend-chart" style="margin:12px 0;padding:12px;border:1px solid var(--border-color,#ddd);border-radius:12px;overflow-x:auto">
  <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px;font-size:12px">
    <span><i style="display:inline-block;width:10px;height:10px;background:#2878bd;border-radius:2px;margin-left:4px"></i>فروش</span>
    <span><i style="display:inline-block;width:10px;height:10px;background:#26945e;border-radius:2px;margin-left:4px"></i>سود ناخالص</span>
    <span><i style="display:inline-block;width:10px;height:10px;background:#c58a27;border-radius:2px;margin-left:4px"></i>هزینه</span>
  </div>
  <svg viewBox="0 0 ${chartW} ${chartH}" width="100%" height="${chartH}" role="img" aria-label="نمودار ماهانه فروش و سود">
    <line x1="${chartPad.l}" y1="${chartPad.t+plotH}" x2="${chartW-chartPad.r}" y2="${chartPad.t+plotH}" stroke="var(--border-color,#ccc)" stroke-width="1"/>
    ${chartBars}
  </svg>
</div>`:'';
  (window as any).__anbarinManagementCompareRows=trendRows;
  return `<section class="card" style="margin-top:12px;border-inline-start:4px solid var(--primary-color,#2878bd)"><h2 style="margin-top:0">داشبورد مدیریتی یکپارچه</h2><p class="hint">نمای کلی عملیات بر اساس داده‌های ثبت‌شده · تاریخ مبنا: ${esc(anchor)} · مبالغ به ${currency==='toman'?'تومان':'ریال'}</p>
  <div class="form-grid" style="margin:10px 0"><label class="field">سال مالی داشبورد<select id="managementPeriod"><option value="">همه سال‌های مالی</option>${periods.map(x=>`<option value="${esc(x.periodId)}" ${managementFilter.fiscalPeriodId===x.periodId?'selected':''}>${esc(x.periodTitle)}</option>`).join('')}</select></label><label class="field">از تاریخ شمسی<input id="managementFrom" placeholder="1405/01/01" value="${esc(managementFilter.fromDate||'')}"></label><label class="field">تا تاریخ شمسی<input id="managementTo" placeholder="1405/12/29" value="${esc(managementFilter.toDate||'')}"></label><button class="btn btn-primary" id="managementApplyFilter" type="button">اعمال فیلتر داشبورد</button><button class="btn btn-secondary" id="managementClearFilter" type="button">نمایش همه دوره‌ها</button><button class="btn btn-secondary" id="managementExportXlsx" type="button">خروجی Excel داشبورد</button><button class="btn btn-secondary" id="managementPrintPdf" type="button">چاپ / PDF داشبورد</button></div>
  <p class="hint">فیلتر فعال: ${esc(selectedLabel)}${from||to?` · بازه ${esc(from||'ابتدا')} تا ${esc(to||'امروز')}`:''}. شاخص‌های موجودی و مانده بانک/صندوق، وضعیت فعلی هستند و به بازه تاریخی محدود نمی‌شوند.</p>
  <div class="form-grid">
  <div class="stat-card"><b>${money(monthSales)}</b><span>فروش قطعی در بازه انتخابی</span></div>
  <div class="stat-card"><b>${money(profitability.grossProfitRial)}</b><span>سود ناخالص قابل محاسبه در بازه</span></div>
  <div class="stat-card"><b>${money(aging.receivableRial)}</b><span>مطالبات باز تا تاریخ مبنا</span></div>
  <div class="stat-card"><b>${money(aging.payableRial)}</b><span>بدهی‌های باز تا تاریخ مبنا</span></div>
  <div class="stat-card"><b>${money(bankBalance)}</b><span>مانده دفتری فعلی بانک و صندوق</span></div>
  <div class="stat-card"><b>${money(net30)}</b><span>خالص جریان نقد پیش‌بینی‌شده ۳۰ روز از تاریخ مبنا</span></div>
  <div class="stat-card"><b>${fa(products.length)}</b><span>تعداد اقلام کالا</span></div>
  <div class="stat-card"><b>${fa(lowStock.length)}</b><span>کالاهای در حداقل موجودی</span></div>
  <div class="stat-card"><b>${fa(stockValueQty)}</b><span>جمع تعداد موجودی ثبت‌شده</span></div>
  <div class="stat-card"><b>${fa(postedSales.length)}</b><span>فاکتورهای فروش قطعی در بازه</span></div>
  </div><h3>هشدار تغییرات غیرعادی ماهانه</h3><p class="hint">تغییر شاخص‌ها بین ماه‌های متوالیِ دارای داده بررسی می‌شود. این بخش فقط هشدار مدیریتی می‌دهد و هیچ داده‌ای را تغییر نمی‌دهد.</p><div class="form-grid" style="margin:8px 0"><label class="field">حد آستانه تغییر<select id="managementAnomalyThreshold"><option value="10">۱۰٪</option><option value="20" selected>۲۰٪</option><option value="30">۳۰٪</option><option value="50">۵۰٪</option></select></label></div><div id="managementAnomalyAlerts">${anomalyHtml(20)}</div><h3>مقایسه عملکرد دو ماه</h3><p class="hint">دو ماه را از داده‌های همین بازه و سال مالی انتخاب کنید؛ اختلاف مبلغ و درصد تغییر شاخص‌ها نمایش داده می‌شود.</p><div class="form-grid" style="margin:8px 0"><label class="field">ماه اول (مبنای مقایسه)<select id="managementCompareFirst">${comparisonMonthOptions.replace('data-first-default="1"','selected')}</select></label><label class="field">ماه دوم<select id="managementCompareSecond">${comparisonMonthOptions.replace('data-second-default="1"','selected')}</select></label></div><div id="managementMonthComparison">${comparisonHtml(initialPrevious,initialCurrent)}</div><h3>روند ماهانه شاخص‌های مدیریتی</h3><p class="hint">برای بازکردن جزئیات هر ماه، دکمه «مشاهده جزئیات» را انتخاب کنید. اطلاعات شامل فاکتورهای فروش، دریافت‌ها، پرداخت‌ها و ریز هزینه‌های ثبت‌شده است.</p>${trendChartSvg}<div>${trendHtml}</div><p class="hint">توجه: مانده مطالبات در این نمودار، مانده فعلی فاکتورهای فروش است که بر اساس ماه صدور فاکتور دسته‌بندی شده؛ این عدد مانده تاریخی پایان هر ماه نیست. دریافت/پرداخت چکی تا زمان وصول یا تسویه قطعی در جریان نقد واقعی لحاظ نمی‌شود. برای پیش‌بینی، شاخص خالص جریان نقد ۳۰ روزه در بالای داشبورد نمایش داده شده است.</p><h4>هشدارها و موارد نیازمند پیگیری</h4><ul>${alerts.map(x=>`<li style="margin:6px 0">${esc(x)}</li>`).join('')}</ul><p class="hint">تعاریف: فروش و سود بر اساس فیلتر تاریخ/سال مالی؛ مطالبات و بدهی‌ها تا تاریخ مبنا؛ جریان نقد ۳۰ روز از تاریخ مبنا پیش‌بینی می‌شود. مانده بانک و صندوق و موجودی کالا وضعیت فعلی هستند، نه مانده تاریخی. سود ناخالص فقط از فروش دارای بهای معتبر محاسبه می‌شود.</p></section>`;
}

async function inventoryReconciliationPanel():Promise<string>{
  const [costing,accounting]=await Promise.all([loadInventoryCostData(),loadAccountingData()]);
  const report=buildInventoryReconciliation(products,costing,accounting);
  const issueLabel=(issue:string|null)=>issue==='quantity-mismatch'?'اختلاف تعداد':issue==='value-missing'?'بدون ارزش معتبر':issue==='negative-balance'?'موجودی منفی':issue==='orphan-cost-balance'?'کالای حذف‌شده در فهرست':'بدون مغایرت';
  const rows=report.rows.slice(0,300).map(r=>`<tr><td>${esc(r.productName)}</td><td>${esc(r.warehouse)}</td><td>${fa(r.systemQtyMilli/1000)}</td><td>${fa(r.costQtyMilli/1000)}</td><td>${fa(r.quantityDiffMilli/1000)}</td><td>${money(r.valueRial)}</td><td>${issueLabel(r.issue)}</td></tr>`).join('')||'<tr><td colspan="7">کالایی برای تطبیق وجود ندارد.</td></tr>';
  return `<div class="card" style="margin-top:12px"><h3>تطبیق موجودی انبار و حسابداری</h3><p class="hint">این گزارش فقط‌خواندنی است؛ موجودی عملیاتی، دفتر بهای تمام‌شده و حساب معین موجودی کالا را مقایسه می‌کند. هیچ مقدار، سند یا مانده‌ای به‌صورت خودکار اصلاح نمی‌شود.</p><div class="form-grid"><div class="stat-card"><b>${fa(report.totalProducts)}</b><span>ردیف کالا / انبار</span></div><div class="stat-card"><b>${fa(report.issueCount)}</b><span>ردیف نیازمند بررسی</span></div><div class="stat-card"><b>${fa(report.systemQuantityMilli/1000)}</b><span>جمع تعداد عملیاتی</span></div><div class="stat-card"><b>${fa(report.costQuantityMilli/1000)}</b><span>جمع تعداد بهای تمام‌شده</span></div><div class="stat-card"><b>${money(report.inventoryValueRial)}</b><span>ارزش دفتر بهای تمام‌شده</span></div><div class="stat-card"><b>${money(report.ledgerInventoryRial)}</b><span>مانده حساب موجودی در دفتر کل</span></div></div><p class="hint">اختلاف تعداد: ${fa(report.quantityDiffMilli/1000)} · اختلاف ارزش (بهای تمام‌شده منهای دفتر کل): ${money(report.ledgerDiffRial)} · ${report.ledgerAccountFound?'حساب دفتر کل: '+esc(report.ledgerAccountTitle):'حساب معین موجودی کالا پیدا نشد.'}</p><div class="table-wrap"><table class="data-table"><thead><tr><th>کالا</th><th>انبار</th><th>تعداد عملیاتی</th><th>تعداد بهای تمام‌شده</th><th>اختلاف</th><th>ارزش موجودی</th><th>وضعیت</th></tr></thead><tbody>${rows}</tbody></table></div><p class="hint">توجه: مقایسه دفتر کل با ارزش فعلی بهای تمام‌شده، فقط زمانی قابل اتکاست که ثبت‌های موجودی از ابتدای دوره به‌طور کامل در هر دو زیرسیستم انجام شده باشند. اسناد دستی، موجودی افتتاحیه قدیمی، حذف کالا و گردش‌های خارج از فاکتور می‌توانند اختلاف ایجاد کنند. برای بررسی کامل، ردیف‌های مغایر و اسناد مبدأ را کنترل کنید.</p></div>`;
}

/** پنل بهای استاندارد و انحراف قیمت خرید */
async function inventoryStandardCostPanel():Promise<string>{
  if(!commerce) return '';
  const withStd=products.filter(p=>Math.round(Number(p.standardCostRial)||0)>0);
  const withoutStd=products.filter(p=>(Number(p.systemQty)||0)>0 && Math.round(Number(p.standardCostRial)||0)<=0).slice(0,40);
  const varianceRows=buildPurchaseStandardVariance(commerce.invoices,products);
  const totalVar=varianceRows.reduce((s,r)=>s+r.varianceRial,0);
  const unfav=varianceRows.filter(r=>r.varianceRial>0).reduce((s,r)=>s+r.varianceRial,0);
  const fav=varianceRows.filter(r=>r.varianceRial<0).reduce((s,r)=>s+r.varianceRial,0);
  const vtable=varianceRows.slice(0,150).map(r=>`<tr>
    <td>${esc(r.date)}</td><td>${esc(r.invoiceNumber)}</td><td>${esc(r.productName)}</td>
    <td>${fa(r.quantityMilli/1000)}</td>
    <td>${money(r.standardUnitRial)}</td><td>${money(r.actualUnitRial)}</td>
    <td>${money(r.varianceRial)}</td>
  </tr>`).join('')||'<tr><td colspan="7">هنوز خرید قطعی با کالای دارای بهای استاندارد ثبت نشده است.</td></tr>';
  const missing=withoutStd.map(p=>`<tr><td>${esc(p.name)}</td><td>${fa(Number(p.systemQty)||0)}</td><td>${money(Number(p.purchasePrice)||0)}</td></tr>`).join('')
    ||'<tr><td colspan="3">همه کالاهای دارای موجودی، بهای استاندارد دارند یا موجودی صفر است.</td></tr>';
  return `<div class="card" style="margin-top:12px"><h3>بهای استاندارد و انحراف قیمت خرید</h3>
<p class="hint">اگر روی کارت کالا «بهای استاندارد» بیشتر از صفر باشد، در فاکتور خرید قطعی موجودی با بهای استاندارد ثبت می‌شود و اختلاف با قیمت واقعی (+ هزینه جانبی) به‌عنوان انحراف قیمت خرید در حساب ۵۱۰۳۰۱ شناسایی می‌گردد. کالاهای بدون بهای استاندارد مثل قبل با بهای واقعی ثبت می‌شوند.</p>
<div class="form-grid">
  <div class="stat-card"><b>${fa(withStd.length)}</b><span>کالا با بهای استاندارد</span></div>
  <div class="stat-card"><b>${money(totalVar)}</b><span>جمع انحراف (واقعی − استاندارد)</span></div>
  <div class="stat-card"><b>${money(unfav)}</b><span>انحراف نامساعد</span></div>
  <div class="stat-card"><b>${money(fav)}</b><span>انحراف مساعد</span></div>
</div>
<h4 style="margin:14px 0 8px">آخرین انحرافات خرید</h4>
<div class="table-wrap"><table class="data-table"><thead><tr>
  <th>تاریخ</th><th>فاکتور</th><th>کالا</th><th>تعداد</th><th>استاندارد واحد</th><th>واقعی واحد</th><th>انحراف</th>
</tr></thead><tbody>${vtable}</tbody></table></div>
<h4 style="margin:14px 0 8px">کالاهای دارای موجودی بدون بهای استاندارد</h4>
<div class="table-wrap"><table class="data-table"><thead><tr><th>کالا</th><th>موجودی</th><th>قیمت خرید کارت</th></tr></thead><tbody>${missing}</tbody></table></div>
</div>`;
}

/** پنل NRV — حداقل بهای تمام‌شده و خالص ارزش فروش (IAS 2) */
async function inventoryNrvPanel():Promise<string>{
  const costing=await loadInventoryCostData();
  const pctEl=typeof document!=='undefined'?document.getElementById('nrvSellingCostPct') as HTMLInputElement|null:null;
  const sellingCostPercent=pctEl?Number(digits(pctEl.value||'0').replace(',','.'))||0:0;
  const rows=buildNrvAnalysis(costing,products,{sellingCostPercent});
  const needWriteDown=rows.filter(r=>r.writeDownRial>0);
  const totalCost=rows.reduce((s,r)=>s+r.costValueRial,0);
  const totalReported=rows.reduce((s,r)=>s+r.reportedValueRial,0);
  const totalWd=rows.reduce((s,r)=>s+r.writeDownRial,0);
  const tableRows=rows.slice(0,200).map(r=>`<tr>
    <td>${esc(r.productName)}</td><td>${esc(r.warehouse)}</td><td>${fa(r.quantityMilli/1000)}</td>
    <td>${money(r.costValueRial)}</td>
    <td>${r.hasSellingPrice?money(r.nrvValueRial):'<span class="hint">قیمت فروش ندارد</span>'}</td>
    <td>${money(r.reportedValueRial)}</td>
    <td>${money(r.writeDownRial)}</td>
    <td>${r.writeDownRial>0?`<button type="button" class="btn btn-sm btn-secondary" data-nrv-write-down="${esc(r.productId)}" data-nrv-wh="${esc(r.warehouse)}" data-nrv-amount="${r.writeDownRial}">ثبت کاهش ارزش</button>`:'—'}</td>
  </tr>`).join('')||'<tr><td colspan="8">موجودی با بهای ثبت‌شده یافت نشد.</td></tr>';
  return `<div class="card" style="margin-top:12px"><h3>NRV — خالص ارزش فروش (IAS 2)</h3>
<p class="hint">ارزش گزارش‌شده موجودی = حداقلِ بهای تمام‌شده و خالص ارزش فروش. قیمت فروش از کارت کالا (قیمت فروش / مصرف‌کننده) خوانده می‌شود. هزینه فروش برآوردی را می‌توانید درصد وارد کنید.</p>
<div class="form-grid" style="margin:10px 0">
  <label class="field">هزینه فروش برآوردی (٪ از قیمت فروش)<input id="nrvSellingCostPct" inputmode="decimal" value="${fa(sellingCostPercent)}" placeholder="۰"></label>
  <div style="display:flex;align-items:end"><button type="button" class="btn btn-secondary" id="nrvRefresh">بازمحاسبه</button></div>
</div>
<div class="form-grid">
  <div class="stat-card"><b>${fa(rows.length)}</b><span>ردیف موجودی</span></div>
  <div class="stat-card"><b>${fa(needWriteDown.length)}</b><span>نیازمند کاهش ارزش</span></div>
  <div class="stat-card"><b>${money(totalCost)}</b><span>جمع بهای تمام‌شده</span></div>
  <div class="stat-card"><b>${money(totalReported)}</b><span>جمع ارزش پس از NRV</span></div>
  <div class="stat-card"><b>${money(totalWd)}</b><span>جمع کاهش ارزش پیشنهادی</span></div>
</div>
<div class="table-wrap" style="margin-top:10px"><table class="data-table"><thead><tr>
  <th>کالا</th><th>انبار</th><th>موجودی</th><th>بهای تمام‌شده</th><th>NRV</th><th>ارزش گزارش‌شده</th><th>کاهش ارزش</th><th>عملیات</th>
</tr></thead><tbody>${tableRows}</tbody></table></div>
<p class="hint">ثبت کاهش ارزش: بدهکار «زیان کاهش ارزش موجودی» و بستانکار «موجودی کالا»؛ تعداد موجودی ثابت می‌ماند و فقط ارزش دفتر بها کاهش می‌یابد.</p>
</div>`;
}



/** ساخت امن پنل‌های انبار — خطای یک زیربخش کل صفحه را خالی نمی‌کند */
async function safeInventoryPanelsHtml(): Promise<string> {
  return buildSafeStackedPanels([
    { label: 'ارزش‌گذاری موجودی اولیه', build: openingStockPanel },
    { label: 'بهای استاندارد و انحراف خرید', build: inventoryStandardCostPanel },
    { label: 'NRV — خالص ارزش فروش', build: inventoryNrvPanel },
    { label: 'تطبیق موجودی انبار و حسابداری', build: inventoryReconciliationPanel },
  ], esc);
}

async function openCommercePanelSheet(section:CommercePanelSection):Promise<void> {
  // بستن برگه‌های تو در تو قبلی تا محتوا گیر نکند
  document.getElementById('invoiceItemsSheet')?.remove();
  document.getElementById('partyFormSheet')?.remove();
  document.getElementById('invoiceTypeSheet')?.remove();
  activeCommerceSection=section;
  if(section==='sale'||section==='purchase'){
    // اگر نوع فعلی با بخش هم‌خوان نیست، نوع پیش‌فرض همان بخش
    if(section==='sale'&&!isSaleInvoiceType(activeInvoiceType)) activeInvoiceType='sale';
    if(section==='purchase'&&!isPurchaseInvoiceType(activeInvoiceType)) activeInvoiceType='purchase';
  }
  if(section!=='sale'&&section!=='purchase') editingInvoiceId=null;
  suppressCommerceSheetReopen=true;
  try {
    await render();
  } catch (e) {
    console.error('[Anbarin] commerce render failed while opening section', section, e);
    suppressCommerceSheetReopen=false;
    // برای انبار: حتی اگر render کامل شکست بخورد، محتوای امن را مستقیم در برگه می‌نشانیم
    if (section === 'inventory') {
      try {
        const sheet = createCommerceSheet(section, () => {
          activeCommerceSection = 'home';
          void render();
        });
        try { sheet.mount.innerHTML = await safeInventoryPanelsHtml(); }
        catch (err) {
          sheet.mount.innerHTML = buildCommercePanelEmptyHtml();
          toast(err instanceof Error ? err.message : 'باز کردن انبار ناموفق بود.', 'error');
        }
        try { bind(); } catch (bindErr) { console.warn('[Anbarin] inventory bind after fallback', bindErr); }
      } catch (sheetErr) {
        console.error('[Anbarin] inventory sheet create failed', sheetErr);
        activeCommerceSection='home';
        toast('باز کردن انبار ناموفق بود.', 'error');
      }
      return;
    }
    // برای سایر بخش‌های ثبت‌شده: تلاش با loader بدون وابستگی به render کامل
    try {
      const sheet = createCommerceSheet(section, () => {
        activeCommerceSection = 'home';
        void render();
      });
      const loaded = await loadCommerceSectionHtml(section, buildCommercePanelEmptyHtml());
      sheet.mount.innerHTML = loaded.html;
      try { bind(); } catch (bindErr) { console.warn('[Anbarin] bind after section fallback', section, bindErr); }
      if (!loaded.fromLoader) {
        activeCommerceSection = 'home';
        toast(e instanceof Error ? e.message : 'باز کردن این بخش ناموفق بود.', 'error');
        sheet.close();
        return;
      }
      return;
    } catch (sheetErr) {
      console.error('[Anbarin] generic section sheet failed', section, sheetErr);
    }
    activeCommerceSection='home';
    toast(e instanceof Error ? e.message : 'باز کردن این بخش ناموفق بود.', 'error');
    return;
  }
  suppressCommerceSheetReopen=false;
  const root=el<HTMLDivElement>('#accountingCommerceWorkspace');
  const sectionKey=commercePanelSectionKey(section);
  const sectionEl=root?.querySelector<HTMLElement>(`[data-commerce-section="${sectionKey}"]`);

  const fillInventoryFallback = async (mount: HTMLElement) => {
    try { mount.innerHTML = await safeInventoryPanelsHtml(); }
    catch (err) {
      console.error('[Anbarin] inventory fallback failed', err);
      mount.innerHTML = buildCommercePanelEmptyHtml();
    }
    try { bind(); } catch (bindErr) { console.warn('[Anbarin] bind after inventory fallback', bindErr); }
  };

  if(!sectionEl){
    const sheet = createCommerceSheet(section, () => {
      activeCommerceSection = 'home';
      void render();
    });
    if (section === 'inventory') {
      await fillInventoryFallback(sheet.mount);
      return;
    }
    const loaded = await loadCommerceSectionHtml(section, buildCommercePanelEmptyHtml());
    sheet.mount.innerHTML = loaded.html;
    try { bind(); } catch (bindErr) { console.warn('[Anbarin] bind after missing section', section, bindErr); }
    if (!loaded.fromLoader) {
      sheet.close();
      activeCommerceSection='home';
      toast('بخش موردنظر پیدا نشد.','error');
    }
    return;
  }
  revealSection(sectionEl);
  let sheetRef: ReturnType<typeof createCommerceSheet> | null = null;
  sheetRef = createCommerceSheet(section, () => {
    // بازگرداندن گره‌ها تا render بعدی تمیز باشد
    if (sheetRef) {
      while (sheetRef.mount.firstChild) sectionEl.appendChild(sheetRef.mount.firstChild);
    }
    activeCommerceSection = 'home';
    void render();
  });
  const sheet = sheetRef;
  moveSectionIntoMount(sectionEl, sheet.mount, buildCommercePanelEmptyHtml());
  if (!sheet.mount.firstChild || (section === 'inventory' && !sheet.mount.querySelector('.card'))) {
    if (section === 'inventory') await fillInventoryFallback(sheet.mount);
  }
  scrollSheetToTop(sheet.overlay, sheet.mount);
  // تقویم و جستجوی کالا پس از انتقال به برگه — ادامه همان queueMicrotask قبلی
  const overlay = sheet.overlay;
  const mount = sheet.mount;
  const close = sheet.close;
  void close; // close already bound inside createCommerceSheet
  void mount;
  // تقویم و جستجوی کالا پس از انتقال به برگه
  queueMicrotask(() => {
    const invDate = overlay.querySelector<HTMLInputElement>('#invoiceDate') || el<HTMLInputElement>('#invoiceDate');
    if (invDate) {
      const btn = overlay.querySelector<HTMLButtonElement>('#invoiceJalaliCalendar') || el<HTMLButtonElement>('#invoiceJalaliCalendar');
      const panel = overlay.querySelector<HTMLDivElement>('#invoiceJalaliCalendarPanel') || el<HTMLDivElement>('#invoiceJalaliCalendarPanel');
      if (btn) delete (btn as HTMLButtonElement).dataset.calBound;
      delete invDate.dataset.calendarEnhanced;
      attachJalaliCalendar(invDate, btn, panel);
    }
    enhanceDateFields(overlay);
  });

}

function openInvoiceTypeSheet():void {
 document.getElementById('invoiceTypeSheet')?.remove();
 const overlay=document.createElement('div');overlay.id='invoiceTypeSheet';overlay.dir='rtl';overlay.style.cssText='position:fixed;inset:0;z-index:10100;background:var(--surface,#fff);color:var(--text,#222);overflow:auto;padding:clamp(16px,4vw,32px)';
 overlay.innerHTML=buildInvoiceTypeSheetHtml();
 document.body.appendChild(overlay);
 overlay.querySelector('#invoiceTypeClose')!.addEventListener('click',()=>overlay.remove());
 overlay.querySelectorAll<HTMLButtonElement>('[data-new-invoice-type]').forEach(b=>b.addEventListener('click',()=>{
  const type=b.dataset.newInvoiceType as InvoiceType;
  if(!['sale','purchase','return-sale','return-purchase','proforma'].includes(type))return;
  activeInvoiceType=type;
  overlay.remove();
  editingInvoiceId=null;
  void openCommercePanelSheet(isSaleInvoiceType(type)?'sale':'purchase').catch((e)=>{console.error('[Anbarin] open invoice sheet failed',e);});
 }));
}
function bindInvoiceProductSearch(root:ParentNode=document):void {
  bindInvoiceProductSearchCore(root, {
    el,
    esc,
    fa,
    digits,
    toast,
    products,
    invoiceProductMatches,
    resolveInvoiceProduct,
    findProductByCode,
    addProductToInvoice,
    addInvoiceLine,
    beginInvoiceScan,
    openScanner,
    offerAddProduct,
  });
}


function openInvoiceItemsSheet():void {
  const scope = document.getElementById('commercePanelSheet') || document.getElementById('accountingCommerceWorkspace') || document;
  const placeholder = (scope.querySelector('#invoiceItemsPlaceholder') || document.querySelector('#invoiceItemsPlaceholder')) as HTMLElement | null;
  if (!placeholder) { toast('فرم فاکتور هنوز آماده نیست.', 'error'); return; }
  document.getElementById('invoiceItemsSheet')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'invoiceItemsSheet';
  overlay.dir = 'rtl';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10120;background:var(--surface,#fff);color:var(--text,#222);overflow:auto;padding:clamp(12px,3vw,28px)';
  overlay.innerHTML = `<div style="max-width:1100px;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h2>اقلام فاکتور</h2><button class="btn btn-primary" id="invoiceItemsBack">تأیید و بازگشت</button></div><div id="invoiceItemsMount" style="margin-top:14px"></div></div>`;
  document.body.appendChild(overlay);
  const mount = overlay.querySelector<HTMLElement>('#invoiceItemsMount')!;
  const pick = (sel: string) => (scope.querySelector(sel) || document.querySelector(sel)) as HTMLElement | null;
  ['.commerce-lines-head', '.invoice-product-tools', '#commerceInvoiceLines', '#invoiceAddLine'].forEach(sel => {
    const node = pick(sel);
    if (node) mount.appendChild(node);
  });
  // پرچم جستجو را پاک کن تا دوباره وصل شود
  const search = mount.querySelector<HTMLInputElement>('#invoiceProductSearch');
  if (search) delete search.dataset.searchBound;

  if (!mount.querySelector('#commerceInvoiceLines .commerce-line')) {
    addInvoiceLine();
  }

  bindInvoiceProductSearch(mount);

  if (search) {
    search.placeholder = 'نام کالا یا بارکد — جستجو کنید';
    search.focus({ preventScroll: true });
  }

  overlay.querySelector('#invoiceItemsBack')!.addEventListener('click', () => {
    ['.commerce-lines-head', '.invoice-product-tools', '#commerceInvoiceLines', '#invoiceAddLine'].forEach(sel => {
      const node = mount.querySelector<HTMLElement>(sel);
      if (node) placeholder.appendChild(node);
    });
    // بعد از برگشت پرچم را پاک کن
    const s = placeholder.querySelector<HTMLInputElement>('#invoiceProductSearch');
    if (s) delete s.dataset.searchBound;
    overlay.remove();
    updateInvoiceTotals();
    const count = document.querySelectorAll('#commerceInvoiceLines .commerce-line').length;
    const summary = document.querySelector('#invoiceItemsSummary') as HTMLElement | null;
    if (summary) summary.textContent = count ? `${fa(count)} قلم` : 'بدون قلم';
  });
}


/** محتوای HTML بخش فعال — یک منبع برای full و targeted render */
async function buildActiveSectionInnerHtml(section: CommercePanelSection): Promise<string> {
  if (section === 'sale' || section === 'purchase') {
    return buildInvoiceSectionHtml({
      sectionMode: section === 'sale' ? 'sale' : 'purchase',
      invoiceType: activeInvoiceType,
      typeTitle: invoiceTypeTitle(activeInvoiceType),
      invoiceNumber: esc(nextInvoiceNumber(activeInvoiceType)),
      partyLabel: isSaleInvoiceType(activeInvoiceType) ? 'خریدار' : 'فروشنده',
      partyOptionsHtml: partyOptions(isSaleInvoiceType(activeInvoiceType) ? 'customer' : 'supplier'),
      todayJalali: todayJalali(),
      taxDetailsHtml: buildInvoiceTaxDetailsHtml(),
      landedCostsHtml: activeInvoiceType === 'purchase' ? buildInvoiceLandedCostsHtml() : '',
      summaryExtraHtml: activeInvoiceType === 'purchase' ? `<div><span>هزینه جانبی</span><b id="invoiceLandedSummary">—</b></div>` : '',
      profitPanelHtml: activeInvoiceType === 'sale' ? buildInvoiceInternalProfitPanelHtml() : '',
      settleHidden: activeInvoiceType === 'proforma',
      printInternalBtnHtml: activeInvoiceType === 'sale' ? `<button class="btn btn-secondary" id="invoicePrintInternal" type="button" title="چاپ داخلی با سود ناخالص">چاپ داخلی</button>` : '',
      partyColumnLabel: section === 'sale' ? 'مشتری' : 'تأمین‌کننده',
      invoiceRowsHtml: invoiceRows(activeInvoiceType),
      invoiceListFooterHtml: invoiceListFooter(activeInvoiceType),
    });
  }
  if (section === 'management') {
    return `${await managementDashboardPanel()}${await profitabilityPanel()}`;
  }
  if (section === 'inventory') return safeInventoryPanelsHtml();
  if (section === 'receipts') {
    return buildCashEntryPanelHtml({
      partyOptionsHtml: partyOptions('customer'),
      accountOptionsHtml: accountOptions(),
      cashRowsHtml: cashRows(),
    });
  }
  if (section === 'parties') return partiesPanelHtml();
  if (section === 'operating') return operatingPanelHtml();
  if (section === 'cheques') return chequePanel();
  if (section === 'aging') return agingPanel();
  if (section === 'banking') return bankPanel();
  return '';
}

async function fillWorkspaceSection(root: HTMLElement, section: CommercePanelSection): Promise<void> {
  const key = section === 'sale' || section === 'purchase' ? 'invoices' : commercePanelSectionKey(section);
  const sectionEl = root.querySelector<HTMLElement>(`[data-commerce-section="${key}"]`);
  if (!sectionEl) return;
  sectionEl.innerHTML = await buildActiveSectionInnerHtml(section);
}

async function render():Promise<void> {
  const root=el<HTMLDivElement>('#accountingCommerceWorkspace'); if(!root||!commerce)return;
  const reopenSheet: CommercePanelSection | null = activeCommerceSection!=='home' ? activeCommerceSection : null;
  // هنگام ذخیره پیش‌نویس/تسویه برگه باز را خراب نکن
  if(!suppressCommerceSheetReopen){
    document.getElementById('commercePanelSheet')?.remove();
    document.getElementById('invoiceItemsSheet')?.remove();
    if(!document.getElementById('accountingModuleSheet')){
      document.body.classList.remove('accounting-sheet-open');
    }
  }
  root.setAttribute('dir','rtl');

  // رندر هدفمند هنگام باز کردن برگه: فقط بخش فعال پر می‌شود
  const shellReady = root.dataset.commerceShell === '1' && !!root.querySelector('.commerce-home') && !!root.querySelector('[data-commerce-section]');
  if (shellReady && suppressCommerceSheetReopen && activeCommerceSection !== 'home') {
    setCommerceSectionVisibility(root, activeCommerceSection, commercePanelSectionKey);
    try {
      await fillWorkspaceSection(root, activeCommerceSection);
      const itemPlaceholder = root.querySelector<HTMLElement>('#invoiceItemsPlaceholder');
      if (itemPlaceholder) {
        ['.commerce-lines-head', '.invoice-product-tools', '#commerceInvoiceLines', '#invoiceAddLine'].forEach((sel) => {
          const node = root.querySelector<HTMLElement>(sel);
          if (node) itemPlaceholder.appendChild(node);
        });
      }
      if (activeCommerceSection === 'sale' || activeCommerceSection === 'purchase') {
        addInvoiceLine();
        addInvoicePaymentRow();
      }
      bind();
      enhanceCommerceSelects();
      void applyDefaultPartySelection();
      return;
    } catch (e) {
      console.error('[Anbarin] targeted render failed; falling back to full render', e);
    }
  }

  root.innerHTML=`
  <div class="commerce-home" ${activeCommerceSection==='home'?'':'hidden'}>
    <p class="hint">هر عملیات بازرگانی در برگه تمام‌صفحه جدا باز می‌شود.</p>
    <div class="accounting-home-grid" role="navigation" aria-label="بخش‌های بازرگانی">
      <button type="button" class="accounting-home-tile" id="openInvoiceTypeSheet"><span class="accounting-home-icon invoice" aria-hidden="true">🧾</span><strong>فاکتور</strong><span class="hint">فروش، خرید، برگشت و پیش‌فاکتور</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="parties"><span class="accounting-home-icon party" aria-hidden="true">👤</span><strong>طرف حساب‌ها</strong><span class="hint">تعریف مشتری و تأمین‌کننده</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="receipts"><span class="accounting-home-icon receipt" aria-hidden="true">💵</span><strong>دریافت / پرداخت</strong><span class="hint">نقد، کارت، چک و تخصیص</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="banking"><span class="accounting-home-icon banking" aria-hidden="true">🏦</span><strong>بانک</strong><span class="hint">حساب بانکی و صورت‌حساب</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="operating"><span class="accounting-home-icon expense" aria-hidden="true">📒</span><strong>هزینه و درآمد</strong><span class="hint">ثبت هزینه و درآمد متفرقه</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="inventory"><span class="accounting-home-icon inventory" aria-hidden="true">📦</span><strong>انبار</strong><span class="hint">بهای موجودی و تطبیق</span></button>
    </div>
  </div>
  <section data-commerce-section="invoices" ${activeCommerceSection==='sale'||activeCommerceSection==='purchase'?'':'hidden'}>
  ${activeCommerceSection==='sale'||activeCommerceSection==='purchase'?buildInvoiceSectionHtml({
    sectionMode: activeCommerceSection === 'sale' ? 'sale' : 'purchase',
    invoiceType: activeInvoiceType,
    typeTitle: invoiceTypeTitle(activeInvoiceType),
    invoiceNumber: esc(nextInvoiceNumber(activeInvoiceType)),
    partyLabel: isSaleInvoiceType(activeInvoiceType) ? 'خریدار' : 'فروشنده',
    partyOptionsHtml: partyOptions(isSaleInvoiceType(activeInvoiceType) ? 'customer' : 'supplier'),
    todayJalali: todayJalali(),
    taxDetailsHtml: buildInvoiceTaxDetailsHtml(),
    landedCostsHtml: activeInvoiceType === 'purchase' ? buildInvoiceLandedCostsHtml() : '',
    summaryExtraHtml: activeInvoiceType === 'purchase' ? `<div><span>هزینه جانبی</span><b id="invoiceLandedSummary">—</b></div>` : '',
    profitPanelHtml: activeInvoiceType === 'sale' ? buildInvoiceInternalProfitPanelHtml() : '',
    settleHidden: activeInvoiceType === 'proforma',
    printInternalBtnHtml: activeInvoiceType === 'sale' ? `<button class="btn btn-secondary" id="invoicePrintInternal" type="button" title="چاپ داخلی با سود ناخالص">چاپ داخلی</button>` : '',
    partyColumnLabel: activeCommerceSection === 'sale' ? 'مشتری' : 'تأمین‌کننده',
    invoiceRowsHtml: invoiceRows(activeInvoiceType),
    invoiceListFooterHtml: invoiceListFooter(activeInvoiceType),
  }):''}
  </section>
  <section data-commerce-section="management" ${activeCommerceSection==='management'?'':'hidden'}>
    ${activeCommerceSection==='management'?await managementDashboardPanel():''}
    ${activeCommerceSection==='management'?await profitabilityPanel():''}
    ${activeCommerceSection==='management'?await inventoryMarginAnalyticsPanel():''}
    ${activeCommerceSection==='management'?await cashflowPanel():''}
  </section>
  <section data-commerce-section="inventory" ${activeCommerceSection==='inventory'?'':'hidden'}>
    ${activeCommerceSection==='inventory'?await safeInventoryPanelsHtml():''}
  </section>
  <section data-commerce-section="receipts" ${activeCommerceSection==='receipts'?'':'hidden'}>
    ${activeCommerceSection==='receipts'?buildCashEntryPanelHtml({ partyOptionsHtml: partyOptions('customer'), accountOptionsHtml: accountOptions(), cashRowsHtml: cashRows() }):''}
  </section>
  <section data-commerce-section="parties" ${activeCommerceSection==='parties'?'':'hidden'}>${activeCommerceSection==='parties'?partiesPanelHtml():''}</section>
  <section data-commerce-section="operating" ${activeCommerceSection==='operating'?'':'hidden'}>${activeCommerceSection==='operating'?await operatingPanelHtml():''}</section>
  <section data-commerce-section="cheques" ${activeCommerceSection==='cheques'?'':'hidden'}>${activeCommerceSection==='cheques'?await chequePanel():''}</section>
  <section data-commerce-section="aging" ${activeCommerceSection==='aging'?'':'hidden'}>${activeCommerceSection==='aging'?await agingPanel():''}</section>
  <section data-commerce-section="banking" ${activeCommerceSection==='banking'?'':'hidden'}>${activeCommerceSection==='banking'?await bankPanel():''}</section>`;
  root.dataset.commerceShell = '1';
  const itemPlaceholder=root.querySelector<HTMLElement>('#invoiceItemsPlaceholder');
  if(itemPlaceholder){['.commerce-lines-head','.invoice-product-tools','#commerceInvoiceLines','#invoiceAddLine'].forEach(sel=>{const node=root.querySelector<HTMLElement>(sel);if(node)itemPlaceholder.appendChild(node);});}
  /* data-commerce-tab delegated */

  if(activeCommerceSection==='sale'||activeCommerceSection==='purchase'){
    addInvoiceLine(); addInvoicePaymentRow();
  }
  bind();
  enhanceCommerceSelects();
  void applyDefaultPartySelection();
  if(!suppressCommerceSheetReopen && reopenSheet){
    try { await openCommercePanelSheet(reopenSheet); }
    catch (e) { console.error('[Anbarin] reopen commerce sheet failed', reopenSheet, e); }
  }
}

/** کادرهای انتخاب طولانی (طرف‌حساب، کالا، حساب) را جستجوپذیر می‌کند */
function enhanceCommerceSelects():void {
  const map: { id: string; placeholder: string; min?: number }[] = [
    { id: 'invoiceParty', placeholder: 'جستجوی طرف حساب...' },
    { id: 'cashParty', placeholder: 'جستجوی طرف حساب...' },
    { id: 'cashAccount', placeholder: 'جستجوی حساب صندوق/بانک...', min: 6 },
    { id: 'cashInvoice', placeholder: 'جستجوی فاکتور...', min: 6 },
    { id: 'opParty', placeholder: 'جستجوی طرف حساب...' },
    { id: 'openingCostProduct', placeholder: 'جستجوی کالا...', min: 0 },
  ];
  for (const item of map) {
    const sel = document.getElementById(item.id) as HTMLSelectElement | null;
    if (!sel) continue;
    enhanceSelectWithSearch(sel, { placeholder: item.placeholder, minOptions: item.min ?? 8 });
    refreshSearchableSelect(sel);
  }
  bindPartySmsButtons();
}

async function persist(next:CommerceData):Promise<void>{commerce=next;await saveCommerceData(next);emitCommerceEvent('commerce:updated');render()}
function refreshAccounting():void{emitCommerceEvent('accounting:data-updated');window.dispatchEvent(new Event('accounting:data-updated'))}
function refreshCashInvoices():void {
  if (!commerce) return;
  const type = el<HTMLSelectElement>('#cashType')?.value || 'receipt';
  const partyId = el<HTMLSelectElement>('#cashParty')?.value || '';
  const eligible = commerce.invoices.filter(i =>
    i.status === 'posted' &&
    i.partyId === partyId &&
    ((type === 'receipt' && i.type === 'sale') || (type === 'payment' && i.type === 'purchase')) &&
    invoiceOutstanding(i.id, commerce!) > 0
  );
  const invSel = el<HTMLSelectElement>('#cashInvoice');
  if (!invSel) return;
  invSel.innerHTML = '<option value="">بدون تخصیص (علی‌الحساب)</option>' +
    eligible.map(i => `<option value="${esc(i.id)}">${esc(i.number)} — مانده ${money(invoiceOutstanding(i.id, commerce!))}</option>`).join('');
  refreshSearchableSelect(invSel);
}
function startInvoiceEdit(invoiceId:string):void {
  if(!commerce)return;
  const invoice=commerce.invoices.find(i=>i.id===invoiceId);
  if(!invoice)return;
  if(invoice.status!=='draft'){toast('فاکتور قطعی قابل ویرایش مستقیم نیست؛ برای حفظ سند و گردش انبار باید اصلاحیه ثبت شود.','error');return;}
  editingInvoiceId=invoice.id;
  const set=(selector:string,value:string)=>{const node=el<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>(selector);if(node)node.value=value};
  activeInvoiceType=invoice.type; activeCommerceSection=isSaleInvoiceType(invoice.type)?'sale':'purchase'; set('#invoiceType',invoice.type);
  {
    const partySel=el<HTMLSelectElement>('#invoiceParty');
    if(partySel){
      partySel.innerHTML='<option value="">انتخاب طرف حساب</option>'+partyOptions(isSaleInvoiceType(invoice.type)?'customer':'supplier');
      refreshSearchableSelect(partySel);
    }
  }
  set('#invoiceNumber',invoice.number);set('#invoiceParty',invoice.partyId);set('#invoiceDate',invoice.date);set('#invoiceDueDate','');const paymentHost=el<HTMLDivElement>('#invoicePaymentRows');if(paymentHost)paymentHost.innerHTML='';set('#invoicePaymentTerms','تسویه از برگه مستقل انجام می‌شود');set('#invoiceDescription',invoice.description);set('#invoiceDescriptionVisible',invoice.description);set('#invoiceNotes',invoice.notes||'');set('#invoiceTaxRate',String((invoice.taxRateBps||0)/100));set('#invoiceTax',formatMoneyFromRial(invoice.taxRial,currency));const taxField=el<HTMLInputElement>('#invoiceTax');if(taxField)taxField.dataset.autoFilled='false';
  if(invoice.type==='purchase'){
    const lc=invoice.landedCosts;
    set('#invoiceLandedFreight',formatMoneyFromRial(lc?.freightRial||0,currency));
    set('#invoiceLandedCustoms',formatMoneyFromRial(lc?.customsRial||0,currency));
    set('#invoiceLandedInsurance',formatMoneyFromRial(lc?.insuranceRial||0,currency));
    set('#invoiceLandedOther',formatMoneyFromRial(lc?.otherRial||0,currency));
    set('#invoiceLandedNote',lc?.note||'');
  }
  const host=el<HTMLDivElement>('#commerceInvoiceLines')!;host.innerHTML='';
  for(const line of invoice.lines){
    addInvoiceLine(line.productId||undefined);
    const row=host.lastElementChild as HTMLElement;
    const put=(selector:string,value:string)=>{const node=row.querySelector<HTMLInputElement|HTMLSelectElement>(selector);if(node)node.value=value};
    put('[data-line-desc]',line.description);
    put('[data-line-unit]',line.unit||'عدد');
    put('[data-line-qty]',String(line.quantityMilli/1000));
    put('[data-line-price]',formatMoneyFromRial(line.unitPriceRial,currency));
    put('[data-line-discount]',formatMoneyFromRial(line.discountRial||0,currency));
    const descField=row.querySelector<HTMLInputElement>('[data-line-desc]');
    const descLabel=descField?.closest('label') as HTMLElement|null;
    if(descLabel)descLabel.hidden=!!line.productId;
    const stockField=row.querySelector<HTMLElement>('.invoice-stock-field');
    if(stockField)stockField.hidden=!line.productId;
  }
  updateInvoiceTotals();
  const save=el<HTMLButtonElement>('#invoiceSave');if(save)save.textContent='ذخیره پیش‌نویس';const cancel=el<HTMLButtonElement>('#invoiceCancelEdit');if(cancel)cancel.hidden=false;
  el<HTMLElement>('#invoiceFormTitle')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function cancelInvoiceEdit():void {editingInvoiceId=null;render()}


/** به‌روزرسانی handlerهای delegation یک‌باره؛ listener تکراری اضافه نمی‌کند. */
function updateManagementMonthComparison():void {const first=el<HTMLSelectElement>('#managementCompareFirst')?.value||'';const second=el<HTMLSelectElement>('#managementCompareSecond')?.value||'';const host=el<HTMLDivElement>('#managementMonthComparison');if(!host)return;const metrics=[['فروش قطعی','salesRial'],['سود ناخالص','grossProfitRial'],['هزینه ثبت‌شده گروه ۶','expensesRial'],['دریافت قطعی','receiptsRial'],['پرداخت قطعی','paymentsRial'],['مانده فعلی مطالبات','receivableRial']] as const;const rows=(window as any).__anbarinManagementCompareRows as Array<Record<string,any>>|undefined;const a=rows?.find(x=>x.month===first),b=rows?.find(x=>x.month===second);if(!a||!b){host.innerHTML='<p class="hint">برای مقایسه، داده ماهانه کافی وجود ندارد.</p>';return;}host.innerHTML=`<div class="table-wrap"><table class="data-table"><thead><tr><th>شاخص</th><th>${first}</th><th>${second}</th><th>اختلاف (ماه دوم − اول)</th><th>تغییر درصدی</th></tr></thead><tbody>${metrics.map(([label,key])=>{const av=Number(a[key]||0),bv=Number(b[key]||0),delta=bv-av,pct=av===0?null:delta/Math.abs(av)*100;return `<tr><td>${label}</td><td>${money(av)}</td><td>${money(bv)}</td><td>${delta>0?'+':''}${money(delta)}</td><td>${pct===null?'—':`${pct>0?'+':''}${pct.toFixed(1)}٪`}</td></tr>`}).join('')}</tbody></table></div><p class="hint">درصد تغییر نسبت به ماه اول محاسبه می‌شود؛ اگر مقدار ماه اول صفر باشد، درصد تغییر قابل محاسبه نیست.</p>`;}

function refreshCoreClickHandlers():void {
  installCommerceCoreDelegation(document);
  setCoreClickHandler('openInvoiceTypeSheet', () => openInvoiceTypeSheet());
  setCoreClickHandler('invoiceOpenItems', () => openInvoiceItemsSheet());
  setCoreClickHandler('invoiceAddParty', () => {
    editingPartyId = null;
    openPartyFormSheet({
      preferType: isSaleInvoiceType(activeInvoiceType) ? 'customer' : 'supplier',
      selectAfterSave: true,
    });
  });
  setCoreClickHandler('invoiceCancelEdit', () => cancelInvoiceEdit());
  setCoreClickHandler('openingCostRefresh', () => { void render(); });
  setCoreClickHandler('nrvRefresh', () => { void render(); });
  setCoreClickHandler('analyticsRefresh', () => { void render(); });
  setCoreClickHandler('openingCostBulk', async () => {try{
    const date=digits(el<HTMLInputElement>('#openingCostDate')?.value||'')||todayJalali();
    if(!/^\d{4}\/\d{2}\/\d{2}$/.test(date))throw new Error('تاریخ ارزش‌گذاری را به شکل سال/ماه/روز وارد کنید.');
    const pending=await listPendingOpeningValuation();
    if(!pending.length){toast('کالای در انتظار ارزش‌گذاری نیست.','info');return;}
    const withPrice=pending.filter(x=>x.hasPrice);
    if(!withPrice.length)throw new Error('هیچ کالایی قیمت خرید/فروش ندارد. ابتدا در تعریف کالا قیمت خرید را وارد یا از فایل با ستون قیمت وارد کنید.');
    const costing=await loadInventoryCostData();
    let ok=0, fail=0;
    const errors:string[]=[];
    for(const row of withPrice){
      try{
        const unitCostRial=parseMoneyToRial(String(row.unitHint),currency);
        if(!unitCostRial||unitCostRial<=0){fail++;continue;}
        setOpeningStockCost(costing,{
          productId:row.product.id,
          warehouse:row.warehouse,
          qtyMilli:Math.round(row.qty*1000),
          unitCostRial,
          date,
        });
        ok++;
      }catch(e){
        fail++;
        if(errors.length<5) errors.push(e instanceof Error?e.message:String(e));
      }
    }
    await saveInventoryCostData(costing);
    logAudit('accounting_opening_stock_bulk_valued',{ok,fail,total:pending.length,date});
    const extra=errors.length?` · نمونه خطا: ${errors[0]}`:'';
    toast(`ارزش‌گذاری گروهی: ${fa(ok)} کالا ثبت شد`+(fail?`، ${fa(fail)} ناموفق`:'')+(pending.length-withPrice.length?`، ${fa(pending.length-withPrice.length)} بدون قیمت`:'')+extra, ok? 'success':'error');
    refreshAccounting();
    await render();
  }catch(e){toast(e instanceof Error?e.message:'خطا در ارزش‌گذاری گروهی','error')}});
  setCoreClickHandler('openingCostSave', async () => {try{
    const p=products.find(x=>x.id===el<HTMLSelectElement>('#openingCostProduct')!.value);
    if(!p)throw new Error('کالا را انتخاب کنید.');
    const qty=Number(digits(el<HTMLInputElement>('#openingCostQty')!.value).replace(',','.'));
    if(!Number.isFinite(qty)||qty<=0)throw new Error('تعداد موجودی معتبر نیست.');
    if(Math.abs(qty-(Number(p.systemQty)||0))>0.000001)throw new Error('تعداد باید با موجودی فعلی کالا در انبار برابر باشد.');
    const warehouse=p.warehouse||'انبار اصلی';
    const unitRaw=digits(el<HTMLInputElement>('#openingCostUnit')!.value);
    if(!unitRaw)throw new Error('بهای واحد را وارد کنید (ترجیحاً قیمت خرید).');
    const unitCostRial=parseMoneyToRial(unitRaw,currency);
    const date=digits(el<HTMLInputElement>('#openingCostDate')!.value)||todayJalali();
    const costing=await loadInventoryCostData();
    setOpeningStockCost(costing,{productId:p.id,warehouse,qtyMilli:Math.round(qty*1000),unitCostRial,date});
    await saveInventoryCostData(costing);
    logAudit('accounting_opening_stock_valued',{productId:p.id,warehouse,qty,unitCostRial});
    toast('بهای موجودی اولیه ثبت شد','success');
    await render();
  }catch(e){toast(e instanceof Error?e.message:'خطا در ارزش‌گذاری موجودی','error')}});
  setCoreClickHandler('opSave', async () => {
    try{
      const kind=(el<HTMLSelectElement>('#opKind')?.value||'expense') as 'expense'|'income';
      const operatingAccountId=kind==='expense'
        ?(el<HTMLSelectElement>('#opExpenseAccount')?.value||'')
        :(el<HTMLSelectElement>('#opIncomeAccount')?.value||'');
      const cashAccountId=el<HTMLSelectElement>('#opCashAccount')?.value||'';
      const amountRial=parseMoneyToRial(digits(el<HTMLInputElement>('#opAmount')?.value||'0'),currency);
      const date=digits(el<HTMLInputElement>('#opDate')?.value||'');
      const fiscalPeriodId=el<HTMLSelectElement>('#opPeriod')?.value||await activeFiscalPeriodId();
      const description=el<HTMLInputElement>('#opDescription')?.value||'';
      const partyId=el<HTMLSelectElement>('#opParty')?.value||undefined;
      if(!operatingAccountId)throw new Error(kind==='expense'?'حساب هزینه را انتخاب کنید.':'حساب درآمد را انتخاب کنید.');
      if(!cashAccountId)throw new Error('حساب صندوق یا بانک را انتخاب کنید.');
      await recordOperatingEntry({kind,date,fiscalPeriodId,amountRial,operatingAccountId,cashAccountId,description,partyId});
      logAudit('operating_entry',{kind,amountRial,operatingAccountId,cashAccountId});
      refreshAccounting();
      await render();
      toast(kind==='expense'?'هزینه ثبت و سند حسابداری صادر شد.':'درآمد ثبت و سند حسابداری صادر شد.','success');
    }catch(e){toast(e instanceof Error?e.message:'خطا در ثبت هزینه/درآمد','error')}
  });
  setCoreClickHandler('partySaveBtn', async () => {
    const saved=await savePartyFromForm(false);
    if(saved)await render();
  });
  setCoreClickHandler('partyResetBtn', () => {editingPartyId=null;render();});
  setCoreChangeHandler('opKind', () => {
    const kind = el<HTMLSelectElement>('#opKind')?.value;
    const exp = el<HTMLElement>('#opAccountExpenseWrap');
    const inc = el<HTMLElement>('#opAccountIncomeWrap');
    if (exp) exp.hidden = kind !== 'expense';
    if (inc) inc.hidden = kind !== 'income';
  });
  setCoreAttrHandler('data-edit-invoice', (node) => {
    const id = node.getAttribute('data-edit-invoice');
    if (id) startInvoiceEdit(id);
  });
  setCoreAttrHandler('data-print-invoice', (node) => {
    const id = node.getAttribute('data-print-invoice');
    if (id) printInvoice(id);
  });
  setCoreAttrHandler('data-share-invoice', (node) => {
    const id = node.getAttribute('data-share-invoice');
    if (id) void shareInvoice(id);
  });
  setCoreAttrHandler('data-commerce-tab', (node) => {
    const next = node.getAttribute('data-commerce-tab') as CommercePanelSection | null;
    if (!next) return;
    void openCommercePanelSheet(next).catch((e) => {
      console.error('[Anbarin] openCommercePanelSheet failed', next, e);
      toast(e instanceof Error ? e.message : 'باز کردن بخش بازرگانی ناموفق بود.', 'error');
    });
  });
  setCoreClickHandler('managementApplyFilter', () => {const next:ProfitabilityFilter={fiscalPeriodId:el<HTMLSelectElement>('#managementPeriod')?.value||'',fromDate:digits(el<HTMLInputElement>('#managementFrom')?.value||''),toDate:digits(el<HTMLInputElement>('#managementTo')?.value||'')};if(!next.fiscalPeriodId)delete next.fiscalPeriodId;if(!next.fromDate)delete next.fromDate;if(!next.toDate)delete next.toDate;if(next.fromDate&&next.toDate&&next.fromDate>next.toDate){toast('تاریخ شروع داشبورد نباید بعد از تاریخ پایان باشد','error');return}managementFilter=next;render()});
  setCoreClickHandler('managementClearFilter', () => {managementFilter={};render()});
  setCoreClickHandler('managementExportXlsx', async () => {try{await exportManagementDashboardXlsx(managementFilter);toast('فایل Excel داشبورد آماده شد','success')}catch(e){toast(e instanceof Error?e.message:'ساخت Excel داشبورد ناموفق بود','error')}});
  setCoreClickHandler('managementPrintPdf', async () => {try{await printManagementDashboardPdf(managementFilter)}catch(e){toast(e instanceof Error?e.message:'آماده‌سازی PDF داشبورد ناموفق بود','error')}});
  setCoreClickHandler('profitabilityApplyFilter', () => {profitabilityFilter={fiscalPeriodId:el<HTMLSelectElement>('#profitabilityPeriod')?.value||'',fromDate:digits(el<HTMLInputElement>('#profitabilityFrom')?.value||''),toDate:digits(el<HTMLInputElement>('#profitabilityTo')?.value||'')};if(!profitabilityFilter.fiscalPeriodId)delete profitabilityFilter.fiscalPeriodId;if(!profitabilityFilter.fromDate)delete profitabilityFilter.fromDate;if(!profitabilityFilter.toDate)delete profitabilityFilter.toDate;if(profitabilityFilter.fromDate&&profitabilityFilter.toDate&&profitabilityFilter.fromDate>profitabilityFilter.toDate){toast('تاریخ شروع نباید بعد از تاریخ پایان باشد','error');return}render()});
  setCoreClickHandler('profitabilityClearFilter', () => {profitabilityFilter={};render()});
  setCoreClickHandler('profitabilityExportXlsx', async () => {try{await exportProfitabilityXlsx(profitabilityFilter);toast('فایل Excel گزارش سودآوری آماده شد','success')}catch(e){toast(e instanceof Error?e.message:'ساخت فایل Excel ناموفق بود','error')}});
  setCoreClickHandler('profitabilityPrintPdf', async () => {try{await printProfitabilityPdf(profitabilityFilter)}catch(e){toast(e instanceof Error?e.message:'آماده‌سازی PDF ناموفق بود','error')}});
  setCoreChangeHandler('managementAnomalyThreshold', () => {const threshold=Number(el<HTMLSelectElement>('#managementAnomalyThreshold')?.value||20);const host=el<HTMLDivElement>('#managementAnomalyAlerts');if(!host)return;const rows=(window as any).__anbarinManagementCompareRows as ManagementMonthRow[]|undefined;const alerts=detectManagementMonthAnomalies(rows||[],threshold);host.innerHTML=alerts.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>وضعیت</th><th>شاخص</th><th>بازه مقایسه</th><th>مقدار قبلی</th><th>مقدار جدید</th><th>تغییر</th></tr></thead><tbody>${alerts.map(a=>`<tr><td>${a.severity==='warning'?'نیازمند بررسی':'بهبود'}</td><td>${a.label}</td><td>${esc(a.previousMonth)} ← ${esc(a.month)}</td><td>${money(a.previousValue)}</td><td>${money(a.currentValue)}</td><td>${a.percentChange>0?'+':''}${a.percentChange.toFixed(1)}٪</td></tr>`).join('')}</tbody></table></div><p class="hint">کاهش فروش/سود/دریافت و افزایش هزینه/پرداخت/مطالبات نیازمند بررسی است.</p>`:'<p class="hint">در آستانه انتخابی تغییر غیرعادی معناداری پیدا نشد؛ ماه‌های با مبنای صفر برای جلوگیری از درصد گمراه‌کننده نادیده گرفته می‌شوند.</p>'});
  setCoreChangeHandler('managementCompareFirst', () => updateManagementMonthComparison());
  setCoreChangeHandler('managementCompareSecond', () => updateManagementMonthComparison());

  setCoreAttrHandler('data-management-month', (node) => {
    const month = node.getAttribute('data-management-month') || '';
    const detail = el<HTMLElement>(`#managementMonthDetail_${month.replace('/', '')}`);
    if (!detail) return;
    const opening = detail.hidden;
    detail.hidden = !opening;
    node.setAttribute('aria-expanded', String(opening));
    node.textContent = `${opening ? 'بستن جزئیات' : 'مشاهده جزئیات'} ${month}`;
  });
  setCoreAttrHandler('data-management-month-xlsx', (node) => {
    void (async () => {
      try {
        await exportManagementMonthXlsx(
          node.getAttribute('data-management-month-xlsx') || '',
          node.getAttribute('data-management-month-from') || '',
          node.getAttribute('data-management-month-to') || '',
        );
        toast('فایل Excel جزئیات ماه آماده شد', 'success');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'ساخت Excel جزئیات ماه ناموفق بود', 'error');
      }
    })();
  });
  setCoreAttrHandler('data-management-month-pdf', (node) => {
    void (async () => {
      try {
        await printManagementMonthPdf(
          node.getAttribute('data-management-month-pdf') || '',
          node.getAttribute('data-management-month-from') || '',
          node.getAttribute('data-management-month-to') || '',
        );
      } catch (e) {
        toast(e instanceof Error ? e.message : 'آماده‌سازی PDF جزئیات ماه ناموفق بود', 'error');
      }
    })();
  });

  setCoreAttrHandler('data-nrv-write-down', (node) => {
    void (async () => {
      try {
        const productId = node.getAttribute('data-nrv-write-down') || '';
        if (!productId) return;
        const warehouse = node.getAttribute('data-nrv-wh') || 'انبار اصلی';
        const writeDownRial = Number(node.getAttribute('data-nrv-amount') || 0);
        const p = products.find((x) => x.id === productId);
        if (!p) throw new Error('کالا پیدا نشد.');
        const fiscalPeriodId = await activeFiscalPeriodId();
        await postInventoryNrvWriteDown({
          productId,
          warehouse,
          writeDownRial,
          date: todayJalali(),
          fiscalPeriodId,
          note: `کاهش ارزش NRV — ${p.name}`,
        });
        try { costingCache = await loadInventoryCostData(); } catch (e) { console.error('[Anbarin] ignored error', e); }
        refreshAccounting();
        await render();
        toast('کاهش ارزش موجودی ثبت شد.', 'success');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'خطا در ثبت کاهش ارزش', 'error');
      }
    })();
  });
  setCoreChangeHandler('cashType', () => {const type=el<HTMLSelectElement>('#cashType')!.value;const partySel=el<HTMLSelectElement>('#cashParty');if(partySel){partySel.innerHTML='<option value="">انتخاب طرف حساب</option>'+partyOptions(type==='receipt'?'customer':'supplier');refreshSearchableSelect(partySel);}refreshCashInvoices()});
  setCoreChangeHandler('cashParty', () => { refreshCashInvoices(); });
  setCoreChangeHandler('cashMethod', () => {
    const show=el<HTMLSelectElement>('#cashMethod')!.value==='cheque';
    document.querySelectorAll<HTMLElement>('[data-cheque-field]').forEach(x=>{
      x.hidden=!show;
      x.style.display=show?'':'none';
    });
  });
  setCoreChangeHandler('openingCostProduct', () => {
    const p=products.find(x=>x.id===el<HTMLSelectElement>('#openingCostProduct')!.value);
    if(!p)return;
    const qtyEl=el<HTMLInputElement>('#openingCostQty');
    const unitEl=el<HTMLInputElement>('#openingCostUnit');
    if(qtyEl) qtyEl.value=String(Number(p.systemQty)||0);
    const unit=Number(p.purchasePrice)||Number(p.price)||0;
    if(unitEl && unit>0) unitEl.value=String(unit);
  });
  setCoreClickHandler('invoiceAddPayment', () => { addInvoicePaymentRow(); });
  setCoreClickHandler('invoicePrint', (ev) => {
    ev.preventDefault();
    const run = (window as any).__anbarinInvoicePrintShare as ((k: 'print' | 'share') => Promise<void>) | undefined;
    if (run) void run('print');
  });
  setCoreClickHandler('invoiceShare', (ev) => {
    ev.preventDefault();
    const run = (window as any).__anbarinInvoicePrintShare as ((k: 'print' | 'share') => Promise<void>) | undefined;
    if (run) void run('share');
  });
  setCoreClickHandler('invoicePrintInternal', async (ev) => {
    ev.preventDefault();
    const id=resolveInvoiceForPrint();
    if(!id){toast('ابتدا فاکتور را ذخیره کنید.','error');return;}
    lastPrintableInvoiceId=id;
    if(!costingCache){try{costingCache=await loadInventoryCostData();}catch (e) { console.error('[Anbarin] ignored error', e); }}
    await printInvoice(id,{internal:true});
  });
  setCoreInputHandler('invoiceTax', (event) => {
    (event.target as HTMLInputElement).dataset.autoFilled='false';updateInvoiceTotals();
  });
  setCoreChangeHandler('invoiceTaxRate', () => { applyInvoiceTaxRate(); });
  setCoreInputHandler('invoiceDescriptionVisible', (event) => {
    const hidden = el<HTMLInputElement>('#invoiceDescription');
    if (hidden) hidden.value = (event.target as HTMLInputElement).value;
  });
  for (const landedId of ['invoiceLandedFreight', 'invoiceLandedCustoms', 'invoiceLandedInsurance', 'invoiceLandedOther']) {
    setCoreInputHandler(landedId, () => { updateInvoiceTotals(); });
  }

}


function bind():void {
  refreshCoreClickHandlers();
  queueMicrotask(()=>enhanceDateFields(document));
  
  /* managementCompare*: core change delegation */
updateManagementMonthComparison();
  /* managementAnomalyThreshold: core delegation */

/* مدیریت ماهانه از طریق core delegation متصل می‌شود. */
  /* managementApplyFilter: core delegation */

  /* managementClearFilter: core delegation */

  /* managementExportXlsx: core delegation */

  /* managementPrintPdf: core delegation */

  /* profitabilityApplyFilter: core delegation */

  /* profitabilityClearFilter: core delegation */

  /* profitabilityExportXlsx: core delegation */

  /* profitabilityPrintPdf: core delegation */

  bindBankManagementActions(document, {
    onTransfer: async () => {try{await createInternalTransfer({number:el<HTMLInputElement>('#bankTransferNo')!.value,date:digits(el<HTMLInputElement>('#bankTransferDate')!.value),fiscalPeriodId:await activeFiscalPeriodId(),fromAccountId:el<HTMLSelectElement>('#bankTransferFrom')!.value,toAccountId:el<HTMLSelectElement>('#bankTransferTo')!.value,amountRial:parseMoneyToRial(digits(el<HTMLInputElement>('#bankTransferAmount')!.value),currency),feeRial:parseMoneyToRial(digits(el<HTMLInputElement>('#bankTransferFee')!.value||'0'),currency),feeAccountId:el<HTMLSelectElement>('#bankTransferFeeAccount')!.value,description:el<HTMLInputElement>('#bankTransferDescription')!.value});await render();refreshAccounting();toast('انتقال بین حساب‌ها و سند حسابداری ثبت شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ثبت انتقال','error')}},
    onStatementImport: async () => {try{const file=el<HTMLInputElement>('#bankStatementFile')?.files?.[0];if(!file)throw new Error('ابتدا فایل CSV را انتخاب کنید.');const accountId=el<HTMLSelectElement>('#bankStatementAccount')!.value;const rows=parseBankStatementCsv(await file.text(),accountId);const result=await importBankStatement(rows);await render();toast(`${result.imported} ردیف وارد شد؛ ${result.matched} ردیف به‌صورت خودکار تطبیق یافت.`,'success')}catch(e){toast(e instanceof Error?e.message:'خطا در ورود صورت‌حساب','error')}},
    onMove: async () => {try{const kind=(el<HTMLSelectElement>('#bankMoveKind')?.value||'deposit') as 'deposit'|'withdraw';await createCashBankMove({kind,number:el<HTMLInputElement>('#bankMoveNo')?.value||String(Date.now()).slice(-6),date:digits(el<HTMLInputElement>('#bankMoveDate')?.value||''),fiscalPeriodId:await activeFiscalPeriodId(),cashAccountId:el<HTMLSelectElement>('#bankMoveCash')?.value||'',bankAccountId:el<HTMLSelectElement>('#bankMoveBank')?.value||'',amountRial:parseMoneyToRial(digits(el<HTMLInputElement>('#bankMoveAmount')?.value||'0'),currency),description:el<HTMLInputElement>('#bankMoveDesc')?.value||''});await render();refreshAccounting();toast(kind==='deposit'?'واریز نقد به بانک ثبت شد.':'برداشت از بانک به صندوق ثبت شد.','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ثبت واریز/برداشت','error')}},
    onFee: async () => {try{await createBankFee({number:el<HTMLInputElement>('#bankFeeNo')?.value||String(Date.now()).slice(-6),date:digits(el<HTMLInputElement>('#bankFeeDate')?.value||''),fiscalPeriodId:await activeFiscalPeriodId(),bankAccountId:el<HTMLSelectElement>('#bankFeeBank')?.value||'',feeAccountId:el<HTMLSelectElement>('#bankFeeExpense')?.value||'',amountRial:parseMoneyToRial(digits(el<HTMLInputElement>('#bankFeeAmount')?.value||'0'),currency),description:el<HTMLInputElement>('#bankFeeDesc')?.value||''});await render();refreshAccounting();toast('کارمزد بانکی ثبت و سند صادر شد.','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ثبت کارمزد','error')}},
    onLedgerLoad: async () => {try{const accountId=el<HTMLSelectElement>('#bankLedgerAccount')?.value||'';if(!accountId)throw new Error('حساب را انتخاب کنید.');const rows=await getBankAccountLedger(accountId);const body=el<HTMLElement>('#bankLedgerBody');if(!body)return;body.innerHTML=rows.slice(-120).reverse().map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.number)}</td><td>${esc(r.description)}</td><td>${money(r.debitRial)}</td><td>${money(r.creditRial)}</td><td>${money(r.balanceRial)}</td></tr>`).join('')||'<tr><td colspan="6">گردشی برای این حساب ثبت نشده است.</td></tr>'}catch(e){toast(e instanceof Error?e.message:'خطا در بارگذاری دفتر','error')}}
  });

  // پر کردن خودکار تعداد و بهای خرید هنگام انتخاب کالا
  /* openingCostProduct: core delegation */

  /* openingCostSave: core delegation */

  /* openingCostBulk: core delegation */

  /* openingCostRefresh: core delegation */
  /* nrvRefresh: core delegation */
  /* analyticsRefresh: core delegation */
/* data-nrv-write-down: core delegation */


  /* opKind: core change delegation */
  /* opSave: core delegation */

  /* partySaveBtn: core delegation */

  /* partyResetBtn: core delegation */

  bindPartySmsButtons(document);
bindCommercePanelActions(document, {
    onEditParty: (partyId) => {
      editingPartyId=partyId;
      render().then(()=>el<HTMLElement>('#partyFormGrid')?.scrollIntoView({behavior:'smooth',block:'start'}));
    },
    onPostInvoice: (invoiceId) => openInvoiceSettlementSheet(invoiceId),
  });
  /* invoiceDescriptionVisible: core delegation */

  const previousInvoiceScanHandler=(window as any).__anbarinInvoiceBarcodeHandler as EventListener|undefined;
  if(previousInvoiceScanHandler)window.removeEventListener('anbarin:invoice-barcode-scan',previousInvoiceScanHandler);
  const invoiceScanHandler:EventListener=(event:Event)=>{
    const detail=(event as CustomEvent<{code:string}>).detail;
    const code=digits(detail?.code||'').trim();
    if(!code)return;
    const product=findProductByCode(code);
    const status=el<HTMLElement>('#invoiceScanStatus')||document.querySelector<HTMLElement>('#invoiceScanStatus');
    if(product){
      addProductToInvoice(product.id,true);
      if(status)status.textContent=`✓ ${product.name} اضافه شد`;
      toast(`${product.name} به اقلام اضافه شد`,'success');
    }else{
      if(status)status.textContent=`بارکد ${code} پیدا نشد`;
      offerAddProduct(code,{
        asName:false,
        onSaved:(productId)=>{
          addProductToInvoice(productId,true);
          const p=products.find(x=>x.id===productId);
          if(status)status.textContent=p?`✓ ${p.name} اضافه شد`:'کالا اضافه شد';
          toast(p?`${p.name} تعریف و به فاکتور اضافه شد`:'کالا به فاکتور اضافه شد','success');
        },
      });
    }
  };
  (window as any).__anbarinInvoiceBarcodeHandler=invoiceScanHandler;window.addEventListener('anbarin:invoice-barcode-scan',invoiceScanHandler);
  bindInvoiceProductSearch(document);
  if (!(window as any).__anbarinInvoiceSuggestHideBound) {
    (window as any).__anbarinInvoiceSuggestHideBound = true;
    document.addEventListener('click', (event) => {
      if (!(event.target as HTMLElement).closest('.invoice-live-search')) {
        const box = el<HTMLDivElement>('#invoiceProductSuggestions');
        if (box) box.hidden = true;
      }
    });
  }
  // تقویم فاکتور از طریق attachJalaliCalendar / enhanceDateFields وصل می‌شود
  const invDate = el<HTMLInputElement>('#invoiceDate');
  if (invDate) {
    const btn = el<HTMLButtonElement>('#invoiceJalaliCalendar');
    const panel = el<HTMLDivElement>('#invoiceJalaliCalendarPanel');
    if (btn) delete btn.dataset.calBound;
    delete invDate.dataset.calendarEnhanced;
    attachJalaliCalendar(invDate, btn, panel);
  }
  /* invoiceTax: core delegation */

  /* invoiceAddPayment: core delegation */
if (!(window as any).__anbarinInvoicePaymentRowsBound) {
    (window as any).__anbarinInvoicePaymentRowsBound = true;
    document.addEventListener('input', (event) => {
      const t = event.target as HTMLElement | null;
      if (t && t.closest('#invoicePaymentRows')) updateInvoiceTotals();
    });
    document.addEventListener('change', (event) => {
      const t = event.target as HTMLElement | null;
      if (t && t.closest('#invoicePaymentRows')) updateInvoiceTotals();
    });
  }
  /* invoiceTaxRate: core delegation */

  /* landed costs input: core delegation */
  const saveInvoiceDraft=async(quiet=false):Promise<string|null>=>{
    if(!commerce){toast('اطلاعات بازرگانی بارگذاری نشده است.','error');return null;}
    try{
      await refreshFiscalCache();
      if(!getCommerceFiscalPeriods().some(p=>p.status==='open')){
        throw new Error('سال مالی باز پیدا نشد. از حسابداری → سال مالی یک دوره با وضعیت باز بسازید، یا برنامه را یک‌بار ببندید و باز کنید.');
      }
      const typeEl=q<HTMLInputElement>('#invoiceType');
      const numberEl=q<HTMLInputElement>('#invoiceNumber');
      const partyEl=q<HTMLSelectElement>('#invoiceParty');
      const dateEl=q<HTMLInputElement>('#invoiceDate');
      if(!typeEl||!numberEl||!partyEl||!dateEl)throw new Error('فرم فاکتور در دسترس نیست. برگه فاکتور را دوباره باز کنید.');
      const type=(typeEl.value||activeInvoiceType) as InvoiceType;
      const invoiceNo=numberEl.value.trim();
      if(!invoiceNo)throw new Error('شماره فاکتور را وارد کنید.');
      if(!partyEl.value)throw new Error('طرف حساب را انتخاب کنید.');
      await assertDefaultPartyAllowed(type, partyEl.value);
      if(commerce.invoices.some(i=>i.id!==editingInvoiceId&&i.type===type&&i.number===invoiceNo))throw new Error('شماره فاکتور در این نوع فاکتور تکراری است.');
      const rows=qAll<HTMLElement>('#commerceInvoiceLines .commerce-line');
      const lines:Array<{description:string;unit:string;quantityMilli:number;unitPriceRial:number;discountRial:number;productId?:string;warehouse?:string}>=[];
      for(const row of rows){
        const productId=row.querySelector<HTMLInputElement>('[data-line-product]')?.value||'';
        const product=products.find(p=>p.id===productId);
        const description=(row.querySelector<HTMLInputElement>('[data-line-desc]')?.value||product?.name||'').trim();
        const qRaw=lineEnteredQty(row);
        const enteredUnitPriceRial=parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-line-price]')?.value||'0'),currency);
        const discountRial=parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-line-discount]')?.value||'0'),currency);
        // ردیف خالی را نادیده بگیر
        if(!description && !productId && !enteredUnitPriceRial) continue;
        if(!description)throw new Error('شرح هر ردیف کالا را وارد کنید.');
        if(!Number.isFinite(qRaw)||qRaw<=0||qRaw>999999999)throw new Error(`تعداد «${description}» نامعتبر است.`);
        if(!enteredUnitPriceRial||enteredUnitPriceRial<=0)throw new Error(`قیمت واحد «${description}» باید بیشتر از صفر باشد.`);
        // تبدیل بسته → واحد پایه تا موجودی و بهای تمام‌شده همیشه بر حسب واحد پایه باشد
        const packMode=row.querySelector<HTMLSelectElement>('[data-line-unit-mode]')?.value==='pack';
        const factor=lineUnitFactor(row);
        const baseQty=packMode?qRaw*factor:qRaw;
        if(baseQty<=0||baseQty>999999999)throw new Error(`تعداد تبدیل‌شده «${description}» نامعتبر است.`);
        const enteredGross=Math.round(qRaw*enteredUnitPriceRial);
        const quantityMilli=Math.round(baseQty*1000);
        const unitPriceRial=quantityMilli>0?Math.round(enteredGross*1000/quantityMilli):enteredUnitPriceRial;
        const unitLabel=packMode?(product?.unit||'عدد'):(row.querySelector<HTMLInputElement>('[data-line-unit]')?.value||product?.unit||'عدد');
        lines.push({
          description,
          unit:unitLabel,
          quantityMilli,
          unitPriceRial,
          discountRial,
          ...(product?{productId:product.id,warehouse:product.warehouse||'انبار اصلی'}:{}),
        });
      }
      if(!lines.length)throw new Error('حداقل یک قلم با شرح و قیمت به فاکتور اضافه کنید (برگه اقلام).');
      const invoiceDate=normalizeJalaliDate(dateEl.value||todayJalali())||digits(dateEl.value||todayJalali());
      const fiscalPeriodId=await invoicePeriodForDate(invoiceDate);
      const payload={
        type,
        number:invoiceNo,
        date:invoiceDate,
        dueDate:'',
        paymentTerms:'',
        paymentParts:[] as InvoicePaymentPart[],
        fiscalPeriodId,
        partyId:partyEl.value,
        description:q<HTMLInputElement>('#invoiceDescription')?.value||'',
        notes:q<HTMLTextAreaElement>('#invoiceNotes')?.value||'',
        taxRateBps:Math.round(Number(digits(q<HTMLInputElement>('#invoiceTaxRate')?.value||'0').replace(',','.'))*100),
        lines,
        taxRial:parseMoneyToRial(digits(q<HTMLInputElement>('#invoiceTax')?.value||'0'),currency),
        ...(type==='purchase'?{
          landedCosts:{
            freightRial:parseMoneyToRial(digits(q<HTMLInputElement>('#invoiceLandedFreight')?.value||'0'),currency),
            customsRial:parseMoneyToRial(digits(q<HTMLInputElement>('#invoiceLandedCustoms')?.value||'0'),currency),
            insuranceRial:parseMoneyToRial(digits(q<HTMLInputElement>('#invoiceLandedInsurance')?.value||'0'),currency),
            otherRial:parseMoneyToRial(digits(q<HTMLInputElement>('#invoiceLandedOther')?.value||'0'),currency),
            note:q<HTMLInputElement>('#invoiceLandedNote')?.value||'',
          },
        }:{}),
      };
      let savedId='';
      const prevSuppress=suppressCommerceSheetReopen;
      suppressCommerceSheetReopen=true;
      try{
        if(editingInvoiceId){
          const next=updateDraftInvoice(editingInvoiceId,payload,commerce);
          savedId=editingInvoiceId;
          editingInvoiceId=null;
          await persist(next);
          if(!quiet)toast('پیش‌نویس ذخیره شد','success');
        }else{
          const invoice=buildInvoice(payload,commerce.parties);
          savedId=invoice.id;
          const next={...commerce,invoices:[...commerce.invoices,invoice]};
          await persist(next);
          if(!quiet)toast('پیش‌نویس ذخیره شد','success');
        }
      }finally{
        suppressCommerceSheetReopen=prevSuppress;
      }
      lastPrintableInvoiceId=savedId||lastPrintableInvoiceId; return savedId;
    }catch(e){
      toast(e instanceof Error?e.message:'خطا در ذخیره فاکتور','error');
      return null;
    }
  };
  saveInvoiceDraftHandler = saveInvoiceDraft;
  // delegation پایدار در سطح document — فقط یک‌بار؛ همیشه آخرین handler
  if(!(window as any).__anbarinInvoiceActionBound){
    (window as any).__anbarinInvoiceActionBound=true;
    const onInvoiceAction=async(ev:Event)=>{
      const t=ev.target as HTMLElement|null;
      if(!t)return;
      const saveBtn=t.closest('#invoiceSave') as HTMLElement|null;
      const settleBtn=t.closest('#invoiceSettle') as HTMLElement|null;
      if(!saveBtn&&!settleBtn)return;
      ev.preventDefault();
      ev.stopPropagation();
      const run=saveInvoiceDraftHandler;
      if(!run){
        toast('فرم فاکتور آماده نیست. یک‌بار برگه را ببندید و دوباره باز کنید.','error');
        return;
      }
      try{
        if(saveBtn){
          await run(false); // toast داخل saveInvoiceDraft
          return;
        }
        if(settleBtn){
          if(!commerce){toast('اطلاعات بازرگانی بارگذاری نشده است.','error');return;}
          if(activeInvoiceType==='proforma'){toast('پیش‌فاکتور قابل تسویه نیست.','error');return;}
          const savedId=await run(true);
          if(!savedId){return;} // toast already shown by save
          if(!commerce){toast('ذخیره انجام شد اما داده در دسترس نیست.','error');return;}
          const target=commerce.invoices.find(i=>i.id===savedId);
          if(!target){toast('فاکتور برای تسویه آماده نشد.','error');return;}
          if(target.status!=='draft'){toast('این فاکتور قبلاً قطعی شده است.','error');return;}
          openInvoiceSettlementSheet(target.id);
        }
      }catch(e){
        toast(e instanceof Error?e.message:'خطا در عملیات فاکتور','error');
      }
    };
    document.addEventListener('click',onInvoiceAction,true);
  }

  const runPrintOrShare=async(kind:'print'|'share')=>{
    let id=resolveInvoiceForPrint();
    if(!id){
      // اگر هنوز ذخیره نشده، اول پیش‌نویس کن
      const run=saveInvoiceDraftHandler;
      if(!run){toast('ابتدا فاکتور را به‌صورت پیش‌نویس ذخیره کنید.','error');return;}
      try{
        id=await run(true);
      }catch(e){toast(e instanceof Error?e.message:'ذخیره فاکتور انجام نشد','error');return;}
    }
    if(!id){toast('فاکتوری برای چاپ/اشتراک پیدا نشد. ابتدا پیش‌نویس را بزنید.','error');return;}
    lastPrintableInvoiceId=id;
    if(kind==='print') printInvoice(id);
    else await shareInvoice(id);
  };
  // handler پایدار برای چاپ/اشتراک (حتی بعد از انتقال DOM به برگه)
  (window as any).__anbarinInvoicePrintShare = runPrintOrShare;
  /* invoicePrint: core delegation */

  /* invoiceShare: core delegation */

  /* invoicePrintInternal: core delegation */

  if(!(window as any).__anbarinInvoicePrintBound){
    (window as any).__anbarinInvoicePrintBound=true;
    document.addEventListener('click',(ev)=>{
      const t=ev.target as HTMLElement|null; if(!t)return;
      const printInternalBtn=t.closest('#invoicePrintInternal');
      if(printInternalBtn){
        if(!t.closest('#commercePanelSheet, #accountingCommerceWorkspace, .invoice-action-bar'))return;
        ev.preventDefault();
        const id=resolveInvoiceForPrint();
        if(!id){toast('ابتدا فاکتور را ذخیره کنید.','error');return;}
        lastPrintableInvoiceId=id;
        void (async()=>{
          if(!costingCache){try{costingCache=await loadInventoryCostData();}catch (e) { console.error('[Anbarin] ignored error', e); }}
          await printInvoice(id,{internal:true});
        })();
        return;
      }
      const printBtn=t.closest('#invoicePrint');
      const shareBtn=t.closest('#invoiceShare');
      if(!printBtn&&!shareBtn)return;
      if(!t.closest('#commercePanelSheet, #accountingCommerceWorkspace, .invoice-action-bar'))return;
      ev.preventDefault();
      const run=(window as any).__anbarinInvoicePrintShare as ((k:'print'|'share')=>Promise<void>)|undefined;
      if(!run){return;}
      void run(printBtn?'print':'share');
    },true);
  }

  /* cashType: core delegation */

  /* cashParty: core delegation */

  /* cashMethod: core delegation */

  // وضعیت اولیه
  (()=>{const m=el<HTMLSelectElement>('#cashMethod');if(!m)return;const show=m.value==='cheque';document.querySelectorAll<HTMLElement>('[data-cheque-field]').forEach(x=>{x.hidden=!show;x.style.display=show?'':'none';});})();
  bindCashTransactionActions(document, {
    onSave: async () => {if(!commerce)return;try{const type=el<HTMLSelectElement>('#cashType')!.value as 'receipt'|'payment';const method=el<HTMLSelectElement>('#cashMethod')!.value as any;if(method==='cheque'){const cn=(el<HTMLInputElement>('#cashChequeNumber')?.value||'').trim();const bank=(el<HTMLInputElement>('#cashChequeBank')?.value||'').trim();const sayadi=(el<HTMLInputElement>('#cashChequeAccount')?.value||'').trim();const due=digits(el<HTMLInputElement>('#cashChequeDue')?.value||'');if(!cn||!bank||!sayadi||!due||!/^\d{4}\/\d{2}\/\d{2}$/.test(due))throw new Error('برای چک، شماره چک، بانک، شماره صیادی و سررسید الزامی است.');}const result=await createCashTransaction({type,number:el<HTMLInputElement>('#cashNumber')!.value,date:digits(el<HTMLInputElement>('#cashDate')!.value),fiscalPeriodId:await activeFiscalPeriodId(),partyId:el<HTMLSelectElement>('#cashParty')!.value,cashAccountId:el<HTMLSelectElement>('#cashAccount')!.value,amountRial:parseMoneyToRial(digits(el<HTMLInputElement>('#cashAmount')!.value),currency),description:el<HTMLInputElement>('#cashDescription')!.value,method:el<HTMLSelectElement>('#cashMethod')!.value as any,allocations:el<HTMLSelectElement>('#cashInvoice')!.value?[{invoiceId:el<HTMLSelectElement>('#cashInvoice')!.value,amountRial:parseMoneyToRial(digits(el<HTMLInputElement>('#cashAllocation')!.value||el<HTMLInputElement>('#cashAmount')!.value),currency)}]:[],chequeNumber:el<HTMLInputElement>('#cashChequeNumber')!.value,chequeBank:el<HTMLInputElement>('#cashChequeBank')!.value,chequeAccount:el<HTMLInputElement>('#cashChequeAccount')?.value||'',chequeNote:el<HTMLInputElement>('#cashChequeNote')?.value||'',chequeDueDate:digits(el<HTMLInputElement>('#cashChequeDue')!.value)},commerce);commerce=result.commerce;render();refreshAccounting();toast('دریافت/پرداخت و سند حسابداری ثبت شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ثبت دریافت/پرداخت','error')}},
    onChequeClear: async (transactionId) => {if(!commerce)return;try{const date=prompt('تاریخ وصول/تسویه شمسی را وارد کنید (مثلاً ۱۴۰۵/۰۱/۳۰):');if(!date)return;const result=await updateChequeStatus(transactionId,'cleared',digits(date),commerce);commerce=result.commerce;await recordChequeEvent(transactionId,'cleared_note',digits(date),'وصول/تسویه با سند حسابداری');render();refreshAccounting();toast('وصول/تسویه چک ثبت شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا در تسویه چک','error')}},
    onChequeBounce: async (transactionId) => {if(!commerce)return;try{const date=prompt('تاریخ برگشت چک شمسی را وارد کنید:');if(!date)return;const result=await updateChequeStatus(transactionId,'bounced',digits(date),commerce);commerce=result.commerce;const reason=prompt('علت برگشت چک:')||'علت اعلام نشده';await recordChequeEvent(transactionId,'bounced_note',digits(date),reason);render();refreshAccounting();toast('برگشت چک و اثر حسابداری ثبت شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ثبت برگشت چک','error')}},
  });

  bindChequeManagementActions(document, {
  onEndorse: async (b) => {if(!commerce)return;try{const tx=commerce.cashTransactions.find(t=>t.id===b.dataset.chqEndorse);if(!tx)throw new Error('چک پیدا نشد.');const remaining=getChequeEndorsementRemaining(tx.id,commerce);const amountText=prompt(`مبلغ این مرحله را به ریال وارد کنید (حداکثر ${fa(remaining)}):`,String(remaining));if(!amountText)return;const amount=parseMoneyToRial(digits(amountText),'rial');if(!Number.isSafeInteger(amount)||amount<=0||amount>remaining)throw new Error('مبلغ واگذاری معتبر نیست یا از مانده چک بیشتر است.');const suppliers=commerce.parties.filter(p=>p.isActive&&(p.type==='supplier'||p.type==='both'));if(!suppliers.length)throw new Error('ابتدا تأمین‌کننده فعال ثبت کنید.');const supplierText=suppliers.map((p,i)=>`${i+1}) ${p.name}`).join('\n');const choice=prompt(`شماره تأمین‌کننده دریافت‌کننده را وارد کنید:\n${supplierText}`);if(!choice)return;const supplier=suppliers[Number(digits(choice))-1];if(!supplier)throw new Error('انتخاب تأمین‌کننده معتبر نیست.');const invoices=commerce.invoices.filter(i=>i.status==='posted'&&i.type==='purchase'&&i.partyId===supplier.id&&invoiceOutstanding(i.id,commerce!)>=amount);if(!invoices.length)throw new Error('برای این تأمین‌کننده فاکتور خرید قطعی با مانده کافی وجود ندارد.');const invoiceText=invoices.map((i,n)=>`${n+1}) ${i.number} — مانده ${money(invoiceOutstanding(i.id,commerce!))}`).join('\n');const invChoice=prompt(`فاکتور خریدی را انتخاب کنید که با این بخش از چک تسویه می‌شود:\n${invoiceText}`);if(!invChoice)return;const invoice=invoices[Number(digits(invChoice))-1];if(!invoice)throw new Error('انتخاب فاکتور معتبر نیست.');const date=prompt('تاریخ واگذاری شمسی (YYYY/MM/DD):');if(!date)return;const note=prompt('شرح / شماره رسید تحویل چک:')||'';commerce=await endorseCheque(tx.id,supplier.id,invoice.id,digits(date),note,amount);await render();refreshAccounting();toast('بخش چک و سند حسابداری ثبت شد.','success')}catch(e){toast(e instanceof Error?e.message:'خطا در واگذاری چک','error')}
  },
  onChainTransfer: async (b) => {if(!commerce)return;try{const endorsementId=b.dataset.chainEndorsement!;const parentTransferId=b.dataset.chainParent||undefined;const fromPartyId=b.dataset.chainFrom!;const available=Number(b.dataset.chainAvailable);const amountText=prompt(`مبلغ انتقال به ذی‌نفع بعدی (حداکثر ${fa(available)} ریال):`,String(available));if(!amountText)return;const amount=parseMoneyToRial(digits(amountText),'rial');if(!Number.isSafeInteger(amount)||amount<=0||amount>available)throw new Error('مبلغ انتقال معتبر نیست.');const candidates=commerce.parties.filter(p=>p.isActive&&p.id!==fromPartyId);if(!candidates.length)throw new Error('طرف حساب فعال دیگری برای انتقال وجود ندارد.');const options=candidates.map((p,i)=>`${i+1}) ${p.name}`).join('\n');const choice=prompt(`شماره دریافت‌کننده را وارد کنید:\n${options}`);if(!choice)return;const to=candidates[Number(digits(choice))-1];if(!to)throw new Error('انتخاب دریافت‌کننده معتبر نیست.');const date=prompt('تاریخ انتقال شمسی (YYYY/MM/DD):');if(!date)return;const note=prompt('شماره رسید تحویل / توضیحات:')||'';await transferEndorsedCheque({endorsementId,parentTransferId,fromPartyId,toPartyId:to.id,amountRial:amount,date:digits(date),note});await render();toast('انتقال زنجیره‌ای چک ثبت شد.','success')}catch(e){toast(e instanceof Error?e.message:'خطا در انتقال زنجیره‌ای چک','error')}
  },
  onChainOutcome: async (b) => {if(!commerce)return;try{const endorsementId=b.dataset.chainOutcome!;const parentTransferId=b.dataset.outcomeParent||undefined;const holderPartyId=b.dataset.outcomeHolder!;const available=Number(b.dataset.outcomeAvailable);const amountText=prompt(`مبلغ تعیین‌تکلیف (حداکثر ${fa(available)} ریال):`,String(available));if(!amountText)return;const amountRial=parseMoneyToRial(digits(amountText),'rial');if(!Number.isSafeInteger(amountRial)||amountRial<=0||amountRial>available)throw new Error('مبلغ واردشده معتبر نیست.');const choice=prompt('نتیجه را انتخاب کنید:\n1) وصول‌شده\n2) برگشتی\n3) مورد اختلاف');if(!choice)return;const typeMap:Record<string,'collected'|'returned'|'disputed'>={'1':'collected','2':'returned','3':'disputed'};const type=typeMap[digits(choice)];if(!type)throw new Error('نوع نتیجه معتبر نیست.');const date=prompt('تاریخ ثبت نتیجه شمسی (YYYY/MM/DD):');if(!date)return;const reference=prompt('شماره گواهی بانک / کد رهگیری (اختیاری):')||'';const note=prompt('شرح یا علت برگشت / اختلاف:')||'';await recordChequeHolderOutcome({endorsementId,parentTransferId,holderPartyId,type,amountRial,date:digits(date),reference,note});await render();toast('نتیجه چک نزد دارنده ثبت شد.','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ثبت نتیجه چک','error')}
  },
  onExtend: async (b) => {try{const date=prompt('سررسید جدید شمسی (YYYY/MM/DD):');if(!date)return;const note=prompt('علت تمدید:')||'';await extendChequeDueDate(b.dataset.chqExtend!,digits(date),note);commerce=await loadCommerceData();await render();toast('سررسید جدید ثبت و سابقه قبلی حفظ شد.','success')}catch(e){toast(e instanceof Error?e.message:'خطا در تمدید چک','error')}
  },
  onReplace: async (b) => {try{const number=prompt('شماره چک جایگزین:');if(!number)return;const bank=prompt('بانک چک جایگزین:');if(!bank)return;const dueDate=prompt('سررسید جدید شمسی:');if(!dueDate)return;const date=prompt('تاریخ تحویل چک جایگزین شمسی:');if(!date)return;const note=prompt('شرح/علت جایگزینی:')||'';await replaceChequeDetails(b.dataset.chqReplace!,{number,bank,dueDate:digits(dueDate),date:digits(date),note});commerce=await loadCommerceData();await render();toast('مشخصات چک جایگزین ثبت شد؛ سوابق قبلی محفوظ است.','success')}catch(e){toast(e instanceof Error?e.message:'خطا در جایگزینی چک','error')}
  },
  onDeposit: async (b) => {try{const date=prompt('تاریخ واگذاری به بانک شمسی:');if(!date)return;const note=prompt('نام شعبه/شماره رسید واگذاری:')||'';await recordChequeEvent(b.dataset.chqDeposit!,'deposited',digits(date),note);await render();toast('واگذاری چک به بانک در دفتر ثبت شد.','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ثبت واگذاری','error')}
  }
});
          
}
export async function initAccountingCommerceUI():Promise<void>{
  // ثبت loaderهای بخش برای fallback برگه بدون تکرار منطق در openCommercePanelSheet
  registerCommerceSectionLoader('inventory', () => safeInventoryPanelsHtml());
  registerCommerceSectionLoader('sale', () => buildActiveSectionInnerHtml('sale'));
  registerCommerceSectionLoader('purchase', () => buildActiveSectionInnerHtml('purchase'));
  registerCommerceSectionLoader('management', () => buildActiveSectionInnerHtml('management'));
  registerCommerceSectionLoader('receipts', async () => buildCashEntryPanelHtml({
    partyOptionsHtml: partyOptions('customer'),
    accountOptionsHtml: accountOptions(),
    cashRowsHtml: cashRows(),
  }));
  registerCommerceSectionLoader('parties', async () => partiesPanelHtml());
  registerCommerceSectionLoader('operating', () => operatingPanelHtml());
  registerCommerceSectionLoader('cheques', () => chequePanel());
  registerCommerceSectionLoader('aging', () => agingPanel());
  registerCommerceSectionLoader('banking', () => bankPanel());

  try{
    await ensureCommerceAccounts();
    bindFiscalCacheRefresh();
    const [acc,stored,costing]=await Promise.all([loadAccountingData(),loadCommerceData(),loadInventoryCostData()]);
    commerce=stored;
    costingCache=costing;
    currency=acc.settings.currencyDisplay;
    await refreshCommerceFiscalCache();
    accountOptionsCache=acc.accounts.filter(a=>a.isActive&&a.level==='detail'&&['det-cash','det-bank'].includes(a.id)).map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('');
    render();
  }
  catch(e){console.error('[Anbarin] commerce UI init failed',e);toast('بارگذاری فاکتورها و دریافت‌وپرداخت انجام نشد','error')}
}

