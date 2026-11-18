/**
 * ابزارهای مشترک جدول UI بازرگانی — محدودسازی ردیف برای عملکرد.
 */

/** حداکثر ردیف پیش‌فرض برای جداول سنگین روی موبایل */
export const DEFAULT_TABLE_ROW_LIMIT = 80;

/**
 * برش ردیف‌های HTML و افزودن پیام «نمایش محدود».
 * rowsHtmlItems: آرایهٔ <tr>...</tr>
 */
export function limitTableRowItems(
  rowItems: string[],
  options?: { limit?: number; emptyHtml?: string; moreHint?: string },
): string {
  const limit = options?.limit ?? DEFAULT_TABLE_ROW_LIMIT;
  const emptyHtml = options?.emptyHtml ?? '<tr><td colspan="99">موردی نیست</td></tr>';
  if (!rowItems.length) return emptyHtml;
  const shown = rowItems.slice(0, limit);
  const extra = rowItems.length - shown.length;
  let html = shown.join('');
  if (extra > 0) {
    const hint = options?.moreHint
      ?? `نمایش ${shown.length} از ${rowItems.length} ردیف — برای دیدن همه، فیلتر یا جستجو را محدودتر کنید.`;
    html += `<tr><td colspan="99" class="hint" style="text-align:center;padding:10px">${hint}</td></tr>`;
  }
  return html;
}

export function joinRowsOrEmpty(rowItems: string[], emptyHtml: string): string {
  return rowItems.length ? rowItems.join('') : emptyHtml;
}
