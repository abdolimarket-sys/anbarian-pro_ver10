/**
 * رویدادهای رابط مدیریت پشتیبان و رمزنگاری.
 * اتصال با event delegation تا پس از بازسازی DOM تنظیمات همچنان کار کند.
 */
import { toast, confirmAction, promptAction } from './ui';
import {
  initializeBackupPassword,
  initializeOrganizationRecoveryKey,
  importOrganizationPublicKey,
  changeBackupPassword,
  hasBackupPasswordSetup,
  hasBackupEncryptionSetup,
  encryptBackupPayload,
} from './backup-crypto';
import {
  getAutoBackupLocationStatus,
  pickAutoBackupFolder,
  clearAutoBackupFolder,
  writeExternalAutoBackup,
  getGoogleDriveAccountStatus,
  connectGoogleDriveAccount,
  disconnectGoogleDriveAccount,
  listExternalBackups,
  restoreSelectedExternalBackup,
  getAutoBackupReport,
  buildFullDeviceBackupPayload,
  restoreBackupFile,
} from './device-auto-backup';
import { downloadFile, dateStr } from '../utils/helpers';

let backupSettingsEventsBound = false;

export function bindBackupSettingsEvents(): void {
  if (backupSettingsEventsBound) return;
  backupSettingsEventsBound = true;

  const unifiedBackupStatus = (message: string) => {
    const node = document.getElementById('unifiedBackupStatus');
    if (node) node.textContent = message;
  };

  const cryptoStatusText = (message: string) => {
    const cryptoStatus = document.getElementById('backupCryptoStatus');
    if (cryptoStatus) cryptoStatus.textContent = message;
  };

  const refreshCryptoStatus = () => {
    cryptoStatusText(
      hasBackupEncryptionSetup()
        ? 'رمزنگاری آماده است: بکاپ‌های جدید با AES-256-GCM و دو مسیر بازیابی کاربر/مدیر ساخته می‌شوند.'
        : hasBackupPasswordSetup()
          ? 'رمز بازیابی کاربر تنظیم شده؛ برای فعال‌شدن بکاپ رمزنگاری‌شده، کلید عمومی سازمان را بسازید یا وارد کنید.'
          : 'رمز بازیابی و کلید سازمان هنوز کامل نیست. بدون آن‌ها ذخیره پشتیبان رمزنگاری‌شده ممکن نیست.',
    );
  };

  let backupLocationRefreshSeq = 0;
  const refreshBackupLoc = async () => {
    const refreshSeq = ++backupLocationRefreshSeq;
    const el = document.getElementById('autoBackupLocationLabel');
    const setActive = (role: string | null) => {
      document.querySelectorAll<HTMLElement>('.auto-backup-btn[data-backup-role]').forEach((btn) => {
        const r = btn.dataset.backupRole || '';
        const isRun = r === 'run-now';
        let on = false;
        if (role === 'drive' && r === 'drive-disconnect') on = true;
        if (role === 'custom' && r === 'local-pick') on = true;
        if (role === 'default' && r === 'local-default') on = true;
        if (isRun) {
          btn.classList.remove('is-active');
          btn.classList.add('is-available');
          btn.removeAttribute('aria-pressed');
          return;
        }
        btn.classList.toggle('is-active', on);
        btn.classList.toggle('is-available', !on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    };
    if (!el) return;
    try {
      const drive = await getGoogleDriveAccountStatus();
      if (refreshSeq !== backupLocationRefreshSeq) return;
      if (drive.connected) {
        el.textContent = `Google Drive خودکار: وصل (${drive.email || 'حساب گوگل'}) · پوشه AnbarinBackups`;
        setActive('drive');
        return;
      }
      const s = await getAutoBackupLocationStatus();
      if (refreshSeq !== backupLocationRefreshSeq) return;
      if (s.isDrive) {
        el.textContent = `Google Drive از طریق پوشه انتخابی: ${s.label}`;
        setActive('custom');
        return;
      }
      el.textContent = s.mode === 'unsupported'
        ? `مسیر فعلی: ${s.label}`
        : s.mode === 'custom'
          ? `مسیر محلی/انتخابی: ${s.label}`
          : `مسیر پیش‌فرض محلی: ${s.label}`;
      setActive(s.mode === 'unsupported' ? null : s.mode === 'custom' ? 'custom' : 'default');
    } catch {
      if (refreshSeq !== backupLocationRefreshSeq) return;
      el.textContent = 'مسیر فعلی: Documents/AnbarinBackups';
      setActive(null);
    }
  };

  const refreshBackupManager = async () => {
    const listEl = document.getElementById('externalBackupList');
    const reportEl = document.getElementById('backupHealthReport');
    if (reportEl) {
      try {
        const report = await getAutoBackupReport();
        const last = report.lastSuccessAt ? new Date(report.lastSuccessAt).toLocaleString('fa-IR') : 'ثبت نشده';
        reportEl.textContent = `آخرین پشتیبان موفق: ${last}${report.lastError ? ` · آخرین خطا: ${report.lastError}` : ''}`;
      } catch {
        reportEl.textContent = 'گزارش آخرین پشتیبان: —';
      }
    }
    if (!listEl) return;
    listEl.replaceChildren();
    try {
      const backups = await listExternalBackups();
      if (!backups.length) {
        const empty = document.createElement('p');
        empty.className = 'hint';
        empty.textContent = 'نسخه‌ای در حافظه دستگاه یا Google Drive پیدا نشد. این فهرست در نسخه وب در دسترس نیست.';
        listEl.appendChild(empty);
        return;
      }
      backups.forEach((item) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:9px;border:1px solid var(--border);border-radius:10px;background:var(--bg)';
        const info = document.createElement('div');
        info.style.cssText = 'min-width:0;flex:1';
        const name = document.createElement('strong');
        name.style.cssText = 'display:block;overflow-wrap:anywhere;font-size:.82rem';
        name.textContent = item.name;
        const meta = document.createElement('span');
        meta.className = 'hint';
        meta.textContent = `${item.source === 'drive' ? 'Google Drive' : 'حافظه دستگاه'} · ${item.modified ? new Date(item.modified).toLocaleString('fa-IR') : 'زمان نامشخص'}`;
        info.append(name, meta);
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.className = 'btn btn-sm btn-secondary';
        restore.textContent = 'بازیابی این نسخه';
        restore.addEventListener('click', async () => {
          const when = item.modified ? new Date(item.modified).toLocaleString('fa-IR') : item.name;
          if (!(await confirmAction(`تمام اطلاعات فعلی با نسخه «${item.name}» جایگزین می‌شود. پیش از جایگزینی نسخه اضطراری ساخته خواهد شد. ادامه می‌دهید؟\n${when}`, { danger: true }))) return;
          restore.disabled = true;
          restore.textContent = 'در حال بررسی و بازیابی…';
          try {
            const result = await restoreSelectedExternalBackup(item);
            toast(result.message, result.ok ? 'success' : 'error');
            if (result.ok) window.location.reload();
          } finally {
            restore.disabled = false;
            restore.textContent = 'بازیابی این نسخه';
          }
        });
        row.append(info, restore);
        listEl.appendChild(row);
      });
    } catch (error) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = error instanceof Error ? error.message : 'خواندن فهرست پشتیبان ناموفق بود';
      listEl.appendChild(p);
    }
  };

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const el = target.closest<HTMLElement>('[id]');
    if (!el) return;
    const id = el.id;

    if (id === 'btnExportUnifiedBackup') {
      event.preventDefault();
      void (async () => {
        const button = document.getElementById('btnExportUnifiedBackup') as HTMLButtonElement | null;
        if (button) button.disabled = true;
        try {
          if (!hasBackupPasswordSetup() || !hasBackupEncryptionSetup()) {
            throw new Error('ابتدا رمز بازیابی و کلید سازمان را در همین بخش تنظیم کنید؛ بدون آن‌ها پشتیبان رمزنگاری‌شده ساخته نمی‌شود.');
          }
          unifiedBackupStatus('در حال آماده‌سازی پشتیبان بر اساس لایسنس فعال…');
          const payload = await buildFullDeviceBackupPayload();
          const encrypted = await encryptBackupPayload(payload);
          const filename = `anbarin-backup-${dateStr()}.json`;
          const result = await downloadFile(JSON.stringify(encrypted, null, 2), filename, 'application/json;charset=utf-8');
          if (result === 'cancelled') unifiedBackupStatus('ذخیره فایل لغو شد.');
          else if (result === 'error') throw new Error('ذخیره فایل پشتیبان ناموفق بود.');
          else {
            unifiedBackupStatus(`پشتیبان واحد ذخیره شد: ${filename}`);
            toast('پشتیبان واحد ذخیره شد', 'success');
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'ساخت پشتیبان ناموفق بود';
          unifiedBackupStatus(message);
          toast(message, 'error');
        } finally {
          if (button) button.disabled = false;
          refreshCryptoStatus();
        }
      })();
      return;
    }

    if (id === 'btnImportUnifiedBackup') {
      event.preventDefault();
      (document.getElementById('unifiedBackupFile') as HTMLInputElement | null)?.click();
      return;
    }

    if (id === 'btnConnectGoogleDriveAccount') {
      event.preventDefault();
      void (async () => {
        const r = await connectGoogleDriveAccount();
        if (r === 'ok') {
          toast('Google Drive وصل شد — پشتیبان خودکار بدون انتخاب پوشه فعال است', 'success');
          void writeExternalAutoBackup(true);
        } else if (r === 'folder-fallback-ok') {
          toast('پشتیبان آنلاین Drive فعال شد (اتصال یک‌باره پوشه). از این به بعد خودکار ذخیره می‌شود', 'success');
          void writeExternalAutoBackup(true);
        } else if (r === 'cancelled') toast('لغو شد', 'info');
        else if (r === 'unsupported') toast('فقط در اپ اندروید', 'info');
        else if (r === 'folder-fallback-needed') toast('برای Drive از منوی بالا Google Drive را انتخاب و یک پوشه بسازید', 'info');
        else toast('اتصال ناموفق بود. اینترنت و اپ Google Drive را بررسی کنید', 'error');
        void refreshBackupLoc();
      })();
      return;
    }

    if (id === 'btnDisconnectGoogleDriveAccount') {
      event.preventDefault();
      void (async () => {
        const r = await disconnectGoogleDriveAccount();
        toast(r === 'ok' ? 'اتصال Google Drive قطع شد' : 'قطع اتصال انجام نشد', r === 'ok' ? 'success' : 'error');
        void refreshBackupLoc();
      })();
      return;
    }

    if (id === 'btnPickAutoBackupFolder') {
      event.preventDefault();
      void (async () => {
        const r = await pickAutoBackupFolder();
        if (r === 'ok') { toast('پوشه پشتیبان تنظیم شد', 'success'); void writeExternalAutoBackup(true); }
        else if (r === 'cancelled') toast('انتخاب پوشه لغو شد', 'info');
        else if (r === 'unsupported') toast('انتخاب پوشه فقط در اپ اندروید فعال است', 'info');
        else toast('انتخاب پوشه ناموفق بود', 'error');
        void refreshBackupLoc();
      })();
      return;
    }

    if (id === 'btnResetAutoBackupFolder') {
      event.preventDefault();
      void (async () => {
        const r = await clearAutoBackupFolder();
        if (r === 'ok') toast('مسیر به پیش‌فرض برگشت', 'success');
        else if (r === 'unsupported') toast('فقط در اپ اندروید', 'info');
        else toast('بازنشانی مسیر ناموفق بود', 'error');
        void refreshBackupLoc();
      })();
      return;
    }

    if (id === 'btnRunAutoBackupNow') {
      event.preventDefault();
      void (async () => {
        const ok = await writeExternalAutoBackup(true);
        toast(ok ? 'پشتیبان خودکار ذخیره شد' : 'پشتیبان نوشته نشد (داده خالی، فقط وب، یا رمزنگاری ناقص)', ok ? 'success' : 'info');
        void refreshBackupLoc();
        void refreshBackupManager();
      })();
      return;
    }

    if (id === 'btnSetupBackupPassword') {
      event.preventDefault();
      void (async () => {
        const field = document.getElementById('backupRecoveryPassword') as HTMLInputElement | null;
        const password = field?.value || '';
        const confirmPassword = (document.getElementById('backupRecoveryPasswordConfirm') as HTMLInputElement | null)?.value || '';
        try {
          if (password.length < 12) throw new Error('رمز بازیابی باید حداقل ۱۲ نویسه داشته باشد');
          if (password !== confirmPassword) throw new Error('تکرار رمز بازیابی یکسان نیست');
          if (hasBackupPasswordSetup()) {
            const currentPassword = await promptAction('رمز بازیابی فعلی را وارد کنید تا فقط پوشش کلید تغییر کند.', { title: 'رمز بازیابی فعلی', inputType: 'password', confirmText: 'ادامه', required: true });
            if (!currentPassword) return;
            await changeBackupPassword(currentPassword, password);
            cryptoStatusText('رمز بازیابی تغییر کرد؛ داده‌های بکاپ رمزنگاری مجدد نمی‌شوند و نسخه‌های قبلی با رمز قبلی خودشان باقی می‌مانند.');
            toast('رمز بازیابی جدید تنظیم شد', 'success');
          } else {
            await initializeBackupPassword(password);
            cryptoStatusText('کلید بازیابی کاربر ساخته شد. اکنون کلید سازمانی را ایجاد یا وارد کنید.');
            toast('رمز بازیابی بکاپ تنظیم شد', 'success');
          }
          if (field) field.value = '';
          const confirmField = document.getElementById('backupRecoveryPasswordConfirm') as HTMLInputElement | null;
          if (confirmField) confirmField.value = '';
          refreshCryptoStatus();
        } catch (error) {
          toast(error instanceof Error ? error.message : 'تنظیم رمز ناموفق بود', 'error');
        }
      })();
      return;
    }

    if (id === 'btnGenerateOrgRecoveryKey') {
      event.preventDefault();
      void (async () => {
        try {
          if (!(await confirmAction('کلید سازمانی جدید ساخته شود؟ کلید خصوصی باید فوراً دانلود و خارج از دستگاه نگهداری شود. اگر کلید قبلی را جایگزین کنید، بکاپ‌های قبلی فقط با کلید قبلی قابل بازیابی‌اند.', { danger: true }))) return;
          const managerPassword = await promptAction('یک رمز مستقل و قوی برای محافظت از کلید خصوصی مدیر تعیین کنید (حداقل ۱۲ نویسه).', { title: 'تعیین رمز مدیر', inputType: 'password', confirmText: 'ادامه', required: true, minLength: 12 });
          const managerPasswordConfirm = await promptAction('رمز محافظ کلید مدیر را دوباره وارد کنید.', { title: 'تکرار رمز مدیر', inputType: 'password', confirmText: 'تأیید', required: true, minLength: 12 });
          if (!managerPassword || managerPassword.length < 12) throw new Error('رمز محافظ کلید مدیر باید حداقل ۱۲ نویسه داشته باشد');
          if (managerPassword !== managerPasswordConfirm) throw new Error('تکرار رمز محافظ کلید مدیر یکسان نیست');
          const pair = await initializeOrganizationRecoveryKey(managerPassword);
          const downloadText = (filename: string, content: string) => {
            const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
            const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1500);
          };
          downloadText('anbarin-organization-private-key.json', JSON.stringify(pair.privateKeyPackage, null, 2));
          downloadText('anbarin-organization-public-key.pem', pair.publicKeyPem);
          cryptoStatusText(`کلید سازمانی آماده شد (شناسه ${pair.keyId}). فایل خصوصی رمزدار را همراه رمز محافظ، جداگانه و آفلاین نگهداری کنید؛ گم‌شدن هر دو مسیر بازیابی مدیر را از بین می‌برد.`);
          toast('کلیدهای سازمانی ساخته و فایل‌ها آماده دانلود شدند', 'success');
          refreshCryptoStatus();
        } catch (error) {
          toast(error instanceof Error ? error.message : 'ساخت کلید سازمانی ناموفق بود', 'error');
        }
      })();
      return;
    }

    if (id === 'btnRefreshBackupList') {
      event.preventDefault();
      void refreshBackupManager();
      return;
    }
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.id === 'unifiedBackupFile') {
      void (async () => {
        const file = target.files?.[0];
        target.value = '';
        if (!file) return;
        try {
          unifiedBackupStatus('در حال بررسی و بازیابی پشتیبان…');
          const result = await restoreBackupFile(file);
          unifiedBackupStatus(result.message);
          toast(result.message, result.ok ? 'success' : 'error');
          if (result.ok) window.location.reload();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'بازیابی پشتیبان ناموفق بود';
          unifiedBackupStatus(message);
          toast(message, 'error');
        }
      })();
      return;
    }

    if (target.id === 'orgRecoveryPublicKeyFile') {
      void (async () => {
        const file = target.files?.[0];
        if (!file) return;
        try {
          const keyId = await importOrganizationPublicKey(await file.text());
          cryptoStatusText(`کلید عمومی سازمان وارد شد (شناسه ${keyId}). بکاپ‌های جدید با این کلید برای مدیر اصلی قابل بازیابی خواهند بود.`);
          toast('کلید عمومی سازمان وارد شد', 'success');
          refreshCryptoStatus();
        } catch (error) {
          toast(error instanceof Error ? error.message : 'کلید عمومی نامعتبر است', 'error');
        }
        target.value = '';
      })();
    }
  });

  void refreshBackupLoc();
  refreshCryptoStatus();
  void refreshBackupManager();
}
