# گزارش مرحله نهم — جداسازی رویدادهای مدیریت چک

## مبنا
این مرحله مستقیماً از بسته مرحله هشتم `Anbarin-Pro-v2.1.10-accounting-ui-stage8.zip` ادامه یافته است. تغییرات مراحل قبلی بازنویسی نشده‌اند.

## موارد انجام‌شده
- اتصال رویداد واگذاری چک (`data-chq-endorse`) به binder مستقل منتقل شد.
- انتقال زنجیره‌ای چک (`data-chain-endorsement`) و ثبت نتیجه چک نزد دارنده (`data-chain-outcome`) از اتصال مستقیم DOM خارج شدند.
- رویدادهای تمدید سررسید (`data-chq-extend`)، جایگزینی چک (`data-chq-replace`) و واگذاری به بانک (`data-chq-deposit`) نیز به delegation منتقل شدند.
- تابع `bindChequeManagementActions` در `commerce-ui-actions.ts` با یک listener روی ریشه پایدار و `WeakSet` برای جلوگیری از اتصال چندباره ایجاد شد.
- callbackهای تجاری و فراخوانی سرویس‌های موجود حفظ شدند؛ اعتبارسنجی مبلغ، انتخاب طرف حساب/فاکتور، ثبت رویدادها، بارگذاری مجدد و پیام‌های قبلی تغییر داده نشدند.
- منطق مالی، مانده چک، اسناد حسابداری و ساختار ذخیره‌سازی تغییر نکردند.

## فایل‌های تغییر یافته
- `src/modules/accounting-commerce-ui.ts`
- `src/modules/commerce-ui-actions.ts`
- `tests/phase98-cheque-management-delegated-actions.test.mjs` (جدید)
- `STAGE9_CHEQUE_ACTIONS_2026-11-17_FA.md` (جدید)

## آزمون و بررسی
- `node scripts/run-tests.mjs`: **۴۲۱ آزمون موفق، صفر ناموفق**.
- بررسی نحوی `commerce-ui-actions.ts` و `accounting-commerce-ui.ts` با `node --experimental-strip-types --check`: موفق.
- TypeScript typecheck و Vite production build اجرا نشده‌اند؛ وابستگی‌های پروژه در محیط نصب/آماده نبودند.
- تست دستی مرورگر و گردش واقعی چک با داده آزمایشی اجرا نشده است.

## موارد باقی‌مانده
- این مرحله فقط اتصال رویدادها را جدا می‌کند؛ رابط prompt فعلی را بازطراحی نمی‌کند.
- تفکیک کامل فایل اصلی رابط بازرگانی هنوز تمام نشده و باید در مراحل بعدی با انتقال‌های کوچک و آزمون‌پذیر ادامه یابد.
