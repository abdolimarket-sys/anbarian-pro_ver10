import { toast } from './ui';
import { exportExcel, exportCSV, processImportFile, loadSheetJS } from './import-export';
import { requirePremium } from './license';

export interface ImportExportEventDependencies {
  updateHeader: () => void;
  refreshLists: () => void;
}

let eventsBound = false;

/** اتصال یک‌باره رویدادهای ورود فایل و خروجی گرفتن از اطلاعات. */
export function bindImportExportEvents(deps: ImportExportEventDependencies): void {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById('btnImport')?.addEventListener('click', () => {
    document.getElementById('importFile')?.click();
  });
  document.getElementById('importFile')?.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const status = document.getElementById('importStatus');
    if (status) status.textContent = 'در حال پردازش...';
    try {
      await loadSheetJS();
      const result = await processImportFile(file);
      if (status) {
        status.textContent = result
          ? `انجام شد: ${result.added} جدید، ${result.updated} به‌روز`
          : 'لغو یا ناموفق';
      }
      deps.updateHeader();
      deps.refreshLists();
    } catch (error) {
      console.error('[Anbarin] import file failed:', error);
      if (status) status.textContent = 'ورود فایل ناموفق بود';
      toast('ورود فایل ناموفق بود؛ فایل را بررسی و دوباره تلاش کنید', 'error');
    } finally {
      input.value = '';
    }
  });
  document.getElementById('btnExportExcel')?.addEventListener('click', async () => {
    if (!requirePremium('خروجی اکسل')) return;
    try {
      await loadSheetJS();
      exportExcel(false);
    } catch (error) {
      console.error('[Anbarin] Excel export failed:', error);
      toast('خروجی اکسل ناموفق بود', 'error');
    }
  });
  document.getElementById('btnExportDiff')?.addEventListener('click', async () => {
    if (!requirePremium('خروجی مغایرت')) return;
    try {
      await loadSheetJS();
      exportExcel(true);
    } catch (error) {
      console.error('[Anbarin] difference export failed:', error);
      toast('خروجی مغایرت ناموفق بود', 'error');
    }
  });
  document.getElementById('btnExportCsv')?.addEventListener('click', () => {
    try { exportCSV(false); }
    catch (error) {
      console.error('[Anbarin] CSV export failed:', error);
      toast('خروجی CSV ناموفق بود', 'error');
    }
  });
}
