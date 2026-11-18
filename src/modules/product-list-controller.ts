/** مدیریت فهرست کالاها، فهرست شمارش، جستجو و فیلترها */
import { formatFaNumber, qtyEqual } from '../utils/helpers';
import { filterProductsAdvanced, setLocationFilter, locationFilter, fillLocationSelect, guardWrite } from './filters-roles';
import { createVirtualList, type VirtualListHandle } from './virtual-list';
import { setProductsChangeListener } from './products-ui';
import type { Product } from '../types';

type ProductListDeps = {
  openProductModal: (id?: string | null) => void;
  showPhotoModal: (id: string) => void;
};
type ProductListCallbacks = {
  updateHeader: () => void;
  refreshCardexProductSelect: () => void;
};

export function createProductListController(deps: ProductListDeps) {
  let productsVList: VirtualListHandle | null = null;
  let countVList: VirtualListHandle | null = null;
  let productSearchQuery = '';
  let countFilter: 'all' | 'counted' | 'uncounted' | 'diff' = 'all';
  let productEventsBound = false;

  const getFilteredProducts = (): Product[] => filterProductsAdvanced({ query: productSearchQuery, location: locationFilter });
  const getFilteredCountList = (): Product[] => filterProductsAdvanced({ query: productSearchQuery, location: locationFilter, countFilter });

  function renderProductRow(p: Product): HTMLElement {
    const el = document.createElement('div');
    el.className = 'vrow';
    const main = document.createElement('div');
    main.className = 'vrow-main';
    const name = document.createElement('div');
    name.className = 'vrow-name';
    name.textContent = p.name;
    const meta = document.createElement('div');
    meta.className = 'vrow-meta';
    meta.textContent = `${p.code || p.sku || '—'}${p.location ? ' · 📍 ' + p.location : ''}`;
    main.append(name, meta);
    const side = document.createElement('div');
    side.className = 'vrow-side';
    const systemQty = document.createElement('span');
    systemQty.className = 'vrow-sys';
    systemQty.textContent = formatFaNumber(p.systemQty);
    side.appendChild(systemQty);
    if (p.countedQty != null) {
      const counted = document.createElement('span');
      counted.className = 'vrow-badge';
      counted.textContent = `شمارش: ${formatFaNumber(p.countedQty)}`;
      side.appendChild(counted);
    }
    el.append(main, side);
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => deps.openProductModal(p.id));
    return el;
  }

  function renderCountRow(p: Product): HTMLElement {
    const el = document.createElement('div');
    el.className = 'vrow vrow-count';
    el.dataset.id = p.id;
    const main = document.createElement('div');
    main.className = 'vrow-main';
    const name = document.createElement('div');
    name.className = 'vrow-name';
    name.textContent = p.name + (p.photo ? ' 📷' : '');
    const meta = document.createElement('div');
    meta.className = 'vrow-meta';
    meta.textContent = `${p.code || p.sku || '—'} · سیستم: ${formatFaNumber(p.systemQty)}`;
    main.append(name, meta);
    const side = document.createElement('div');
    side.className = 'vrow-side';
    const countValue = document.createElement('span');
    countValue.className = 'vrow-count-val';
    countValue.textContent = p.countedQty == null ? '—' : formatFaNumber(p.countedQty);
    side.appendChild(countValue);
    const c = p.countedQty;
    if (c != null && !qtyEqual(c, p.systemQty)) {
      const diff = c - (Number(p.systemQty) || 0);
      const diffEl = document.createElement('span');
      diffEl.className = 'vrow-diff';
      diffEl.style.color = diff > 0 ? 'var(--success)' : 'var(--danger)';
      diffEl.textContent = `${diff > 0 ? '+' : ''}${formatFaNumber(diff)}`;
      side.appendChild(diffEl);
    }
    el.append(main, side);
    el.addEventListener('click', (ev) => {
      if (p.photo || (ev as MouseEvent).altKey) deps.showPhotoModal(p.id);
    });
    return el;
  }

  function setupVirtualLists(): void {
    const prodBox = document.getElementById('productsVList');
    if (prodBox) {
      productsVList?.destroy();
      productsVList = createVirtualList<Product>({ container: prodBox, rowHeight: 64, overscan: 8, getItems: getFilteredProducts, renderRow: renderProductRow, getKey: (p) => p.id });
    }
    const countBox = document.getElementById('countVList');
    if (countBox) {
      countVList?.destroy();
      countVList = createVirtualList<Product>({ container: countBox, rowHeight: 68, overscan: 8, getItems: getFilteredCountList, renderRow: renderCountRow, getKey: (p) => p.id });
    }
  }

  function refreshLists(): void {
    fillLocationSelect();
    fillLocationSelect('locationFilterSelectProducts');
    productsVList?.refresh();
    countVList?.refresh();
    const pc = document.getElementById('productCount');
    if (pc) pc.textContent = formatFaNumber(getFilteredProducts().length);
    const cc = document.getElementById('countListCount');
    if (cc) cc.textContent = formatFaNumber(getFilteredCountList().length);
  }

  function bindEvents(callbacks: ProductListCallbacks): void {
    if (productEventsBound) return;
    productEventsBound = true;
    const onLoc = (val: string) => {
      setLocationFilter(val);
      const a = document.getElementById('locationFilterSelect') as HTMLSelectElement | null;
      const b = document.getElementById('locationFilterSelectProducts') as HTMLSelectElement | null;
      if (a) a.value = val;
      if (b) b.value = val;
      refreshLists();
    };
    document.getElementById('locationFilterSelect')?.addEventListener('change', (e) => onLoc((e.target as HTMLSelectElement).value));
    document.getElementById('locationFilterSelectProducts')?.addEventListener('change', (e) => onLoc((e.target as HTMLSelectElement).value));

    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    const onSearch = (val: string) => {
      productSearchQuery = val;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => refreshLists(), 180);
    };
    document.getElementById('searchProducts')?.addEventListener('input', (e) => onSearch((e.target as HTMLInputElement).value));
    document.getElementById('searchCount')?.addEventListener('input', (e) => onSearch((e.target as HTMLInputElement).value));
    document.querySelectorAll('.filter-chip').forEach((chip) => chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      countFilter = ((chip as HTMLElement).dataset.cf as typeof countFilter) || 'all';
      refreshLists();
    }));

    document.getElementById('btnAddProduct')?.addEventListener('click', () => {
      if (!guardWrite('افزودن کالا')) return;
      deps.openProductModal();
    });
    setProductsChangeListener(() => {
      callbacks.updateHeader();
      refreshLists();
      callbacks.refreshCardexProductSelect();
    });
  }

  return { setupVirtualLists, refreshLists, bindEvents };
}
