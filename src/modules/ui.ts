/**
 * توابع UI پایه (toast، navigation ساده و ...)
 */

import type { ToastType } from '@/types';
import { Capacitor } from '@capacitor/core';

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string, type: ToastType = 'info'): void {
  // در اندروید پیام موفقیت دانلود را فقط بعد از تأیید واقعی ذخیره نشان می‌دهیم.
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && /دانلود شد|فایل ذخیره شد/.test(message)) return;
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }

  el.textContent = message;
  el.className = `toast show ${type}`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el?.classList.remove('show');
  }, 2800);
}

export function showPage(pageId: string): void {
  document.querySelectorAll('.page').forEach((p) => {
    p.classList.remove('active');
  });
  const target = document.getElementById(`page-${pageId}`);
  if (target) target.classList.add('active');

  // nav active state
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.getAttribute('data-page') === pageId);
  });
}

export type ThemePreference = 'light' | 'dark' | 'auto';

const THEME_PREF_KEY = 'anbar_theme_pref';
const THEME_LEGACY_KEY = 'anbar_theme';

let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;

export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'auto') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }
  return pref;
}

/** اعمال تم واقعی روی سند (روشن / تاریک) */
export function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme);
}

/** سازگاری با کدهای قبلی که فقط light/dark می‌فرستند */
export function setTheme(theme: 'light' | 'dark'): void {
  setThemePreference(theme);
}

export function getThemePreference(): ThemePreference {
  const pref = localStorage.getItem(THEME_PREF_KEY) as ThemePreference | null;
  if (pref === 'light' || pref === 'dark' || pref === 'auto') return pref;
  const legacy = localStorage.getItem(THEME_LEGACY_KEY) as 'light' | 'dark' | null;
  if (legacy === 'light' || legacy === 'dark') return legacy;
  return 'auto';
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_PREF_KEY, pref);
    // کلید قدیمی برای سازگاری
    localStorage.setItem(THEME_LEGACY_KEY, resolveTheme(pref));
  } catch {
    /* ignore quota */
  }
  applyTheme(resolveTheme(pref));
  bindSystemThemeListener(pref === 'auto');
  paintThemeButtons(pref);
}

function bindSystemThemeListener(enabled: boolean): void {
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (systemThemeListener) {
      mq.removeEventListener('change', systemThemeListener);
      systemThemeListener = null;
    }
    if (!enabled) return;
    systemThemeListener = () => {
      if (getThemePreference() !== 'auto') return;
      applyTheme(resolveTheme('auto'));
    };
    mq.addEventListener('change', systemThemeListener);
  } catch {
    /* older webviews */
  }
}

export function paintThemeButtons(pref?: ThemePreference): void {
  const current = pref || getThemePreference();
  document.querySelectorAll<HTMLElement>('[data-theme-pref]').forEach((btn) => {
    const on = btn.dataset.themePref === current;
    btn.classList.toggle('is-active', on);
    btn.classList.toggle('is-available', !on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

export function loadTheme(): ThemePreference {
  const pref = getThemePreference();
  applyTheme(resolveTheme(pref));
  bindSystemThemeListener(pref === 'auto');
  // بعد از ساخت DOM دکمه‌ها رنگ می‌شوند؛ اینجا هم اگر موجود باشند
  queueMicrotask(() => paintThemeButtons(pref));
  return pref;
}

export function bindThemeControls(): void {
  document.querySelectorAll<HTMLElement>('[data-theme-pref]').forEach((btn) => {
    if (btn.dataset.themeBound === '1') return;
    btn.dataset.themeBound = '1';
    btn.addEventListener('click', () => {
      const pref = (btn.dataset.themePref || 'auto') as ThemePreference;
      if (pref !== 'light' && pref !== 'dark' && pref !== 'auto') return;
      setThemePreference(pref);
      const label = pref === 'light' ? 'روشن' : pref === 'dark' ? 'تاریک' : 'خودکار (سیستم)';
      toast(`تم ${label} اعمال شد`, 'success');
    });
  });
  paintThemeButtons();
}

export interface ConfirmActionOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

let dialogQueue: Promise<unknown> = Promise.resolve();

/**
 * تأیید داخلی و سازگار با Android WebView؛ به window.confirm وابسته نیست.
 * درخواست‌های هم‌زمان پشت سر هم نمایش داده می‌شوند تا دیالوگ‌ها روی هم نیفتند.
 */
export function confirmAction(message: string, options: ConfirmActionOptions = {}): Promise<boolean> {
  const show = () => new Promise<boolean>((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'anbarin-confirm-overlay';
    overlay.setAttribute('role', 'presentation');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.58);';

    const panel = document.createElement('section');
    panel.className = 'anbarin-confirm-dialog';
    panel.setAttribute('role', 'alertdialog');
    panel.setAttribute('aria-modal', 'true');
    panel.style.cssText = 'width:min(100%,460px);max-height:80vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#222);border:1px solid var(--border,#ddd);border-radius:16px;padding:20px;box-shadow:0 18px 60px rgba(0,0,0,.3);';

    const heading = document.createElement('h3');
    heading.textContent = options.title || 'تأیید عملیات';
    heading.style.cssText = 'margin:0 0 12px;font-size:1.05rem;';
    const body = document.createElement('p');
    body.textContent = message;
    body.style.cssText = 'margin:0;white-space:pre-wrap;line-height:1.9;overflow-wrap:anywhere;';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-start;flex-wrap:wrap;margin-top:22px;';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = options.cancelText || 'انصراف';
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'btn btn-primary';
    if (options.danger) accept.style.cssText = 'background:#b42318;border-color:#b42318;color:#fff;';
    accept.textContent = options.confirmText || 'تأیید';
    actions.append(cancel, accept);
    panel.append(heading, body, actions);
    overlay.appendChild(panel);

    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
      resolve(value);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
      if (event.key === 'Enter' && document.activeElement === accept) { event.preventDefault(); finish(true); }
    };
    cancel.addEventListener('click', () => finish(false));
    accept.addEventListener('click', () => finish(true));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) finish(false); });
    document.addEventListener('keydown', onKeyDown, true);
    document.body.appendChild(overlay);
    accept.focus();
  });

  const result = dialogQueue.then(show, show);
  dialogQueue = result.then(() => undefined, () => undefined);
  return result;
}


export interface PromptActionOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  inputType?: 'text' | 'password';
  multiline?: boolean;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  minLength?: number;
}

/**
 * ورودی داخلی سازگار با Android WebView؛ جایگزین window.prompt برای اطلاعات حساس.
 * مقدار null یعنی انصراف؛ رشته خالی فقط در صورت required نبودن پذیرفته می‌شود.
 */
export function promptAction(message: string, options: PromptActionOptions = {}): Promise<string | null> {
  const show = () => new Promise<string | null>((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'anbarin-prompt-overlay';
    overlay.setAttribute('role', 'presentation');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.62);';

    const panel = document.createElement('section');
    panel.className = 'anbarin-prompt-dialog';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.style.cssText = 'width:min(100%,520px);max-height:85vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#222);border:1px solid var(--border,#ddd);border-radius:16px;padding:20px;box-shadow:0 18px 60px rgba(0,0,0,.32);';

    const heading = document.createElement('h3');
    heading.textContent = options.title || 'ورود اطلاعات';
    heading.style.cssText = 'margin:0 0 12px;font-size:1.05rem;';
    const description = document.createElement('p');
    description.textContent = message;
    description.style.cssText = 'margin:0 0 14px;white-space:pre-wrap;line-height:1.85;overflow-wrap:anywhere;';

    const field: HTMLInputElement | HTMLTextAreaElement = options.multiline
      ? document.createElement('textarea')
      : document.createElement('input');
    if (field instanceof HTMLInputElement) field.type = options.inputType || 'text';
    else { field.rows = 7; field.spellcheck = false; }
    field.value = options.defaultValue || '';
    field.placeholder = options.placeholder || '';
    field.autocomplete = options.inputType === 'password' ? 'new-password' : 'off';
    field.style.cssText = 'display:block;width:100%;box-sizing:border-box;min-height:44px;padding:11px 12px;border:1px solid var(--border,#ccc);border-radius:10px;background:var(--input-bg,var(--card,#fff));color:var(--text,#222);font:inherit;resize:vertical;';
    if (options.inputType === 'password') field.setAttribute('aria-label', 'رمز عبور');

    const error = document.createElement('div');
    error.setAttribute('aria-live', 'polite');
    error.style.cssText = 'min-height:1.3em;margin-top:6px;color:var(--danger,#b42318);font-size:.85rem;';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-start;flex-wrap:wrap;margin-top:18px;';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'btn btn-secondary'; cancel.textContent = options.cancelText || 'انصراف';
    const accept = document.createElement('button');
    accept.type = 'button'; accept.className = 'btn btn-primary'; accept.textContent = options.confirmText || 'تأیید';
    actions.append(cancel, accept);
    panel.append(heading, description, field, error, actions);
    overlay.appendChild(panel);

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
      resolve(value);
    };
    const submit = () => {
      const value = field.value;
      if (options.required && !value.trim()) { error.textContent = 'وارد کردن این مقدار الزامی است.'; field.focus(); return; }
      if (options.minLength && value.length < options.minLength) { error.textContent = `حداقل ${options.minLength} نویسه وارد کنید.`; field.focus(); return; }
      finish(value);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(null); }
      if (event.key === 'Enter' && (field instanceof HTMLInputElement || !event.shiftKey)) { event.preventDefault(); submit(); }
    };
    cancel.addEventListener('click', () => finish(null));
    accept.addEventListener('click', submit);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) finish(null); });
    field.addEventListener('input', () => { error.textContent = ''; });
    document.addEventListener('keydown', onKeyDown, true);
    document.body.appendChild(overlay);
    field.focus();
  });

  const result = dialogQueue.then(show, show);
  dialogQueue = result.then(() => undefined, () => undefined);
  return result;
}
