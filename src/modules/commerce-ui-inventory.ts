/**
 * پنل‌های بخش انبار بازرگانی — جدا از God UI.
 * منطق داده در accounting-commerce / inventory-* می‌ماند؛ اینجا فقط ساخت HTML امن.
 */

export type InventoryPanelBuilder = () => Promise<string>;

/** اجرای امن چند پنل؛ شکست یکی بقیه را خراب نمی‌کند. */
export async function buildSafeStackedPanels(
  panels: Array<{ label: string; build: InventoryPanelBuilder }>,
  esc: (s: string) => string,
): Promise<string> {
  const parts: string[] = [];
  for (const panel of panels) {
    try {
      const html = await panel.build();
      if (html && html.trim()) parts.push(html);
    } catch (e) {
      console.error('[Anbarin] inventory panel failed:', panel.label, e);
      const msg = e instanceof Error ? e.message : 'خطای ناشناخته';
      parts.push(
        `<div class="card" style="margin-top:12px"><h3>${panel.label}</h3>` +
          `<p class="hint" style="color:var(--danger,#c43b35)">بارگذاری این بخش ناموفق بود: ${esc(msg)}</p></div>`,
      );
    }
  }
  if (!parts.length) {
    return '<div class="card" style="margin-top:12px"><p class="hint">محتوای انبار در دسترس نیست. بازگشت را بزنید و دوباره تلاش کنید.</p></div>';
  }
  return parts.join('');
}

/** اطمینان از حذف attribute مخفی قبل از انتقال به برگه تمام‌صفحه */
export function revealSection(sectionEl: HTMLElement): void {
  sectionEl.hidden = false;
  sectionEl.removeAttribute('hidden');
}
