/**
 * ابزارهای مشترک UI بازرگانی — بدون وابستگی به state بزرگ صفحه فاکتور.
 * اولین برش واقعی از accounting-commerce-ui.ts
 */
import { formatMoneyFromRial } from './accounting';

export type MoneyCurrency = 'rial' | 'toman';

export const fa = (n: number): string => new Intl.NumberFormat('fa-IR').format(n);

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]!,
  );

export const digits = (s: string): string =>
  s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** تبدیل ارقام فارسی/عربی به لاتین و حذف غیررقم — مناسب کلید تاریخ و inRange */
export const latinDigits = (value: string): string => digits(String(value || '')).replace(/[^0-9]/g, '');

export const el = <T extends HTMLElement>(s: string): T | null => document.querySelector<T>(s);

export function makeMoney(currency: MoneyCurrency): (rial: number) => string {
  return (rial: number): string => {
    try {
      return `${fa(Number(formatMoneyFromRial(rial, currency)))} ${currency === 'toman' ? 'تومان' : 'ریال'}`;
    } catch {
      return fa(rial);
    }
  };
}

/** ریشه‌های جستجوی فیلد فاکتور — اولویت با برگه باز */
export function invoiceRoots(): ParentNode[] {
  const sheet = document.getElementById('commercePanelSheet');
  const items = document.getElementById('invoiceItemsSheet');
  const roots: ParentNode[] = [];
  if (sheet) roots.push(sheet);
  if (items) roots.push(items);
  if (!sheet) {
    const ws = document.getElementById('accountingCommerceWorkspace');
    if (ws) roots.push(ws);
  }
  if (!roots.length) roots.push(document);
  return roots;
}

export function qInInvoiceRoots<T extends HTMLElement>(s: string): T | null {
  for (const root of invoiceRoots()) {
    const hit = root.querySelector<T>(s);
    if (hit) return hit;
  }
  return null;
}

export function qAllInInvoiceRoots<T extends HTMLElement>(s: string): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const root of invoiceRoots()) {
    for (const node of root.querySelectorAll<T>(s)) {
      if (seen.has(node)) continue;
      seen.add(node);
      out.push(node);
    }
  }
  return out;
}

export const invoiceTypeTitle = (
  t: 'sale' | 'purchase' | 'return-sale' | 'return-purchase' | 'proforma',
): string =>
  t === 'sale'
    ? 'فاکتور فروش'
    : t === 'purchase'
      ? 'فاکتور خرید'
      : t === 'return-sale'
        ? 'برگشت از فروش'
        : t === 'return-purchase'
          ? 'برگشت از خرید'
          : 'پیش‌فاکتور';


export function invoicePaymentTermsLabel(parts: ReadonlyArray<{method:'cash'|'card'|'cheque'|'credit'}>): string {
  const labels: Record<'cash'|'card'|'cheque'|'credit', string> = {
    cash: 'نقدی', card: 'کارت', cheque: 'چکی', credit: 'اعتباری',
  };
  const unique = [...new Set(parts.map((x) => labels[x.method]))];
  return unique.length > 1 ? 'ترکیبی: ' + unique.join('، ') : unique[0] || 'اعتباری';
}
