/** اتصال رویدادهای شمارش، اسکن و عملیات موجودی */
import { settings } from './state';
import { toast } from './ui';
import { guardWrite } from './filters-roles';
import { actionClearCounts, actionZeroUncounted } from './session-settings';
import { applyCountsToSystem, resetCountsToSystem, printLabelsBulk } from './labels';
import {
  endInvoiceScan, openScanner, closeScanner, submitManualBarcode, toggleTorch, restartCamera,
} from './scanner';
import {
  confirmQtyModal, closeQtyModal, adjustQtyModal, setQtyModalToSystem,
  updateQtyModalDiff, undoLast,
} from './count';

type InventoryCountEventDeps = {
  updateHeader: () => void;
  refreshLists: () => void;
  updateUndoBtn: () => void;
};

let inventoryCountEventsBound = false;

export function bindInventoryCountEvents(deps: InventoryCountEventDeps): void {
  if (inventoryCountEventsBound) return;
  inventoryCountEventsBound = true;
  const { updateHeader, refreshLists, updateUndoBtn } = deps;

  // دکمه‌های عملیات شمارش باید به توابع واقعی متصل باشند؛ قبلاً فقط در رابط نمایش داده می‌شدند.
  document.getElementById('btnClearCounts')?.addEventListener('click', async () => {
    if (!guardWrite('پاک کردن شمارش‌ها')) return;
    await actionClearCounts();
    updateHeader();
    refreshLists();
  });
  document.getElementById('btnZeroUncounted')?.addEventListener('click', async () => {
    if (!guardWrite('صفر کردن شمارش‌نشده‌ها')) return;
    await actionZeroUncounted();
    updateHeader();
    refreshLists();
  });

  // عملیات همگام‌سازی شمارش با موجودی سیستم؛ این دکمه‌ها قبلاً تابع داشتند
  // اما رویداد کلیک به آن‌ها متصل نشده بود.
  document.getElementById('btnApplySystem')?.addEventListener('click', async () => {
    if (!guardWrite('اعمال شمارش روی موجودی سیستم')) return;
    try {
      if (await applyCountsToSystem()) {
        updateHeader();
        refreshLists();
        updateUndoBtn();
      }
    } catch (err) {
      console.error('[Anbarin] apply counts to system failed:', err);
      toast('اعمال شمارش روی موجودی سیستم ناموفق بود؛ دوباره تلاش کنید', 'error');
    }
  });
  document.getElementById('btnResetToSystem')?.addEventListener('click', async () => {
    if (!guardWrite('برگرداندن شمارش به مقدار سیستم')) return;
    try {
      if (await resetCountsToSystem()) {
        updateHeader();
        refreshLists();
        updateUndoBtn();
      }
    } catch (err) {
      console.error('[Anbarin] reset counts to system failed:', err);
      toast('همسان‌سازی شمارش با موجودی سیستم ناموفق بود؛ دوباره تلاش کنید', 'error');
    }
  });

  // چاپ لیبل بارکد؛ دکمه قبلاً در رابط بود اما رویداد کلیک نداشت.
  document.getElementById('btnPrintLabels')?.addEventListener('click', () => {
    try {
      printLabelsBulk(50);
    } catch (err) {
      console.error('[Anbarin] print barcode labels failed:', err);
      toast('چاپ لیبل انجام نشد؛ مرورگر یا مجوز چاپ را بررسی کنید', 'error');
    }
  });

  document.getElementById('btnOpenScanner')?.addEventListener('click', () => {
    endInvoiceScan(false);
    if (!guardWrite('اسکن')) return;
    const modal = document.getElementById('scannerModal');
    if (modal) modal.style.display = 'flex';
    settings.quickAutoConfirm = false;
    openScanner({ title: 'اسکن بارکد' });
  });

  document.getElementById('btnQuickCount')?.addEventListener('click', () => {
    endInvoiceScan(false);
    if (!guardWrite('شمارش سریع')) return;
    settings.quickAutoConfirm = true;
    const modal = document.getElementById('scannerModal');
    if (modal) modal.style.display = 'flex';
    openScanner({ quick: true, title: 'شمارش سریع ⚡' });
  });

  document.getElementById('btnCloseScanner')?.addEventListener('click', () => {
    endInvoiceScan(false);
    const continuous = document.getElementById('scannerContinuous') as HTMLInputElement | null;
    endInvoiceScan(true);
    settings.quickAutoConfirm = false;
    closeScanner();
    const modal = document.getElementById('scannerModal');
    if (modal) modal.style.display = 'none';
  });

  document.getElementById('torchBtn')?.addEventListener('click', () => toggleTorch());
  document.getElementById('btnRestartCam')?.addEventListener('click', () => restartCamera());
  document.getElementById('btnManualSubmit')?.addEventListener('click', () => submitManualBarcode());
  document.getElementById('manualBarcode')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitManualBarcode();
    }
  });

  document.getElementById('qtyMinus')?.addEventListener('click', () => adjustQtyModal(-1));
  document.getElementById('qtyPlus')?.addEventListener('click', () => adjustQtyModal(1));
  document.getElementById('qtyModalEqBtn')?.addEventListener('click', () => setQtyModalToSystem());
  document.getElementById('qtySet0')?.addEventListener('click', () => {
    const inp = document.getElementById('qtyModalInput') as HTMLInputElement;
    if (inp) {
      inp.value = '0';
      updateQtyModalDiff();
    }
  });
  document.getElementById('qtySet1')?.addEventListener('click', () => {
    const inp = document.getElementById('qtyModalInput') as HTMLInputElement;
    if (inp) {
      inp.value = '1';
      updateQtyModalDiff();
    }
  });
  document.getElementById('qtyCancel')?.addEventListener('click', () => closeQtyModal());
  document.getElementById('qtyConfirm')?.addEventListener('click', () => {
    if (confirmQtyModal()) {
      updateHeader();
      refreshLists();
      const continuous =
        (document.getElementById('scannerContinuous') as HTMLInputElement)?.checked ??
        settings.continuousScan;
      if (!continuous) {
        closeScanner();
        const modal = document.getElementById('scannerModal');
        if (modal) modal.style.display = 'none';
      }
    }
  });
  document.getElementById('qtyModalInput')?.addEventListener('input', () => updateQtyModalDiff());
  document.getElementById('qtyModalInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('qtyConfirm')?.click();
    }
  });

  document.getElementById('undoBtn')?.addEventListener('click', () => {
    undoLast();
    updateUndoBtn();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      const tag = ((e.target as HTMLElement)?.tagName || '').toLowerCase();
      if (tag !== 'input' && tag !== 'textarea') {
        e.preventDefault();
        undoLast();
        updateUndoBtn();
      }
    }
  });


}
