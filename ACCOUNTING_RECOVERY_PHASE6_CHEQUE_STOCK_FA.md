# گزارش مرحله ششم — وضعیت چک اتمیک + هم‌ترازی موجودی کارت

## دامنه
نسخه مبنا: phase5 atomic commit

## تغییرات

### ۱. `updateChequeStatus` اتمیک
- زیر `withCommerceMutationLock`
- نشانگر `kind: 'cheque-status'` با `inputSnapshot: { transactionId, status, clearingDate }`
- `preparePostedJournal` + `commitFinancialDomains` به‌جای `persistPostedJournal` + `saveCommerceData` جداگانه
- پوشش سه وضعیت: `cleared` | `bounced` | `void`
- `sourceDocumentId` ثابت: `${tx.id}:clear|bounce|void` برای idempotency

### ۲. بازیابی وضعیت چک
در `recoverPendingCommerceOperation`:
- اگر چک قبلاً به همان وضعیت رسیده → tombstone + recovered
- اگر هنوز `pending` → اجرای مجدد `updateChequeStatus`
- در غیر این صورت blocked با پیام واضح

### ۳. هم‌ترازی موجودی کارت کالا
تابع جدید `reconcileProductStockFromCosting(productIds?)`:
- منبع حقیقت: آخرین `afterQtyMilli` در `costing.movements` برای هر کالا
- در صورت اختلاف با `product.systemQty` → اصلاح کارت + `saveAppState`
- فراخوانی پس از بازیابی موفق فاکتور (برای ردیف‌های دارای `productId`)

### ۴. `main.ts`
- import تابع هم‌ترازی برای استفاده در مسیر boot / آینده

## نتیجه

| مسیر | Journal | Commit اتمیک | بازیابی |
|------|---------|--------------|---------|
| فاکتور | ✓ | ✓ | ✓ + reconcile qty |
| دریافت/پرداخت | ✓ | ✓ | ✓ |
| وضعیت چک | ✓ | ✓ | ✓ |
| کارت کالا | — | ثانویه | reconcile از movements |

## محدودیت باقی‌مانده
- ظهرنویسی چک (endorsement) هنوز مسیر جداگانه دارد و در این مرحله به Journal کامل وصل نشده است.
- NRV همچنان مسیر جبرانی جدا دارد.
- تست کرش واقعی روی دستگاه هنوز انجام نشده است.

## توصیه تست دستی
1. ثبت چک دریافتنی/پرداختنی
2. وصول / برگشت / ابطال — در میانه، کشتن فرایند
3. باز کردن مجدد اپ — باید وضعیت چک و سند بازیابی شود
4. ثبت فاکتور کالایی، کرش، بازیابی — موجودی کارت باید با گردش یکی باشد
