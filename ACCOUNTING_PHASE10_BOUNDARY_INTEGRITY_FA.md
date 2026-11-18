# فاز ۱۰ — مرز دامنه/UI + خودآزمایی یکپارچگی

## انجام‌شده
1. گسترش `commerce-api.ts` به‌عنوان تنها نمای عمومی دامنه
2. هدایت importهای اصلی `accounting-commerce-ui.ts` به `commerce-api`
3. ماژول `financial-integrity-check.ts`:
   - عملیات Journal نیمه‌تمام
   - فاکتور posted بدون سند
   - فاکتور کالایی بدون movement
   - تراکنش نقدی بدون سند
   - ناهم‌خوانی کارت کالا با balances
4. اجرای خودکار بررسی در `runFinancialIntegrityOnBoot` + toast در صورت خطای جدی

## گام بعدی پیشنهادی
- شکستن تدریجی `accounting-commerce-ui.ts` به فایل‌های UI جدا (فاکتور / تسویه / چک)
- اتصال گزارش integrity به صفحه «سلامت داده» در UI
