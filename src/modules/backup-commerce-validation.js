/** Runtime validation shared by both manual and external backup restore paths.
 * Intentionally has no invoice-line count ceiling: the 500-item limit belongs
 * only to the taxpayer draft API, never to full backup/restore.
 *
 * CommercialInvoice از فیلد `lines` استفاده می‌کند (نه `items`).
 * نسخهٔ قبلی به‌اشتباه `items` را بررسی می‌کرد و ساختار واقعی فاکتور را
 * اعتبارسنجی نمی‌کرد.
 */
export function isValidCommerceBackup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (!Array.isArray(value.parties) || !Array.isArray(value.invoices)) return false;
  // cashTransactions در CommerceData اجباری است؛ برای سازگاری با بکاپ‌های خیلی قدیمی اختیاری می‌ماند ولی اگر هست باید آرایه باشد
  if (value.cashTransactions != null && !Array.isArray(value.cashTransactions)) return false;

  return value.invoices.every((invoice) => {
    if (!invoice || typeof invoice !== 'object' || Array.isArray(invoice)) return false;

    // فیلد صحیح ردیف‌های فاکتور: lines
    if (invoice.lines !== undefined) {
      if (!Array.isArray(invoice.lines)) return false;
      if (!invoice.lines.every((line) => !!line && typeof line === 'object' && !Array.isArray(line))) return false;
    }

    // سازگاری عقب‌رو: اگر بکاپ قدیمی هنوز items داشت، همان را هم به‌عنوان آرایه اشیاء بپذیر
    if (invoice.items !== undefined) {
      if (!Array.isArray(invoice.items)) return false;
      if (!invoice.items.every((item) => !!item && typeof item === 'object' && !Array.isArray(item))) return false;
    }

    return true;
  });
}
