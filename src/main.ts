/**
 * نقطه ورود برنامه انبارین
 */

import './styles/main.css';
import { renderShell } from './bootstrap/app-shell';
import {
  bootState,
  products,
  settings,
  session,
} from './modules/state';
import { toast, showPage, loadTheme, bindThemeControls } from './modules/ui';
import { initLocalAuth } from './modules/local-auth';
import { bindAccessSettingsEvents, bindSessionControlEvents, updateRolePreview } from './modules/access-session-events';
import { initExternalAutoBackupScheduler } from './modules/device-auto-backup';
import { initAccountingUI } from './modules/accounting-ui';
import { initAccountingCommerceUI } from './modules/accounting-commerce-ui';
import { runBootRecovery } from './bootstrap/boot-recovery';
import { initializeServiceWorker } from './bootstrap/service-worker';
import { initAccountingReportsUI } from './modules/accounting-reports';
import { initTaxpayerUI } from './modules/taxpayer';
import { renderDataHealth } from './modules/data-health';
import { initUnifiedDatePickers } from './modules/date-picker';
import { showDueReminderOnEntry } from './modules/due-reminders';
import { bindBackupSettingsEvents } from './modules/backup-settings-events';
import { bindInventoryCountEvents } from './modules/inventory-count-events';
import { bindReportEvents } from './modules/report-events';
import { updateHeader } from './modules/header-updater';
import { initScannerController, updateScannerCapabilities } from './modules/scanner-controller';
import { bindImportExportEvents } from './modules/import-export-events';
import { bindTeamPhotoLicenseEvents } from './modules/team-photo-license-events';

// پیام نهایی ذخیره‌سازی فایل در اپ اندروید (پس از انتخاب پوشه و نوشتن موفق).
window.addEventListener('anbarin:file-saved', (event: Event) => {
  const detail = (event as CustomEvent<{ filename?: string }>).detail;
  toast(`گزارش با موفقیت ذخیره شد: ${detail?.filename || 'فایل'}`, 'success');
});
window.addEventListener('anbarin:file-save-error', () => {
  toast('ذخیره گزارش ناموفق بود؛ دوباره تلاش کنید.', 'error');
});
import { initInventoryDocumentsUI } from './modules/inventory-documents';
import { enhanceSelectWithSearch } from './modules/searchable-select';
import { canUndo, setCountChangeListener } from './modules/count';
import {
  fillSettingsForm,
  actionSetPhase,
  bindBusinessLogoControls,
} from './modules/session-settings';
import { openSmsComposeDialog, sendSms, isSmsConfigured } from './modules/sms';
import {
  initAccountingTemplateUI,
} from './modules/reports';


import { openProductModal } from './modules/products-ui';
import { showPhotoModal } from './modules/photos';
import {
  renderAuditList,
  exportAuditCSV,
  clearAuditLog,
  ensureAuditStyles,
} from './modules/audit-ui';


import { applyLicenseModuleUI, moduleForPage, requireModule, describeActiveModules } from './modules/license-modules';
import { createProductListController } from './modules/product-list-controller';

let cardexOptionsSignature: string | null = null;
let authReadyUiListenerRegistered = false;
// جلوگیری از اجرای موازی/تکراری راه‌اندازی؛ binders یک‌بار ثبت می‌شوند و shell نباید دوباره ساخته شود.
let bootStarted = false;

const productListController = createProductListController({ openProductModal, showPhotoModal });
const setupVirtualLists = productListController.setupVirtualLists;
function refreshLists() {
  productListController.refreshLists();
  refreshCardexProductSelect();
}

/** ثبت یک‌باره‌ی شنونده‌ی ورود؛ bootApp ممکن است بیش از یک بار اجرا شود. */
function registerAuthReadyUiListener(): void {
  if (authReadyUiListenerRegistered) return;
  authReadyUiListenerRegistered = true;

  window.addEventListener('anbarin:auth-ready', ((ev: Event) => {
    const detail = (ev as CustomEvent<{ isFirstAccount?: boolean; name?: string }>).detail || {};
    let justRestored = 0;
    try { justRestored = Number(sessionStorage.getItem('anbarin_just_restored_external') || 0); } catch { justRestored = 0; }
    if (detail.isFirstAccount) {
      toast(`خوش آمدید${detail.name ? ' ' + detail.name : ''} — حساب مدیر ساخته شد`, 'success');
      if (products.length === 0 && justRestored <= 0) {
        setTimeout(() => toast('قدم بعد: از بخش کالاها، کالا اضافه یا فایل اکسل وارد کنید', 'info'), 900);
      }
      return;
    }
    // اگر همین لحظه از پشتیبان بیرونی بازیابی شده، پیام «کالا خالی» نشان نده
    if (products.length === 0 && justRestored <= 0) {
      toast('هنوز کالایی ثبت نشده — از بخش کالاها شروع کنید', 'info');
    }
    try { sessionStorage.removeItem('anbarin_just_restored_external'); } catch { /* ignore */ }
  }) as EventListener);
}

async function bootApp() {
  if (bootStarted) {
    console.warn('[Anbarin] duplicate boot request ignored');
    return;
  }
  bootStarted = true;
  try {
    loadTheme();
    const source = await runBootRecovery();

    // ابتدا پوسته ساخته شود تا پنل تنظیمات و اجزای وابسته به DOM حاضر باشند؛
    // سپس احراز هویت مقداردهی شود و در پایان زمان‌بند پشتیبان، رویداد auth-ready را ثبت کند.
    renderShell(bindEvents, setupVirtualLists);
    initLocalAuth();
    try { applyLicenseModuleUI(); } catch { /* ignore */ }
    initExternalAutoBackupScheduler();
    initScannerController();
    await initAccountingUI();
    await initAccountingCommerceUI();
    await initAccountingReportsUI();
    initTaxpayerUI();
    setCountChangeListener(() => {
      updateHeader();
      updateUndoBtn();
      refreshLists();
    });
    updateHeader();
    updateScannerCapabilities();
    updateUndoBtn();
    fillSettingsForm();
    bindBusinessLogoControls();
    void showDueReminderOnEntry();
    updateRolePreview();
    refreshLists();
    // SheetJS فقط هنگام ورود/خروج اکسل بارگذاری می‌شود (import-export-events).

    // مدیریت نسخه و Service Worker در ماژول مستقل انجام می‌شود.
    initializeServiceWorker();

    if (source === 'localStorage-migrated') {
      toast('داده‌ها به حافظه امن (IndexedDB) منتقل شد', 'success');
    }
    // پیام خوش‌آمد / راهنمای کالا: Listener در کل عمر برنامه فقط یک بار ثبت می‌شود.
    registerAuthReadyUiListener();
  } catch (err) {
    console.error('bootApp failed', err);
    toast('خطا در بارگذاری داده‌ها', 'error');
  }
}

function bindEvents() {
  bindReportEvents({ updateHeader, refreshCardexProductSelect });
  bindImportExportEvents({ updateHeader, refreshLists });
  bindSessionControlEvents({ updateHeader, refreshLists, updateUndoBtn });
  bindAccessSettingsEvents({ updateHeader, refreshLists });
  bindBusinessLogoControls();
  bindThemeControls();
  bindBackupSettingsEvents();
  bindInventoryCountEvents({ updateHeader, refreshLists, updateUndoBtn });
  productListController.bindEvents({ updateHeader, refreshCardexProductSelect });
  document.getElementById('btnSmsTest')?.addEventListener('click', () => {
    openSmsComposeDialog({
      phone: '',
      name: '',
      title: 'پیامک آزمایشی',
      defaultMessage: 'پیامک آزمایشی از انبارین',
    });
  });
  // لاگ عملیات: دکمه‌ها قبلاً در صفحه وجود داشتند اما رویداد کلیک نداشتند.
  document.getElementById('btnExportAudit')?.addEventListener('click', () => {
    try {
      exportAuditCSV();
    } catch (err) {
      console.error('[Anbarin] export audit failed:', err);
      toast('دانلود لاگ ناموفق بود؛ دوباره تلاش کنید', 'error');
    }
  });
  document.getElementById('btnClearAudit')?.addEventListener('click', async () => {
    try {
      await clearAuditLog();
      renderAuditList();
    } catch (err) {
      console.error('[Anbarin] clear audit failed:', err);
      toast('پاک کردن لاگ ناموفق بود', 'error');
    }
  });
  document.getElementById('auditSearch')?.addEventListener('input', () => renderAuditList());
  document.getElementById('btnRunDataHealth')?.addEventListener('click', () => { void renderDataHealth(); });

  bindTeamPhotoLicenseEvents({ updateHeader, refreshLists });

  // گزارش‌ها و کاردکس در ماژول مستقل متصل می‌شوند.
  initAccountingTemplateUI();
  initInventoryDocumentsUI();


  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = (btn as HTMLElement).dataset.page;
      if (page) {
        const mod = moduleForPage(page);
        if (mod && !requireModule(mod)) return;
        showPage(page);
        requestAnimationFrame(() => {
          refreshLists();
          if (page === 'audit') renderAuditList();
          if (page === 'health') void renderDataHealth();
        });
      }
    });
  });

  const cont = document.getElementById('scannerContinuous') as HTMLInputElement | null;
  if (cont) cont.checked = settings.continuousScan !== false;
}

function updateUndoBtn() {
  const btn = document.getElementById('undoBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = !canUndo();
}

function refreshCardexProductSelect(): void {
  const select = document.getElementById('cardexProductSelect') as HTMLSelectElement | null;
  if (!select) return;

  const signature = JSON.stringify(products.map((product) => [
    product.id, product.name, product.code || '', product.sku || '',
  ]));
  if (signature === cardexOptionsSignature) return;

  const selectedId = select.value;
  const fragment = document.createDocumentFragment();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'انتخاب کالا...';
  fragment.appendChild(placeholder);

  for (const product of products) {
    const option = document.createElement('option');
    option.value = product.id;
    option.textContent = `${product.name} — ${product.code || product.sku || product.id}`;
    fragment.appendChild(option);
  }

  select.replaceChildren(fragment);
  select.value = products.some((product) => product.id === selectedId) ? selectedId : '';
  cardexOptionsSignature = signature;
  // اگر select قبلاً جستجوپذیر شده باشد، ورودی نمایشی نیز همگام می‌شود.
  enhanceSelectWithSearch(select, { placeholder: 'جستجوی کالا برای کاردکس...' });
}


initUnifiedDatePickers();
bootApp();
