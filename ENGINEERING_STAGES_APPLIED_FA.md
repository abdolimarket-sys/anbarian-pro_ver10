# مراحل مهندسی اعمال‌شده (بدون دوباره‌کاری)

نسخه مبنا: **2.1.10**

## P0 — پایداری (انجام‌شده)

1. **انبار در بازرگانی**
   - `safeInventoryPanelsHtml` + fallback در `openCommercePanelSheet`
   - try/catch روی render و پنل‌ها
   - کلیک تب‌ها با `.catch` و toast
2. **پشتیبان در تنظیمات**
   - `backup-settings-events.ts` با event delegation روی document
   - null-safe دکمه‌ها
   - پیام روشن وقتی رمز/کلید سازمان ناقص است
3. **catch خالی** در مسیرهای کلیدی commerce-ui به `console.error` تبدیل شد

## P1 — شروع جداسازی UI (انجام‌شده، بدون تغییر رفتار مالی)

1. ماژول جدید `commerce-ui-inventory.ts`
   - `buildSafeStackedPanels`
   - `revealSection`
2. `safeInventoryPanelsHtml` از helper مشترک استفاده می‌کند
3. گذرگاه رویداد `commerce-events.ts` (`emitCommerceEvent` / `onCommerceEvent`)
   - `refreshAccounting` هم event دامنه‌ای و هم window را می‌فرستد

## عمداً انجام‌نشده در این بسته (نیاز به PR جدا و تست رگرسیون سنگین)

- شکستن کامل God file به invoices/cash/parties/bank (چند هفته)
- virtualize جداول انبار
- lazy-load xlsx/scanner
- حذف `export let` از state

## فایل‌های اصلی تغییر یافته

- `src/modules/accounting-commerce-ui.ts`
- `src/modules/backup-settings-events.ts`
- `src/modules/commerce-ui-inventory.ts` *(جدید)*
- `src/modules/commerce-events.ts` *(جدید)*
- `public/sw.js` (یکدست‌سازی نسخه در صورت وجود)


## P1b — ادامه جداسازی (بدون تکرار P0/P1a)

1. `commerce-ui-sheet.ts` — `createCommerceSheet` / `moveSectionIntoMount` / `scrollSheetToTop`
2. `commerce-ui-cash.ts` — HTML خالص دریافت/پرداخت
3. `openCommercePanelSheet` از helperهای مشترک استفاده می‌کند (کاهش تکرار overlay)
4. بخش receipts فقط وقتی active است با `buildCashEntryPanelHtml` ساخته می‌شود

### هنوز نرفته
- شکستن invoices/bank/operating به فایل جدا
- virtualize
- lazy-load xlsx


## P1c — مهندسی بخش‌ها و loader مرکزی

1. `commerce-ui-operating.ts` — HTML خالص هزینه/درآمد
2. `commerce-ui-section-content.ts` — رجیستری loader بخش‌ها
3. در `initAccountingCommerceUI` loaderهای inventory/receipts/parties/operating/cheques/aging/banking ثبت می‌شوند
4. اگر `render()` هنگام باز کردن بخش شکست بخورد، برای بخش‌های ثبت‌شده از loader مستقیم استفاده می‌شود (نه فقط انبار)

### اصل مهندسی
- HTML خالص ≠ منطق دامنه
- fallback برگه از همان loaderهای render تغذیه می‌شود → یک منبع محتوا


## P1d — بانک خالص + محدودسازی جدول

1. `commerce-ui-bank.ts` — HTML خالص پنل بانک/صندوق (شناسه‌های کنترل بدون تغییر)
2. `commerce-ui-table.ts` — `limitTableRowItems` / `joinRowsOrEmpty` (پیش‌فرض ۸۰ ردیف)
3. `bankPanel` از builder خالص استفاده می‌کند؛ ردیف چک و مغایرت محدود می‌شود
4. فهرست ارزش‌گذاری اولیه از helper مشترک limit استفاده می‌کند


## P1e — فاکتور خالص + رندر شرطی

1. `commerce-ui-invoice.ts`
   - `buildInvoiceSectionHtml`
   - `buildInvoiceTaxDetailsHtml`
   - `buildInvoiceLandedCostsHtml`
   - `buildInvoiceInternalProfitPanelHtml`
2. بخش invoices فقط وقتی `sale` یا `purchase` فعال است ساخته می‌شود (کاهش کار در باز شدن انبار/بانک/…)
3. شناسه‌های DOM فاکتور بدون تغییر (bind قبلی معتبر می‌ماند)


## P1f — رندر هدفمند workspace

1. `commerce-ui-workspace.ts` — home خالص + اسکلت section + `setCommerceSectionVisibility`
2. `buildActiveSectionInnerHtml` / `fillWorkspaceSection` — یک منبع محتوا برای full و targeted
3. وقتی پوسته از قبل ساخته شده و برگه باز می‌شود (`suppressCommerceSheetReopen`):
   - فقط بخش فعال پر می‌شود
   - home و بقیه sectionها دست نخورده می‌مانند
4. پرچم `data-commerce-shell=1` روی workspace پس از full render

### اثر
باز کردن انبار/بانک/… دیگر کل DOM بازرگانی را از صفر نمی‌سازد (مگر اولین بار یا fallback).


## P1g — Event delegation پایدار برای دکمه‌های پرکاربرد

1. `commerce-ui-core-delegation.ts`
   - یک listener روی document
   - map از id و data-* → handler
2. `refreshCoreClickHandlers()` در ابتدای هر `bind()` فقط map را به‌روز می‌کند
3. پوشش اولیه:
   - `openInvoiceTypeSheet`, `invoiceOpenItems`, `invoiceAddParty`, `invoiceCancelEdit`
   - `openingCostRefresh`, `nrvRefresh`, `analyticsRefresh`
   - `data-edit-invoice` / `data-print-invoice` / `data-share-invoice`
   - `data-commerce-tab` (کاشی‌های home)
4. listener تکراری `data-commerce-tab` از مسیر full render حذف شد

### اثر
رندر هدفمند (P1f) + باز شدن مکرر بخش‌ها دیگر listener روی listener سوار نمی‌کند.


## P1h — تکمیل core delegation

1. `change` delegation در `commerce-ui-core-delegation.ts` (`setCoreChangeHandler`)
2. انتقال کامل به core:
   - `openingCostBulk` / `openingCostSave` / `openingCostRefresh`
   - `opSave` + `opKind` (change)
   - `partySaveBtn` / `partyResetBtn`
   - `nrvRefresh` / `analyticsRefresh`
   - `data-nrv-write-down` (با `data-nrv-wh` و `data-nrv-amount`)
3. loaderهای `sale` / `purchase` / `management` در init
4. `bindBankManagementActions` / `bindCashTransactionActions` / `bindChequeManagementActions` همچنان یک‌باره (قبلی)

### نتیجه
بخش عمده کلیک‌های پرکاربرد دیگر با `addEventListener` تکراری در `bind()` وصل نمی‌شوند.


## P1i — مدیریت و سودآوری روی core delegation

1. دکمه‌های فیلتر/خروجی مدیریت و سودآوری:
   - `managementApplyFilter|ClearFilter|ExportXlsx|PrintPdf`
   - `profitabilityApplyFilter|ClearFilter|ExportXlsx|PrintPdf`
2. `managementAnomalyThreshold` + `managementCompareFirst/Second` (change)
3. `data-management-month` / `-xlsx` / `-pdf`
4. `updateManagementMonthComparison` در سطح ماژول (دیگر داخل bind بسته نیست)


## P1j — cash / فاکتور / input روی core

1. `setCoreInputHandler` در `commerce-ui-core-delegation.ts`
2. change: `cashType` · `cashParty` · `cashMethod` · `openingCostProduct` · `invoiceTaxRate`
3. click: `invoiceAddPayment` · `invoicePrint` · `invoiceShare` · `invoicePrintInternal`
4. input: `invoiceTax` · `invoiceDescriptionVisible` · landed costs
5. چاپ/اشتراک از `__anbarinInvoicePrintShare` پایدار استفاده می‌کند

### باقی در bind
- `enhanceDateFields` / تقویم
- `bindInvoiceProductSearch`
- `invoicePaymentRows` (input روی ظرف)
- bootstrap یک‌بارهٔ bank/cash/cheque و draft handler


## P1k — یک‌باره کردن listenerهای document باقی‌مانده

1. مخفی‌کردن پیشنهاد کالای فاکتور: فقط یک `document click` با فلگ `__anbarinInvoiceSuggestHideBound`
2. ردیف‌های پرداخت فاکتور: delegation یک‌باره روی `document` برای `input/change` داخل `#invoicePaymentRows` (`__anbarinInvoicePaymentRowsBound`)
3. از قبل یک‌باره بودند: invoice action / print internal / bank / cash / cheque / core map


## P1l — استخراج جستجوی کالای فاکتور

1. `commerce-ui-invoice-search.ts` — `bindInvoiceProductSearch` با deps تزریقی
2. در `accounting-commerce-ui.ts` فقط wrapper نازک باقی ماند
3. پرچم `data-search-bound` الان واقعاً از دوباره‌اتصال روی همان نود جلوگیری می‌کند
