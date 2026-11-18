/**
 * پوسته مشترک برگه‌های تمام‌صفحه بازرگانی.
 * بدون state؛ فقط ساخت/بستن overlay و انتقال محتوا.
 */
import { buildCommercePanelShellHtml, buildCommercePanelEmptyHtml, type CommercePanelSection } from './commerce-ui-panel-render';

export type SheetCloseHandler = () => void;

export interface CommerceSheetMount {
  overlay: HTMLDivElement;
  mount: HTMLElement;
  close: () => void;
}

/** ساخت برگه تمام‌صفحه روی body و بازگرداندن mount */
export function createCommerceSheet(
  section: CommercePanelSection,
  onClose: SheetCloseHandler,
  zIndex = 10070,
): CommerceSheetMount {
  document.getElementById('commercePanelSheet')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'commercePanelSheet';
  overlay.className = 'accounting-module-sheet commerce-module-sheet';
  overlay.style.zIndex = String(zIndex);
  overlay.dir = 'rtl';
  overlay.innerHTML = buildCommercePanelShellHtml(section);
  document.body.appendChild(overlay);
  document.body.classList.add('accounting-sheet-open');
  const mount = overlay.querySelector<HTMLElement>('#commercePanelMount');
  if (!mount) {
    overlay.remove();
    throw new Error('commercePanelMount ساخته نشد');
  }
  const close = () => {
    document.getElementById('invoiceItemsSheet')?.remove();
    document.getElementById('partyFormSheet')?.remove();
    onClose();
    overlay.remove();
    if (!document.getElementById('accountingModuleSheet')) {
      document.body.classList.remove('accounting-sheet-open');
    }
  };
  overlay.querySelector('#commercePanelClose')?.addEventListener('click', close);
  return { overlay, mount, close };
}

/** انتقال فرزندان section به mount؛ اگر خالی بود emptyHtml */
export function moveSectionIntoMount(
  sectionEl: HTMLElement,
  mount: HTMLElement,
  emptyHtml: string = buildCommercePanelEmptyHtml(),
): number {
  let moved = 0;
  while (sectionEl.firstChild) {
    mount.appendChild(sectionEl.firstChild);
    moved += 1;
  }
  if (!mount.firstChild) {
    mount.innerHTML = emptyHtml;
  }
  return moved;
}

export function scrollSheetToTop(overlay: HTMLElement, mount: HTMLElement): void {
  overlay.scrollTop = 0;
  try {
    mount.scrollIntoView({ block: 'start' });
  } catch {
    /* ignore scroll failures on old webviews */
  }
}
