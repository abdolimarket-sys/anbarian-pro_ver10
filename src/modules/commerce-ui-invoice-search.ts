/**
 * اتصال جستجوی کالای فاکتور — بدون state سراسری بازرگانی.
 * وابستگی‌ها از بیرون تزریق می‌شوند تا accounting-commerce-ui نازک بماند.
 */

export type InvoiceSearchProduct = {
  id: string;
  name: string;
  code?: string;
  sku?: string;
  unit?: string;
  systemQty?: number;
};

export interface InvoiceProductSearchDeps {
  el: <T extends HTMLElement>(selector: string) => T | null;
  esc: (value: string) => string;
  fa: (value: number) => string;
  digits: (value: string) => string;
  toast: (message: string, kind?: 'success' | 'error' | 'info') => void;
  products: InvoiceSearchProduct[];
  invoiceProductMatches: (value: string) => InvoiceSearchProduct[];
  resolveInvoiceProduct: (value: string) => InvoiceSearchProduct | null;
  findProductByCode: (code: string) => InvoiceSearchProduct | null;
  addProductToInvoice: (productId: string, fromScanOrSearch?: boolean) => void;
  addInvoiceLine: () => void;
  beginInvoiceScan: () => void;
  openScanner: (opts: { title: string }) => void;
  offerAddProduct: (
    value: string,
    opts: { asName: boolean; onSaved: (productId: string) => void },
  ) => void;
}

export function bindInvoiceProductSearch(
  root: ParentNode = document,
  deps: InvoiceProductSearchDeps,
): void {
  const {
    el,
    esc,
    fa,
    digits,
    toast,
    products,
    invoiceProductMatches,
    resolveInvoiceProduct,
    findProductByCode,
    addProductToInvoice,
    addInvoiceLine,
    beginInvoiceScan,
    openScanner,
    offerAddProduct,
  } = deps;

  const scope = root instanceof Element ? root : document;
  const searchInput =
    scope.querySelector<HTMLInputElement>('#invoiceProductSearch') ||
    el<HTMLInputElement>('#invoiceProductSearch');
  const addBtn =
    scope.querySelector<HTMLButtonElement>('#invoiceProductAdd') ||
    el<HTMLButtonElement>('#invoiceProductAdd');
  const addLineBtn =
    scope.querySelector<HTMLButtonElement>('#invoiceAddLine') ||
    el<HTMLButtonElement>('#invoiceAddLine');
  const scanBtn =
    scope.querySelector<HTMLButtonElement>('#invoiceScanOpen') ||
    el<HTMLButtonElement>('#invoiceScanOpen');
  if (!searchInput) return;

  // جلوگیری از دوباره‌اتصال روی همان نود
  if (searchInput.dataset.searchBound === '1') return;
  searchInput.dataset.searchBound = '1';

  let suggestionIndex = 0;

  const hideSuggestions = () => {
    const box =
      scope.querySelector<HTMLDivElement>('#invoiceProductSuggestions') ||
      el<HTMLDivElement>('#invoiceProductSuggestions');
    if (box) {
      box.hidden = true;
      box.innerHTML = '';
    }
  };

  const showSuggestions = (value: string) => {
    const host =
      scope.querySelector<HTMLDivElement>('#invoiceProductSuggestions') ||
      el<HTMLDivElement>('#invoiceProductSuggestions');
    if (!host) return;
    const matches = invoiceProductMatches(value);
    if (!matches.length) {
      host.innerHTML = value.trim()
        ? `<button type="button" class="invoice-product-suggestion" data-invoice-product-create="1"><span><b>کالا پیدا نشد</b><small>برای تعریف «${esc(value.trim())}» کلیک کنید</small></span></button>`
        : '';
      host.hidden = !value.trim();
      host.querySelectorAll('[data-invoice-product-create]').forEach((b) =>
        b.addEventListener('click', () => {
          hideSuggestions();
          addBySearch();
        }),
      );
      return;
    }
    host.innerHTML = matches
      .map(
        (p, i) =>
          `<button type="button" class="invoice-product-suggestion ${i === suggestionIndex ? 'active' : ''}" role="option" data-invoice-product-choice="${esc(p.id)}">` +
          `<span><b>${esc(p.name)}</b><small>${esc(p.code || p.sku || 'بدون کد')} · ${esc(p.unit || 'عدد')}</small></span>` +
          `<span class="suggestion-stock">موجودی ${fa(Number(p.systemQty) || 0)}</span></button>`,
      )
      .join('');
    host.hidden = false;
    host.querySelectorAll<HTMLElement>('[data-invoice-product-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.invoiceProductChoice;
        if (!id) return;
        addProductToInvoice(id, true);
        searchInput.value = '';
        hideSuggestions();
      });
    });
  };

  const addBySearch = () => {
    const value = (searchInput.value || '').trim();
    if (!value) {
      toast('نام کالا یا بارکد را وارد کنید.', 'error');
      return;
    }
    const byCode = findProductByCode(digits(value));
    const product = byCode || resolveInvoiceProduct(value);
    if (!product) {
      const looksLikeBarcode = /^[0-9۰-۹٠-٩\-\s]{4,}$/.test(value);
      offerAddProduct(value, {
        asName: !looksLikeBarcode,
        onSaved: (productId) => {
          addProductToInvoice(productId, true);
          searchInput.value = '';
          hideSuggestions();
          toast('کالا تعریف شد و به اقلام فاکتور اضافه شد.', 'success');
        },
      });
      return;
    }
    addProductToInvoice(product.id, true);
    searchInput.value = '';
    hideSuggestions();
    const status =
      scope.querySelector<HTMLElement>('#invoiceScanStatus') ||
      el<HTMLElement>('#invoiceScanStatus');
    if (status) status.textContent = `✓ ${product.name} اضافه شد`;
  };

  searchInput.oninput = () => {
    suggestionIndex = 0;
    showSuggestions(searchInput.value);
  };
  searchInput.onkeydown = (event: KeyboardEvent) => {
    const matches = invoiceProductMatches(searchInput.value);
    if (event.key === 'ArrowDown' && matches.length) {
      event.preventDefault();
      suggestionIndex = Math.min(matches.length - 1, suggestionIndex + 1);
      showSuggestions(searchInput.value);
    } else if (event.key === 'ArrowUp' && matches.length) {
      event.preventDefault();
      suggestionIndex = Math.max(0, suggestionIndex - 1);
      showSuggestions(searchInput.value);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = matches[suggestionIndex] || resolveInvoiceProduct(searchInput.value);
      if (chosen) {
        addProductToInvoice(chosen.id, true);
        searchInput.value = '';
        hideSuggestions();
      } else {
        addBySearch();
      }
    } else if (event.key === 'Escape') {
      hideSuggestions();
    }
  };
  searchInput.onfocus = () => {
    if (searchInput.value.trim()) showSuggestions(searchInput.value);
  };

  if (addBtn) {
    addBtn.onclick = (ev) => {
      ev.preventDefault();
      addBySearch();
    };
  }
  if (addLineBtn) {
    addLineBtn.onclick = (ev) => {
      ev.preventDefault();
      addInvoiceLine();
    };
  }
  if (scanBtn) {
    scanBtn.onclick = () => {
      beginInvoiceScan();
      openScanner({ title: 'اسکن پیوسته بارکد کالا برای فاکتور' });
    };
  }

  if (!products.length) {
    const status =
      scope.querySelector<HTMLElement>('#invoiceScanStatus') ||
      el<HTMLElement>('#invoiceScanStatus');
    if (status) {
      status.textContent =
        'کالایی در سیستم نیست؛ ابتدا در بخش کالاها تعریف کنید یا نام جدید بزنید و افزودن کنید.';
    }
  }
}
