/** رویدادهای همگام‌سازی تیمی، تصاویر و مدیریت لایسنس. */
import { toast } from './ui';
import {
  exportTeamSyncPack, importTeamSyncPack, exportPartialCount, copyTeamSessionCode,
  joinTeamSession, exportTeamConflictReport, refreshTeamSyncUI, saveTeamOnlineConfig,
  saveTeamSyncMode, syncTeamOnlineNow, refreshTeamOnlineStatus, initializeTeamOnlineSync,
} from './team-sync';
import { captureProductPhoto, exportPhotosPack, importPhotosPack } from './photos';
import {
  updateLicenseUI, activateLicenseFromInput, deactivateLicense, requirePremium,
  getDeviceId, saveStoredLicense,
} from './license';
import { activateOfflineLicenseFile } from './offline-license';

let eventsBound = false;

export function bindTeamPhotoLicenseEvents(deps: {
  updateHeader: () => void;
  refreshLists: () => void;
}): void {
  if (eventsBound) return;
  eventsBound = true;
  const { updateHeader, refreshLists } = deps;
  // Team sync: keep offline JSON tools and let the user choose offline, live, or hybrid.
  const syncModeSelect = document.getElementById('teamSyncMode') as HTMLSelectElement | null;
  const paintTeamModeChips = () => {
    const mode = syncModeSelect?.value || 'offline';
    document.querySelectorAll<HTMLElement>('[data-team-mode]').forEach((btn) => {
      const on = btn.dataset.teamMode === mode;
      btn.classList.toggle('is-active', on);
      btn.classList.toggle('is-available', !on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };
  document.querySelectorAll<HTMLElement>('[data-team-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!syncModeSelect) return;
      const mode = btn.dataset.teamMode || 'offline';
      syncModeSelect.value = mode;
      saveTeamSyncMode();
      refreshTeamOnlineStatus();
      initializeTeamOnlineSync();
      paintTeamModeChips();
    });
  });
  paintTeamModeChips();
  document.getElementById('teamSyncMode')?.addEventListener('change', () => {
    saveTeamSyncMode();
    refreshTeamOnlineStatus();
    initializeTeamOnlineSync();
    paintTeamModeChips();
  });
  document.getElementById('btnSaveTeamOnline')?.addEventListener('click', () => {
    saveTeamOnlineConfig();
    refreshTeamOnlineStatus();
  });
  document.getElementById('btnSyncTeamOnline')?.addEventListener('click', async () => {
    await syncTeamOnlineNow();
    updateHeader();
    refreshLists();
    refreshTeamSyncUI();
  });
  document.getElementById('btnCopyTeamCode')?.addEventListener('click', () => copyTeamSessionCode());
  document.getElementById('btnActivateLicense')?.addEventListener('click', () => activateLicenseFromInput());
  document.getElementById('btnDeactivateLicense')?.addEventListener('click', () => { void deactivateLicense(); });
  document.getElementById('offlineLicenseFile')?.addEventListener('change', (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) toast('فایل انتخاب شد: ' + file.name, 'success');
  });
  document.getElementById('btnActivateOfflineLicense')?.addEventListener('click', async () => {
    const input = document.getElementById('offlineLicenseFile') as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) { toast('ابتدا فایل .anblic را انتخاب کنید', 'error'); return; }
    try {
      const license = await activateOfflineLicenseFile(file);
      // یک منبع فعال: فایل RSA جایگزین کلید متنی ANB3 می‌شود
      try { saveStoredLicense(null); } catch { /* ignore */ }
      toast('لایسنس آفلاین برای ' + license.customerName + ' فعال شد', 'success');
      updateLicenseUI();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'فعال‌سازی لایسنس ناموفق بود', 'error');
    }
  });
  document.getElementById('btnCopyDeviceId')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(getDeviceId()); toast('شناسه دستگاه کپی شد', 'success'); }
    catch { toast('کپی خودکار ممکن نیست؛ شناسه دستگاه را دستی انتخاب کنید', 'error'); }
  });
  document.getElementById('btnJoinSession')?.addEventListener('click', async () => {
    if (await joinTeamSession()) {
      refreshTeamSyncUI();
      updateHeader();
    }
  });
  document.getElementById('btnExportTeam')?.addEventListener('click', () => {
    if (!requirePremium('همگام‌سازی تیمی')) return;
    exportTeamSyncPack();
  });
  document.getElementById('btnExportPartial')?.addEventListener('click', () => exportPartialCount());
  document.getElementById('btnExportMergeReport')?.addEventListener('click', () => exportTeamConflictReport());
  document.getElementById('btnImportTeam')?.addEventListener('click', () => {
    document.getElementById('teamSyncFile')?.click();
  });
  document.getElementById('teamSyncFile')?.addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    await importTeamSyncPack(f);
    (e.target as HTMLInputElement).value = '';
    updateHeader();
    refreshLists();
    refreshTeamSyncUI();
  });

  // Photos
  document.getElementById('btnTakePhoto')?.addEventListener('click', () => {
    captureProductPhoto();
  });
  document.getElementById('btnExportPhotos')?.addEventListener('click', () => exportPhotosPack());
  document.getElementById('btnImportPhotos')?.addEventListener('click', () => {
    document.getElementById('photoPackFile')?.click();
  });
  document.getElementById('photoPackFile')?.addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    await importPhotosPack(f);
    (e.target as HTMLInputElement).value = '';
    updateHeader();
    refreshLists();
  });


}
