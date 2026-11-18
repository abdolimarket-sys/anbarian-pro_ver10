# فاز ۱۲ — استخراج لایه مشترک UI بازرگانی

## انجام‌شده
- `commerce-ui-shared.ts`: fa, esc, digits, el, money, invoiceRoots, q/qAll, invoiceTypeTitle
- `accounting-commerce-ui.ts` به این لایه وابسته شد (حذف تعریف‌های تکراری)
- رفع خرابی ناشی از استخراج `invoicePaymentTermsLabel`

## ادامه شکستن UI (پیشنهاد ترتیب)
1. `commerce-ui-cheques.ts` — chequePanel + handlerهای وصول/برگشت/ظهرنویسی
2. `commerce-ui-invoice-form.ts` — ردیف فاکتور و totals
3. `commerce-ui-settlement.ts` — برگه تسویه
