import { toast } from './ui';
import { guardWrite } from './filters-roles';
import {
  actionStartSession,
  actionCloseSession,
  applySettingsFromForm,
  fillSettingsForm,
} from './session-settings';
import { refreshTeamSyncUI } from './team-sync';

let sessionControlEventsBound = false;
let accessSettingsEventsBound = false;

export function updateRolePreview(): void {
  const select = document.getElementById('setRole') as HTMLSelectElement | null;
  const description = document.getElementById('rolePreviewDescription');
  const pill = document.getElementById('rolePreviewPill');
  const list = document.getElementById('rolePermissionList');
  if (!select) return;
  const role = select.value;
  const roles: Record<string, { label: string; description: string; permissions: string[] }> = {
    admin: {
      label: 'مدیر',
      description: 'دسترسی کامل به تنظیمات و عملیات مدیریتی؛ مناسب مسئول اصلی انبار.',
      permissions: ['✓ مدیریت تنظیمات و مجوزها', '✓ شمارش، ویرایش و ورود اطلاعات', '✓ عملیات حساس مدیریتی'],
    },
    counter: {
      label: 'شمارنده',
      description: 'مناسب تیم شمارش؛ امکان ثبت شمارش و کار با کالاها، بدون عملیات مدیریتی حساس.',
      permissions: ['✓ شمارش و ویرایش شمارش', '✓ اسکن و مشاهده کالاها', '— عملیات حساس مدیریتی محدود است'],
    },
    viewer: {
      label: 'مشاهده‌گر',
      description: 'فقط مشاهده اطلاعات؛ دکمه‌های تغییر داده و عملیات شمارش غیرفعال می‌شوند.',
      permissions: ['✓ مشاهده کالاها و گزارش‌ها', '— ثبت یا تغییر شمارش', '— ورود اطلاعات و عملیات مدیریتی'],
    },
  };
  const selected = roles[role] || roles.admin;
  if (description) description.textContent = selected.description;
  if (pill) pill.textContent = selected.label;
  if (list) {
    list.replaceChildren(...selected.permissions.map((permission) => {
      const item = document.createElement('span');
      item.textContent = permission;
      return item;
    }));
  }
}

export function bindAccessSettingsEvents(callbacks: {
  updateHeader: () => void;
  refreshLists: () => void;
}): void {
  if (accessSettingsEventsBound) return;
  accessSettingsEventsBound = true;

  document.getElementById('setRole')?.addEventListener('change', updateRolePreview);
  document.getElementById('btnSaveSettings')?.addEventListener('click', () => {
    try {
      applySettingsFromForm();
      callbacks.updateHeader();
      fillSettingsForm();
      updateRolePreview();
      callbacks.refreshLists();
    } catch (err) {
      console.error('[Anbarin] saving settings failed:', err);
      toast('ذخیره تنظیمات انجام نشد؛ فضای ذخیره‌سازی را بررسی کنید', 'error');
    }
  });
}

export function bindSessionControlEvents(callbacks: {
  updateHeader: () => void;
  refreshLists: () => void;
  updateUndoBtn: () => void;
}): void {
  if (sessionControlEventsBound) return;
  sessionControlEventsBound = true;

  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('#btnStartSession, #btnCloseSession')
      : null;
    if (!target || target.dataset.actionPending === 'true') return;

    const action = target.id === 'btnStartSession' ? 'start' : 'close';
    const label = action === 'start' ? 'شروع جلسه جدید' : 'بستن جلسه';
    if (!guardWrite(label)) return;

    target.dataset.actionPending = 'true';
    target.setAttribute('aria-busy', 'true');
    try {
      if (action === 'start') await actionStartSession();
      else await actionCloseSession();
      callbacks.updateHeader();
      callbacks.refreshLists();
      callbacks.updateUndoBtn();
      refreshTeamSyncUI();
    } catch (err) {
      console.error(`[Anbarin] ${action} session failed:`, err);
      toast(action === 'start'
        ? 'شروع جلسه جدید انجام نشد؛ اطلاعات ذخیره‌سازی را بررسی کنید'
        : 'بستن جلسه انجام نشد؛ دوباره تلاش کنید', 'error');
    } finally {
      delete target.dataset.actionPending;
      target.removeAttribute('aria-busy');
    }
  });
}
