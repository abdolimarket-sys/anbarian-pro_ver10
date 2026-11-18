# گزارش مرحله هفتم — ظهرنویسی چک و NRV اتمیک

## دامنه
نسخه مبنا: phase6 (وضعیت چک + هم‌ترازی موجودی)

## تغییرات

### ۱. ظهرنویسی چک (`accounting-cheque-endorsement.ts`)
- `beginCommerceOperation` با `kind: 'cheque-endorsement'` و `inputSnapshot` کامل
- ساخت سند + رکورد endorsement در حافظه
- `commitFinancialDomains` برای accounting + commerce در یک تراکنش
- `recoverChequeEndorsementFromSnapshot` برای بازیابی
- idempotency با `sourceDocumentId = ${txId}:endorsement:${sequence}`

### ۲. کاهش ارزش NRV (`postInventoryNrvWriteDown`)
- `sourceId` پایدار بدون `Date.now` برای idempotency
- Journal + costing در یک `commitFinancialDomains`
- حذف مسیر rollback جبرانی دوگانه قبلی
- بازیابی از `inputSnapshot` در استارت برنامه

### ۳. انواع عملیات Journal
```
post-invoice | cash-transaction | cheque-status
| cheque-endorsement | nrv-write-down
```

## پوشش نهایی مسیرهای مالی حساس

| مسیر | اتمیک | بازیابی |
|------|-------|---------|
| فاکتور | ✓ | ✓ + reconcile qty |
| دریافت/پرداخت | ✓ | ✓ |
| وضعیت چک | ✓ | ✓ |
| ظهرنویسی چک | ✓ | ✓ |
| NRV | ✓ | ✓ |

## باقی‌مانده
- تست کرش واقعی روی Android/WebView
- `npm run typecheck` و build روی محیط توسعه
- مسیرهای فرعی احتمالی (مثلاً اسناد انبار غیر بازرگانی) در صورت وجود

## توصیه
این نسخه را با سناریوهای زیر روی دستگاه آزمایش کنید:
1. ظهرنویسی جزئی چک + بستن اجباری اپ
2. ثبت NRV + کرش
3. ترکیب فاکتور → دریافت چکی → ظهرنویسی → وصول
