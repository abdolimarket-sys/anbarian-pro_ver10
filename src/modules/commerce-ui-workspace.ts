/**
 * پوسته workspace بازرگانی — home + اسکلت sectionها بدون محتوای سنگین.
 */
import type { CommercePanelSection } from './commerce-ui-panel-render';

export function buildCommerceHomeHtml(): string {
  return `<div class="commerce-home">
    <p class="hint">هر عملیات بازرگانی در برگه تمام‌صفحه جدا باز می‌شود.</p>
    <div class="accounting-home-grid" role="navigation" aria-label="بخش‌های بازرگانی">
      <button type="button" class="accounting-home-tile" id="openInvoiceTypeSheet"><span class="accounting-home-icon invoice" aria-hidden="true">🧾</span><strong>فاکتور</strong><span class="hint">فروش، خرید، برگشت و پیش‌فاکتور</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="parties"><span class="accounting-home-icon party" aria-hidden="true">👤</span><strong>طرف حساب‌ها</strong><span class="hint">تعریف مشتری و تأمین‌کننده</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="receipts"><span class="accounting-home-icon receipt" aria-hidden="true">💵</span><strong>دریافت / پرداخت</strong><span class="hint">نقد، کارت، چک و تخصیص</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="banking"><span class="accounting-home-icon banking" aria-hidden="true">🏦</span><strong>بانک</strong><span class="hint">حساب بانکی و صورت‌حساب</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="operating"><span class="accounting-home-icon expense" aria-hidden="true">📒</span><strong>هزینه و درآمد</strong><span class="hint">ثبت هزینه و درآمد متفرقه</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="inventory"><span class="accounting-home-icon inventory" aria-hidden="true">📦</span><strong>انبار</strong><span class="hint">بهای موجودی و تطبیق</span></button>
    </div>
  </div>`;
}

/** اسکلت sectionها؛ محتوا بعداً فقط برای بخش فعال پر می‌شود */
export function buildCommerceSectionShellsHtml(): string {
  const keys = ['invoices', 'management', 'inventory', 'receipts', 'parties', 'operating', 'cheques', 'aging', 'banking'];
  return keys.map((key) => `<section data-commerce-section="${key}" hidden></section>`).join('\n');
}

export function setCommerceSectionVisibility(
  root: ParentNode,
  active: CommercePanelSection | 'home',
  sectionKeyFor: (s: CommercePanelSection) => string,
): void {
  const home = root.querySelector<HTMLElement>('.commerce-home');
  if (home) {
    if (active === 'home') home.removeAttribute('hidden');
    else home.setAttribute('hidden', '');
  }
  const activeKey =
    active === 'home'
      ? ''
      : active === 'sale' || active === 'purchase'
        ? 'invoices'
        : sectionKeyFor(active);
  root.querySelectorAll<HTMLElement>('[data-commerce-section]').forEach((sec) => {
    const key = sec.getAttribute('data-commerce-section') || '';
    if (key && key === activeKey) sec.removeAttribute('hidden');
    else sec.setAttribute('hidden', '');
  });
}
