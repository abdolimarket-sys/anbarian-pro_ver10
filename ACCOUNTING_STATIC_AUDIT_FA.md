# ممیزی ایستا پس از فازهای ۵–۸ — رفع باگ

## باگ‌های یافت‌شده و رفع‌شده

### B1 — نبود قفل روی NRV (متوسط)
`postInventoryNrvWriteDown` خارج از `withCommerceMutationLock` بود و می‌توانست با ثبت فاکتور/چک هم‌پوشانی کند.
**رفع:** ورود از طریق `postInventoryNrvWriteDownExclusive` داخل قفل.

### B2 — نبود قفل روی ظهرنویسی (متوسط/بالا)
`endorseCheque` بدون قفل بود؛ دو فراخوانی همزمان می‌توانستند `sequence` یکسان و `sourceDocumentId` تکراری بسازند.
**رفع:** `withCommerceMutationLock` + `endorseChequeExclusive`.

### B3 — تکرار احتمالی تراکنش نقدی در بازیابی (کم/متوسط)
`createCashTransactionExclusive` با `fixedTransactionId` وجود قبلی همان id را قبل از اعتبارسنجی شماره چک نمی‌کرد.
**رفع:** early-return اگر `fixedTransactionId` از قبل در `cashTransactions` باشد.

### B4 — منطق idempotent وضعیت چک (کم)
بررسی «قبلاً به همین وضعیت رسیده» بعد از شرط `!== 'pending'` عملاً مرده بود.
**رفع:** اگر چک در همان `status` نهایی باشد، قبل از throw برگردانده می‌شود.

## موارد بررسی‌شده بدون باگ باز

| مورد | نتیجه |
|------|--------|
| بالانس آکولاد فایل‌های اصلی | OK |
| commit اتمیک فاکتور / نقد / چک / NRV / ظهرنویسی | OK |
| بازیابی همه kindها | OK |
| وابستگی چرخشی endorsement ↔ commerce | فقط dynamic import از commerce؛ OK |
| sourceDocumentId پایدار NRV (بدون Date.now) | OK |
| tombstone completed | OK |
| قفل غیرقابل ورود مجدد (غیر reentrant) | عمدی؛ مسیرها تو در تو lock تو در تو صدا نمی‌زنند |

## ریسک باقی‌مانده (غیر باگ قطعی)
1. دادهٔ نیمه‌کارهٔ تولیدشده با نسخه‌های **قبل از** فاز ۵ (قبل از commit اتمیک) ممکن است هنوز ناسازگار باشد؛ بازیابی بهترین تلاش را می‌کند.
2. `app_state` (کارت کالا) هنوز بعد از commit مالی ذخیره می‌شود؛ `reconcileProductStockFromCosting` برای جبران است.
3. restore پشتیبان چنددامنه‌ای در `device-auto-backup` مسیر جداگانه دارد.
4. بدون اجرای `tsc` در این محیط، خطاهای نوع TypeScript احتمالی در فایل‌های دست‌نخورده بررسی نشده‌اند.

## توصیه
روی دستگاه: `npm run typecheck` و سناریوهای S1–S6 پروتکل کرش.
