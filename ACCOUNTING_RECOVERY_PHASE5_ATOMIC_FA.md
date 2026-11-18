# گزارش مرحله پنجم — Commit اتمیک دامنه‌های مالی

## دامنه
نسخه مبنا: `Anbarin-Pro-v2.0.5-recovery-phase3`

این مرحله مشکل ریشه‌ای ناهمگامی چنددامنه‌ای را برطرف می‌کند: ثبت فاکتور و دریافت/پرداخت دیگر در چند تراکنش جداگانه IndexedDB نوشته نمی‌شوند.

## تغییرات

### فایل جدید
- `src/modules/financial-commit.ts`
  - `commitFinancialDomains` — نوشتن accounting + costing + commerce + journal در **یک** `idbPutMany`
  - `beginCommerceOperation` / `readPendingCommerceOperation` / `writePendingCommerceOperation` / `markOperationCompleted`
  - پشتیبانی از انواع: `post-invoice` | `cash-transaction` | `cheque-status`

### `src/modules/accounting-commerce.ts`
1. `preparePostedJournal` — ساخت سند posted فقط در حافظه (بدون IO)
2. انتهای `postInvoiceExclusive`: به‌جای `saveInventoryCostData` + `saveCommerceData` جداگانه → `commitFinancialDomains`
3. `postInvoice` از `beginCommerceOperation` استفاده می‌کند
4. `createCashTransactionExclusive`:
   - شناسه ثابت قبل از هر نوشتن
   - ثبت نشانگر با `inputSnapshot`
   - commit اتمیک accounting + commerce + tombstone
   - پارامتر اختیاری `fixedTransactionId` برای بازیابی
5. `recoverPendingCommerceOperation`:
   - پشتیبانی از `post-invoice` (مثل قبل، قوی‌تر)
   - پشتیبانی از `cash-transaction` با اجرای مجدد از `inputSnapshot`
6. حذف Journal محلی تکراری

### تست
- `tests/phase-atomic-financial-commit.test.mjs` — ۳ تست قرارداد (همه موفق)

## نتیجه معماری

| قبل | بعد |
|-----|-----|
| سند → costing → commerce → journal (چند تراکنش) | همه در یک تراکنش |
| کرش = وضعیت نیمه‌تمام ممکن | یا همه commit یا هیچ‌کدام |
| بازیابی فقط فاکتور | فاکتور + دریافت/پرداخت |

## محدودیت باقی‌مانده
- موجودی کارت کالا (`app_state`) همچنان پس از commit مالی ذخیره می‌شود (مسیر ثانویه).
- تغییر وضعیت چک (`cheque-status`) هنوز به Journal کامل متصل نشده است.
- تست کرش واقعی روی Android/WebView هنوز انجام نشده است.
- `npm run typecheck` / `build` در این محیط اجرا نشده (نیاز به `npm install`).

## توصیه
این نسخه برای تست پذیرش آزمایشی مناسب است. پس از `npm install && npm run typecheck && npm test` و یک دور تست دستی ثبت فاکتور + دریافت روی دستگاه، می‌تواند مبنای phase بعدی (چک + هم‌ترازی qty) قرار گیرد.
