/** رویدادهای گزارش‌گیری، خروجی‌ها و کاردکس کالا */
import { toast } from './ui';
import { downloadFile } from '../utils/helpers';
import {
  copyTextReport,
  exportAccountingDoc,
  exportDoubleCountMismatches,
  exportStockAlertsCsv,
  exportStockAlertsExcel,
  printStockAlerts,
  exportDiffsExcel,
  exportCountedProductsExcel,
  renderCardex,
  exportProductCardexExcel,
  printProductCardex,
  setActivityHistoryPage,
  setActivityHistoryPageSize,
} from './reports';

type ReportEventCallbacks = {
  updateHeader: () => void;
  refreshCardexProductSelect: () => void;
};

let reportEventsBound = false;
let dynamicReportActionsBound = false;

export function bindReportEvents(callbacks: ReportEventCallbacks): void {
  if (reportEventsBound) return;
  reportEventsBound = true;

  // Reports: static controls
  document.getElementById('btnCopyReport')?.addEventListener('click', () => copyTextReport());
  document.getElementById('btnExportDiffs')?.addEventListener('click', () => exportDiffsExcel());
  document.getElementById('btnExportCountedProducts')?.addEventListener('click', () => exportCountedProductsExcel());
  document.getElementById('btnAccGeneric')?.addEventListener('click', () => exportAccountingDoc('generic'));
  document.getElementById('btnAccHeloo')?.addEventListener('click', () => exportAccountingDoc('heloo'));
  document.getElementById('btnAccSepidar')?.addEventListener('click', () => exportAccountingDoc('sepidar'));
  document.getElementById('btnDoubleDiff')?.addEventListener('click', () => exportDoubleCountMismatches());
  document.getElementById('btnStockAlerts')?.addEventListener('click', () => exportStockAlertsCsv());

  const cardexSelect = document.getElementById('cardexProductSelect') as HTMLSelectElement | null;
  if (cardexSelect) {
    callbacks.refreshCardexProductSelect();
    cardexSelect.addEventListener('change', () => renderCardex(cardexSelect.value));
  }
  document.getElementById('btnCardexExcel')?.addEventListener('click', () => {
    if (cardexSelect?.value) exportProductCardexExcel(cardexSelect.value);
    else toast('ابتدا کالا را انتخاب کنید', 'error');
  });
  document.getElementById('btnCardexPdf')?.addEventListener('click', () => {
    if (cardexSelect?.value) printProductCardex(cardexSelect.value);
    else toast('ابتدا کالا را انتخاب کنید', 'error');
  });

  bindDynamicReportActions(callbacks);
}

function bindDynamicReportActions(callbacks: ReportEventCallbacks): void {
  if (dynamicReportActionsBound) return;
  dynamicReportActionsBound = true;

  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    const button = target?.closest('button');
    if (!button) return;

    if (button.id === 'btnMovementSummaryCSV') {
      const data = (document.getElementById('movementSummaryCSVData') as HTMLTextAreaElement | null)?.value || '';
      if (!data) { toast('داده‌ای برای خروجی وجود ندارد', 'info'); return; }
      downloadFile('\ufeff' + data, 'inventory-movement-summary.csv', 'text/csv;charset=utf-8');
    } else if (button.id === 'btnActivityHistoryPrev' || button.id === 'btnActivityHistoryNext') {
      setActivityHistoryPage(Number(button.dataset.page));
      callbacks.updateHeader();
    } else if (button.id === 'btnActivityHistoryCSV') {
      const data = (document.getElementById('activityHistoryCSVData') as HTMLTextAreaElement | null)?.value || '';
      if (!data) { toast('داده‌ای برای خروجی وجود ندارد', 'info'); return; }
      downloadFile('\ufeff' + data, 'activity-history.csv', 'text/csv;charset=utf-8');
    } else if (button.id === 'btnStockAlertsExcel') {
      exportStockAlertsExcel();
    } else if (button.id === 'btnStockAlertsPdf') {
      void printStockAlerts();
    }
  });

  document.addEventListener('change', (event) => {
    const target = event.target as HTMLSelectElement | null;
    if (target?.id === 'activityHistoryPageSize') {
      setActivityHistoryPageSize(Number(target.value));
      callbacks.updateHeader();
    }
  });
}
