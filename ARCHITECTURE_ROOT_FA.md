# معماری ریشه‌ای انبارین — پس از اصلاح اصولی

## اصول اجباری

### ۱. یک تراکنش برای یک عملیات مالی
`commitFinancialDomains` همه کلیدهای مرتبط را در یک `idbPutMany` می‌نویسد:
accounting + costing + commerce + journal tombstone.

### ۲. یک منبع حقیقت برای موجودی
| داده | نقش |
|------|-----|
| `costing.balances` | **حقیقت** تعداد و ارزش |
| `costing.movements` | تاریخچه گردش |
| `product.systemQty` | کش نمایشی — فقط از balances همگام می‌شود |

API: `src/modules/inventory-truth.ts`

### ۳. قفل سری‌سازی
`withCommerceMutationLock` برای فاکتور، نقد، چک، ظهرنویسی، NRV.

### ۴. جداسازی دامنه از UI
- دامنه: `accounting-commerce.ts`, `financial-commit.ts`, `inventory-truth.ts`, `inventory-costing.ts`
- نمای عمومی بدون DOM: `commerce-api.ts`
- UI: `accounting-commerce-ui.ts` (هنوز بزرگ است؛ مصرف باید از commerce-api باشد)

### ۵. بازیابی هنگام boot
`runFinancialIntegrityOnBoot` = Journal recovery + sync کارت از balances

## بدهی باقی‌مانده آگاهانه
- شکستن فیزیکی `accounting-commerce-ui.ts` به چند فایل UI نیازمند refactor جدا و تست رگرسیون UI است.
- امنیت همچنان local-only است تا سرور هویت اضافه شود.
