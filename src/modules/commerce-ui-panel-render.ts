/** توابع خالص رندر پوسته پنل‌های بازرگانی؛ بدون وابستگی به state یا DOM. */
export type CommercePanelSection =
  | 'sale' | 'purchase' | 'receipts' | 'cheques' | 'aging'
  | 'banking' | 'management' | 'inventory' | 'parties' | 'operating';

const PANEL_TITLES: Record<CommercePanelSection, string> = {
  sale: 'فاکتور فروش',
  purchase: 'فاکتور خرید',
  receipts: 'دریافت / پرداخت',
  cheques: 'چک‌ها',
  aging: 'سررسید',
  banking: 'بانک',
  management: 'سودآوری',
  inventory: 'انبار',
  parties: 'طرف حساب‌ها',
  operating: 'هزینه و درآمد',
};

export function commercePanelTitle(section: CommercePanelSection): string {
  return PANEL_TITLES[section] || 'بازرگانی';
}

export function commercePanelSectionKey(section: CommercePanelSection): string {
  return section === 'sale' || section === 'purchase' ? 'invoices' : section;
}

export function buildCommercePanelShellHtml(section: CommercePanelSection): string {
  return `<div class="accounting-module-sheet-inner"><header class="accounting-module-sheet-head"><div><p class="accounting-module-sheet-kicker">بازرگانی</p><h2>${commercePanelTitle(section)}</h2></div><button type="button" class="btn btn-secondary" id="commercePanelClose">بازگشت</button></header><div class="accounting-module-sheet-body" id="commercePanelMount"></div></div>`;
}

export function buildCommercePanelEmptyHtml(): string {
  return '<div class="card"><p class="hint">محتوای این بخش در دسترس نیست. بازگشت را بزنید و دوباره تلاش کنید.</p></div>';
}

export function buildInvoiceTypeSheetHtml(): string {
  return `<div style="max-width:760px;margin:8vh auto"><div style="display:flex;justify-content:space-between;align-items:center"><h2>فاکتور</h2><button class="btn btn-secondary" id="invoiceTypeClose">بستن</button></div><div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-top:16px"><button class="btn btn-primary" data-new-invoice-type="sale">فروش</button><button class="btn btn-primary" data-new-invoice-type="purchase">خرید</button><button class="btn btn-secondary" data-new-invoice-type="return-sale">برگشت از فروش</button><button class="btn btn-secondary" data-new-invoice-type="return-purchase">برگشت از خرید</button><button class="btn btn-secondary" data-new-invoice-type="proforma">پیش‌فاکتور</button></div></div>`;
}
