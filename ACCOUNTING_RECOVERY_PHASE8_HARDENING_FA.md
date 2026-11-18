# گزارش مرحله هشتم — سخت‌سازی بازیابی و پروتکل تست

## دامنه
نسخه مبنا: phase7 (ظهرنویسی + NRV)

## تغییرات
1. **`beginCommerceOperation`**: تشخیص عملیات یکسان برای
   - `cheque-endorsement` (بر اساس transactionId)
   - `nrv-write-down` (بر اساس id)
   - و مقایسه عمومی `sameById`
2. **تست قرارداد** `tests/phase-recovery-operation-kinds.test.mjs`
   - انواع kind
   - resume فاکتور / ظهرنویسی / NRV
   - مسدودسازی عملیات متفاوت هنگام pending
   - اجازه عملیات جدید پس از tombstone completed
3. **پروتکل تست کرش Android**  
   `ANDROID_CRASH_TEST_PROTOCOL_FA.md` — سناریوهای S1 تا S6

## اجرا روی ماشین توسعه
```bash
npm install
npm run typecheck
node --test tests/phase-atomic-financial-commit.test.mjs tests/phase-recovery-operation-kinds.test.mjs
npm test   # در صورت وجود مجموعه کامل
```

## وضعیت مهندسی
مسیرهای مالی اصلی اتمیک و قابل بازیابی هستند. ریسک باقی‌مانده عمدتاً عملیاتی است (تأیید روی دستگاه واقعی)، نه شکاف معماری شناخته‌شده در مسیرهای فاکتور/نقد/چک/ظهرنویسی/NRV.

## گام منطقی بعدی (پس از تست دستگاه)
- رفع باگهای کشف‌شده در S1–S6
- در صورت نیاز: اتمیک‌کردن restore پشتیبان چنددامنه‌ای در `device-auto-backup` (مسیر جدا از عملیات روزمره)
