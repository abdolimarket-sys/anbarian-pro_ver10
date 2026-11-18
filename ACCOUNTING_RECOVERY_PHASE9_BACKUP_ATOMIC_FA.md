# فاز ۹ — بازیابی پشتیبان اتمیک

## مشکل
اعمال پشتیبان/rollback سه دامنه را جدا می‌نوشت:
`saveAccountingData` → `saveCommerceData` → `saveInventoryCostData`

قطع بین این سه خط می‌توانست حسابداری را از بازرگانی/بهای تمام‌شده جدا کند.

## اصلاح
- `commitRestoredFinancialSnapshot` در `financial-commit.ts`
- همه مسیرهای restore/rollback در `device-auto-backup.ts` از commit اتمیک استفاده می‌کنند
- پس از restore: `syncProductCardsFromCostingTruth()` برای هم‌ترازی کارت کالا

## مسیرهای پوشش‌داده‌شده
- بازیابی از پشتیبان خارجی
- بازیابی انتخابی با journal
- snapshot اضطراری
- rollback پس از شکست restore

## گام ضروری بعدی (بعد از این)
1. `npm run typecheck` روی ماشین توسعه
2. شکستن تدریجی UI غول‌پیکر
3. تست دستی restore + Force Stop وسط restore
