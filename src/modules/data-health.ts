/** مرکز سلامت داده‌ها؛ تمام بررسی‌ها فقط‌خواندنی هستند. */
import { products, auditLog, verifyAuditIntegrity, storageBackend } from './state';
import { idbGet } from './storage';
import { loadAccountingData } from './accounting';
import { loadCommerceData } from './accounting-commerce';
import { loadInventoryCostData } from './inventory-costing';
import { esc } from '@/utils/helpers';

export type HealthLevel = 'error' | 'warning' | 'info' | 'ok';
export interface HealthFinding { level: HealthLevel; title: string; detail: string; count?: number; }
export interface HealthReport { checkedAt:string; findings:HealthFinding[]; totals:{errors:number;warnings:number;info:number;ok:number}; }

export function analyzeHealth(input:{products:any[];auditValid:boolean;auditChecked:number;auditLegacy:number;accounting:any;commerce:any;costing:any;backupAvailable:boolean;backend:string}):HealthReport {
  const findings:HealthFinding[]=[];
  const add=(level:HealthLevel,title:string,detail:string,count?:number)=>findings.push({level,title,detail,count});
  const ids=new Set<string>(), codes=new Map<string,number>(); let duplicateIds=0,duplicateCodes=0,invalidQty=0;
  for(const p of input.products){
    const id=String(p?.id??''); if(!id||ids.has(id))duplicateIds++; else ids.add(id);
    const code=String(p?.code??'').trim(); if(code){const key=code.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).toLowerCase();codes.set(key,(codes.get(key)||0)+1)}
    if(!Number.isFinite(Number(p?.systemQty))||Number(p.systemQty)<0)invalidQty++;
  }
  duplicateCodes=[...codes.values()].filter(n=>n>1).reduce((s,n)=>s+n-1,0);
  if(duplicateIds)add('error','شناسه کالای خالی یا تکراری',`${duplicateIds} مورد شناسه خالی/تکراری یافت شد.`,duplicateIds); else add('ok','شناسه کالاها','شناسه کالاها تکراری نیست.');
  if(duplicateCodes)add('warning','بارکدهای تکراری',`${duplicateCodes} مورد بارکد تکراری وجود دارد؛ قبل از اسکن انبوه بررسی شود.`,duplicateCodes); else add('ok','یکتایی بارکد','بارکد تکراری در فهرست فعلی پیدا نشد.');
  if(invalidQty)add('error','مقادیر موجودی نامعتبر',`${invalidQty} کالا مقدار موجودی منفی یا غیرعددی دارد.`,invalidQty); else add('ok','مقادیر موجودی','مقادیر موجودی عملیاتی معتبر هستند.');
  if(!input.auditValid)add('error','سلامت زنجیره لاگ','امضای زنجیره‌ای تاریخچه عملیات ناسازگار است؛ لاگ را پاک یا بازنویسی نکنید و نسخه پشتیبان را بررسی کنید.');
  else add('ok','سلامت زنجیره لاگ',`${input.auditChecked} رویداد امضاشده بررسی شد؛ ${input.auditLegacy} رویداد قدیمی بدون امضا وجود دارد.`);
  const a=input.accounting; let unbalanced=0,duplicateJournal=0; const jids=new Set<string>(), nums=new Set<string>();
  for(const j of a.journalEntries||[]){if(!j?.id||jids.has(j.id))duplicateJournal++;else jids.add(j.id);const nk=String(j.number??'');if(nk&&nums.has(nk))duplicateJournal++;else if(nk)nums.add(nk);
    if(j.status==='posted'){const debit=(j.lines||[]).reduce((s:number,l:any)=>s+(Number(l.debitRial)||0),0),credit=(j.lines||[]).reduce((s:number,l:any)=>s+(Number(l.creditRial)||0),0);if(!Number.isFinite(debit)||!Number.isFinite(credit)||Math.abs(debit-credit)>0)unbalanced++;}}
  if(unbalanced)add('error','اسناد قطعی نامتوازنه',`${unbalanced} سند قطعی تراز بدهکار و بستانکار ندارد.`,unbalanced);else add('ok','توازن اسناد قطعی','اسناد قطعی موجود از نظر جمع بدهکار و بستانکار متوازن هستند.');
  if(duplicateJournal)add('warning','شناسه یا شماره سند تکراری',`${duplicateJournal} مورد شناسه/شماره تکراری در اسناد حسابداری یافت شد.`,duplicateJournal);
  const parties=new Set((input.commerce.parties||[]).map((p:any)=>p.id)); const orphanInvoices=(input.commerce.invoices||[]).filter((i:any)=>i.partyId&&!parties.has(i.partyId)).length;
  if(orphanInvoices)add('warning','فاکتور با طرف حساب ناموجود',`${orphanInvoices} فاکتور به طرف حسابی ارجاع می‌دهد که در فهرست طرف‌حساب‌ها نیست.`,orphanInvoices);
  const balKeys=new Set<string>();let duplicateBalances=0,negativeBalances=0,badCost=0;
  for(const b of input.costing.balances||[]){const k=`${b.productId}|${b.warehouse}`;if(balKeys.has(k))duplicateBalances++;balKeys.add(k);if(Number(b.qtyMilli)<0)negativeBalances++;if(!Number.isFinite(Number(b.valueRial))||Number(b.valueRial)<0)badCost++;}
  if(duplicateBalances)add('error','مانده بهای تمام‌شده تکراری',`${duplicateBalances} ترکیب کالا/انبار بیش از یک مانده دارد.`,duplicateBalances);
  if(negativeBalances)add('warning','مانده منفی بهای تمام‌شده',`${negativeBalances} مانده منفی شناسایی شد.`,negativeBalances);
  if(badCost)add('error','ارزش‌گذاری نامعتبر',`${badCost} مانده ارزش ریالی نامعتبر دارد.`,badCost);
  if(!input.backupAvailable)add('warning','نسخه پشتیبان خودکار پیدا نشد','کلید پشتیبان خودکار در ذخیره‌ساز در دسترس نیست؛ پیش از عملیات حساس، خروجی پشتیبان مستقل بگیرید.');
  else add('ok','وجود نسخه پشتیبان خودکار','حداقل یک نسخه پشتیبان خودکار در ذخیره‌ساز پیدا شد.');
  if(input.backend==='localStorage')add('warning','ذخیره‌سازی جایگزین','برنامه از ذخیره‌سازی جایگزین استفاده می‌کند؛ وضعیت پایداری داده را بررسی کنید.');
  else add('info','وضعیت ذخیره‌سازی',`مسیر ذخیره‌سازی گزارش‌شده: ${input.backend}.`);
  if(!findings.length)add('ok','سلامت داده‌ها','بررسی‌ها بدون مغایرت انجام شد.');
  return {checkedAt:new Date().toISOString(),findings,totals:{errors:findings.filter(x=>x.level==='error').length,warnings:findings.filter(x=>x.level==='warning').length,info:findings.filter(x=>x.level==='info').length,ok:findings.filter(x=>x.level==='ok').length}};
}

export async function collectHealthReport():Promise<HealthReport>{
  const [accounting,commerce,costing,backup,previous]=await Promise.all([
    loadAccountingData(),loadCommerceData(),loadInventoryCostData(),idbGet<unknown>('autobackup').catch(()=>undefined),idbGet<unknown>('autobackup_prev').catch(()=>undefined)
  ]);
  const audit=verifyAuditIntegrity();
  const report=analyzeHealth({products,auditValid:audit.valid,auditChecked:audit.checked,auditLegacy:audit.legacy,accounting,commerce,costing,backupAvailable:!!backup||!!previous,backend:storageBackend});
  // یکپارچگی مالی (فاکتور/سند/موجودی/Journal)
  try {
    const { runFinancialIntegrityCheck } = await import('./financial-integrity-check');
    const fin = await runFinancialIntegrityCheck();
    const titleMap: Record<string, string> = {
      pending_operation: 'عملیات مالی نیمه‌تمام',
      invoice_missing_journal: 'فاکتور بدون سند حسابداری',
      duplicate_posted_journal: 'سند حسابداری قطعی تکراری برای یک منبع',
      invoice_missing_movement: 'فاکتور بدون گردش انبار',
      cash_missing_journal: 'تراکنش بدون سند حسابداری',
      stock_card_divergence: 'ناهم‌خوانی موجودی کارت و بهای تمام‌شده',
    };
    for (const f of fin.findings) {
      const level: HealthLevel = f.severity === 'error' ? 'error' : f.severity === 'warn' ? 'warning' : 'info';
      const title = titleMap[f.code] || `مالی — ${f.code}`;
      report.findings.push({ level, title, detail: f.message });
    }
    if (!fin.findings.length) {
      report.findings.push({ level: 'ok', title: 'یکپارچگی مالی', detail: 'فاکتور، اسناد، گردش انبار و Journal ناسازگاری ساختاری ندارند.' });
    }
    report.totals = {
      errors: report.findings.filter(x => x.level === 'error').length,
      warnings: report.findings.filter(x => x.level === 'warning').length,
      info: report.findings.filter(x => x.level === 'info').length,
      ok: report.findings.filter(x => x.level === 'ok').length,
    };
  } catch (e) {
    report.findings.push({ level: 'warning', title: 'بررسی یکپارچگی مالی', detail: e instanceof Error ? e.message : 'اجرا نشد' });
    report.totals.warnings += 1;
  }
  return report;
}

export async function renderDataHealth(containerId='dataHealthWorkspace'):Promise<void>{
  const host=document.getElementById(containerId);if(!host)return;
  host.innerHTML='<p class="hint">در حال بررسی سلامت داده‌ها...</p>';
  try{
    const report=await collectHealthReport();
    const labels:Record<HealthLevel,string>={error:'خطا',warning:'هشدار',info:'اطلاعات',ok:'سالم'};
    const hasPending = report.findings.some(f => f.title === 'عملیات مالی نیمه‌تمام' || (f.detail.includes('شماره:') && f.detail.includes('محل:')));
    const rows=report.findings.map(f=>`<div class="health-finding health-${f.level}"><div><b>${esc(labels[f.level])} — ${esc(f.title)}</b><p style="white-space:pre-wrap">${esc(f.detail)}</p></div>${f.count!==undefined?`<strong>${f.count}</strong>`:''}</div>`).join('');
    const pendingActions = hasPending ? `
      <div class="row" style="gap:8px;margin:8px 0;flex-wrap:wrap;padding:10px;border:1px solid var(--border-color,#ddd);border-radius:8px;background:var(--bg-soft,#f8f8f8)">
        <p class="hint" style="margin:0 0 6px;width:100%">عملیات مالی نیمه‌تمام شناسایی شد. بازیابی خودکار را دوباره امتحان کنید یا در صورت اطمینان، فقط نشانگر عملیات را آزاد کنید. این کار روی موجودی و اسناد مالی اثر نمی‌گذارد.</p>
        <button type="button" class="btn" id="healthRetryRecoveryBtn">تلاش مجدد بازیابی</button>
        <button type="button" class="btn secondary" id="healthDiscardPendingBtn">انصراف از عملیات نیمه‌تمام</button>
      </div>` : '';
    host.innerHTML=`<div class="health-summary"><div><b>${report.totals.errors}</b><span>خطا</span></div><div><b>${report.totals.warnings}</b><span>هشدار</span></div><div><b>${report.totals.ok}</b><span>مورد سالم</span></div></div>
      <p class="hint">زمان بررسی: ${esc(new Date(report.checkedAt).toLocaleString('fa-IR'))} — بررسی ساختاری فقط‌خواندنی است. همگام‌سازی موجودی کارت از بهای تمام‌شده با دکمه زیر انجام می‌شود.</p>
      <div class="row" style="gap:8px;margin:8px 0;flex-wrap:wrap">
        <button type="button" class="btn secondary" id="healthRecheckBtn">بررسی دوباره</button>
        <button type="button" class="btn" id="healthSyncStockBtn">همگام‌سازی موجودی از بهای تمام‌شده</button>
      </div>
      <details style="margin:12px 0;border:1px solid #c62828;border-radius:8px;padding:10px;background:#fff5f5">
        <summary style="cursor:pointer;color:#b71c1c;font-weight:600">منطقه خطر — ریست کلی داده‌های عملیاتی و مالی</summary>
        <p class="hint" style="margin:8px 0">
          این عمل موجودی کالا، فاکتورها، اسناد حسابداری، چک‌ها، بهای تمام‌شده و پشتیبان‌های خودکار را پاک می‌کند.
          لایسنس، تنظیمات پایه و کاربران حفظ می‌شوند. قبل از پاک‌سازی یک نسخه اضطراری داخلی گرفته می‌شود.
          این عمل برگشت‌پذیر آسان نیست.
        </p>
        <label class="field" style="display:block;margin:8px 0">
          برای تأیید، عبارت زیر را دقیقاً بنویسید:
          <b>پاک کردن همه داده‌ها</b>
          <input id="factoryResetConfirmInput" type="text" placeholder="پاک کردن همه داده‌ها" autocomplete="off" style="width:100%;margin-top:6px" />
        </label>
        <button type="button" class="btn" id="healthFactoryResetBtn" style="background:#c62828;color:#fff;border-color:#c62828">
          ریست کلی داده‌ها
        </button>
      </details>
      ${pendingActions}
      ${rows}`;
    host.querySelector('#healthRecheckBtn')?.addEventListener('click',()=>{void renderDataHealth(containerId);});
    host.querySelector('#healthSyncStockBtn')?.addEventListener('click',async()=>{
      try{
        const { syncProductCardsFromCostingTruth } = await import('./inventory-truth');
        const r=await syncProductCardsFromCostingTruth();
        const { toast } = await import('./ui');
        toast(r.updated?`موجودی ${r.updated} کالا همگام شد.`:'همه کارت‌ها با بهای تمام‌شده هم‌خوان بودند.','success');
        await renderDataHealth(containerId);
      }catch(e){
        const { toast } = await import('./ui');
        toast(e instanceof Error?e.message:'همگام‌سازی انجام نشد','error');
      }
    });


    // ریست کلی — فقط پس از تأیید متنی؛ نسخه اضطراری گرفته می‌شود
    host.querySelector('#healthFactoryResetBtn')?.addEventListener('click', async () => {
      const input = host.querySelector('#factoryResetConfirmInput') as HTMLInputElement | null;
      const phrase = (input?.value || '').trim();
      const { confirmAction } = await import('./ui');
      const first = await confirmAction(
        'هشدار نهایی\n\n' +
        'همه داده‌های موجودی، مالی، فاکتور، چک و بهای تمام‌شده پاک می‌شوند.\n' +
        'لایسنس و تنظیمات پایه حفظ می‌گردند.\n\n' +
        'ادامه می‌دهید؟'
      );
      if (!first) return;
      try {
        const { factoryResetFinancialAndOperationalData } = await import('./financial-commit');
        const { logAudit } = await import('./state');
        const { toast } = await import('./ui');
        const result = await factoryResetFinancialAndOperationalData(phrase);
        if (!result.ok) {
          toast(result.message, 'error');
          return;
        }
        try {
          logAudit('factory_reset_financial_operational', {
            clearedKeys: result.clearedKeys,
            backedUp: result.backedUp,
          });
        } catch { /* ignore audit failure */ }
        toast(result.message + ' برنامه تازه بارگذاری می‌شود.', 'success');
        setTimeout(() => { window.location.reload(); }, 1200);
      } catch (e) {
        const { toast } = await import('./ui');
        toast(e instanceof Error ? e.message : 'ریست انجام نشد', 'error');
      }
    });

    // تلاش مجدد بازیابی — فقط منطق موجود recoverPendingCommerceOperation
    host.querySelector('#healthRetryRecoveryBtn')?.addEventListener('click', async () => {
      try {
        const { recoverPendingCommerceOperation } = await import('./accounting-commerce');
        const { toast } = await import('./ui');
        const result = await recoverPendingCommerceOperation();
        if (result.status === 'recovered') {
          toast(result.message || 'عملیات نیمه‌تمام بازیابی شد.', 'success');
        } else if (result.status === 'blocked') {
          toast(result.message || 'بازیابی ممکن نشد.', 'error');
        } else {
          toast('عملیات نیمه‌تمامی برای بازیابی وجود نداشت.', 'info');
        }
        await renderDataHealth(containerId);
      } catch (e) {
        const { toast } = await import('./ui');
        toast(e instanceof Error ? e.message : 'بازیابی انجام نشد', 'error');
      }
    });

    // انصراف آگاهانه — فقط نشانگر را آزاد می‌کند؛ موجودی و مالی دست نخورده می‌مانند
    host.querySelector('#healthDiscardPendingBtn')?.addEventListener('click', async () => {
      const { confirmAction } = await import('./ui');
      const confirmed = await confirmAction(
        'انصراف از عملیات مالی نیمه‌تمام\n\n' +
        'این کار فقط نشانگر عملیات را آزاد می‌کند.\n' +
        'هیچ تغییری در موجودی کالا، اسناد حسابداری یا تراکنش‌های مالی ایجاد نمی‌شود.\n\n' +
        'آیا مطمئن هستید؟'
      );
      if (!confirmed) return;
      try {
        const { discardPendingCommerceOperation } = await import('./financial-commit');
        const { logAudit } = await import('./state');
        const { toast } = await import('./ui');
        const result = await discardPendingCommerceOperation('انصراف از صفحه سلامت داده');
        if (result.status === 'discarded' && result.operation) {
          try {
            logAudit('discard_pending_commerce_operation', {
              operationId: result.operation.id,
              kind: result.operation.kind,
              invoiceId: result.operation.invoiceId,
              transactionId: result.operation.transactionId,
              startedAt: result.operation.startedAt,
              attempts: result.operation.attempts,
            });
          } catch { /* audit نباید مسیر اصلی را بشکند */ }
          toast('نشانگر عملیات نیمه‌تمام آزاد شد. موجودی و اسناد مالی تغییر نکردند.', 'success');
        } else {
          toast('عملیات نیمه‌تمامی برای انصراف وجود نداشت.', 'info');
        }
        await renderDataHealth(containerId);
      } catch (e) {
        const { toast } = await import('./ui');
        toast(e instanceof Error ? e.message : 'انصراف انجام نشد', 'error');
      }
    });
  }catch(e){host.innerHTML=`<p class="hint">بررسی کامل نشد: ${esc(e instanceof Error?e.message:'خطای نامشخص')}</p>`;}
}
