/**
 * سیستم لایسنس
 * - مسیر امن: لایسنس آفلاین با امضای RSA (offline-license.ts) — کلید خصوصی فقط نزد صادرکننده
 * - مسیر legacy: ANB3 با HMAC سمت‌کلاینت (ضعیف؛ فقط سازگاری)
 * - ۱۴ روز آزمایشی، قفل دستگاه، تشخیص دستکاری ساعت / seal
 *
 * برای build تولید: VITE_LICENSE_HMAC_SECRET (اختیاری برای ANB3) و
 * VITE_LICENSE_PUBLIC_KEY / issuer-public-key برای RSA تنظیم شود.
 * لایسنس سمت‌کلاینت به‌تنهایی غیرقابل‌دور زدن نیست؛ RSA آفلاین سطح تهدید را بالا می‌برد.
 */

import { toast, confirmAction } from './ui';
import { showPage } from './ui';
import { getOfflineLicense, getOfflineLicenseStatus, deactivateOfflineLicense, ensureOfflineLicenseIntegrity, bootstrapOfflineLicenseIntegrity, configureOfflineLicenseDeviceIdProvider } from './offline-license';

// Register lazily: offline-license no longer imports this module, avoiding a cycle.
configureOfflineLicenseDeviceIdProvider(() => getDeviceId());

/** فقط برای سازگاری کلیدهای ANB3 قدیمی — در بیلد تولید با VITE_LICENSE_HMAC_SECRET جایگزین/تقویت شود */
const LEGACY_LICENSE_SECRET = 'anbar-azar-lic-v3-7f3a9c2e8b1d';
function buildHmacSecret(): string {
  try {
    const fromEnv = String(import.meta.env.VITE_LICENSE_HMAC_SECRET || '').trim();
    if (fromEnv && fromEnv.length >= 16) return fromEnv;
  } catch { /* ignore */ }
  return '';
}
const BUILD_LICENSE_SECRET = buildHmacSecret();
const TRIAL_DAYS = 14;
const LICENSE_FORMAT_V = 3;
const LICENSE_FORMAT_V_BUILD = 4;

export interface LicenseRecord {
  org: string;
  exp: string;
  plan: string;
  /** ماژول‌ها: count / accounting — اختیاری برای سازگاری عقب‌رو */
  modules?: Array<'count' | 'accounting'>;
  device?: string | null;
  demo?: boolean;
  v?: number;
  seal?: string;
  activatedAt?: string;
}

export interface LicenseState {
  trialActive: boolean;
  trialLeft: number;
  trialEnd: string;
  licensed: boolean;
  license: LicenseRecord | null;
  deviceMismatch: boolean;
  sealBroken: boolean;
  clockTamper: boolean;
  premium: boolean;
  installId: string;
  deviceId: string;
  firstAt: string;
  plan: string;
}

interface InstallMeta {
  firstAt: string;
  id: string;
  lastSeen: number;
  clockTamper?: boolean;
}

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function licenseSignWithSecret(material: string, secret: string): string {
  const a = djb2(material + '|' + secret);
  const b = fnv1a(secret + '|' + material + '|' + a);
  const c = djb2(b + material + fnv1a(secret));
  return (a + b + c).slice(0, 20);
}

export function licenseSign(material: string): string {
  return licenseSignWithSecret(material, BUILD_LICENSE_SECRET || LEGACY_LICENSE_SECRET);
}

function licenseSignMatches(payload: string, signature: string): boolean {
  const ordered = BUILD_LICENSE_SECRET
    ? [BUILD_LICENSE_SECRET, LEGACY_LICENSE_SECRET]
    : [LEGACY_LICENSE_SECRET];
  for (const secret of ordered) {
    if (licenseSignWithSecret(payload, secret) === signature) return true;
  }
  return false;
}

export function getInstallMeta(): InstallMeta {
  let m: InstallMeta | null = null;
  try {
    m = JSON.parse(localStorage.getItem('anbar_install') || 'null');
  } catch {
    m = null;
  }
  if (!m || !m.firstAt) {
    const entropy = [
      Date.now().toString(36),
      Math.random().toString(36).slice(2),
      String((navigator.userAgent || '').length),
      String(screen.width || 0),
      String(screen.height || 0),
    ].join('');
    m = {
      firstAt: new Date().toISOString(),
      id: 'D' + licenseSign(entropy).slice(0, 14),
      lastSeen: Date.now(),
    };
    localStorage.setItem('anbar_install', JSON.stringify(m));
  }
  if (!m.id) {
    m.id = 'D' + licenseSign(String(Date.now())).slice(0, 14);
    localStorage.setItem('anbar_install', JSON.stringify(m));
  }
  const now = Date.now();
  const CLOCK_BACK_MS = 3600000; // ۱ ساعت عقب‌گرد معنادار
  if (m.lastSeen && now < m.lastSeen - CLOCK_BACK_MS) {
    // ساعت سیستم نسبت به آخرین بازدید به‌طور معنادار عقب رفته است
    m.clockTamper = true;
  } else if (m.clockTamper && m.lastSeen && now >= m.lastSeen) {
    // ساعت دیگر از lastSeen عقب نیست (عقب‌گرد ساده اصلاح شده، یا زمان واقعی به lastSeen رسیده)
    // پرچم را بازنشانی کن تا trial برای همیشه قفل نماند
    m.clockTamper = false;
  }
  m.lastSeen = Math.max(now, m.lastSeen || 0);
  try {
    localStorage.setItem('anbar_install', JSON.stringify(m));
  } catch {
    // ignore
  }
  return m;
}

/** بازنشانی دستی پرچم دستکاری ساعت (مثلاً پس از اصلاح ساعت دستگاه) */
export function resetClockTamper(): boolean {
  const m = getInstallMeta();
  if (!m.clockTamper) return false;
  const now = Date.now();
  // فقط وقتی ساعت دیگر عقب‌تر از lastSeen نباشد
  if (m.lastSeen && now < m.lastSeen - 3600000) {
    return false;
  }
  m.clockTamper = false;
  m.lastSeen = Math.max(now, m.lastSeen || 0);
  try {
    localStorage.setItem('anbar_install', JSON.stringify(m));
  } catch {
    return false;
  }
  return true;
}

export function getDeviceId(): string {
  return getInstallMeta().id;
}

function sealLicenseRecord(lic: LicenseRecord): LicenseRecord {
  const body: Record<string, unknown> = {
    org: lic.org,
    exp: lic.exp,
    plan: lic.plan || 'full',
    device: lic.device || null,
    demo: !!lic.demo,
    v: LICENSE_FORMAT_V,
  };
  if (lic.modules && lic.modules.length) body.modules = lic.modules;
  const seal = licenseSign(JSON.stringify(body) + '|' + getDeviceId());
  return {
    ...(body as unknown as LicenseRecord),
    seal,
    activatedAt: lic.activatedAt || new Date().toISOString(),
  };
}

function verifySealedLicense(rec: LicenseRecord | null): LicenseRecord | null {
  if (!rec || !rec.seal) return null;
  const body: Record<string, unknown> = {
    org: rec.org,
    exp: rec.exp,
    plan: rec.plan || 'full',
    device: rec.device || null,
    demo: !!rec.demo,
    v: rec.v || LICENSE_FORMAT_V,
  };
  if (rec.modules && rec.modules.length) body.modules = rec.modules;
  if (licenseSign(JSON.stringify(body) + '|' + getDeviceId()) !== rec.seal) return null;
  if (rec.device && rec.device !== getDeviceId()) return null;
  return rec;
}

export function getStoredLicense(): LicenseRecord | null {
  try {
    return verifySealedLicense(JSON.parse(localStorage.getItem('anbar_license') || 'null'));
  } catch {
    return null;
  }
}

export function saveStoredLicense(lic: LicenseRecord | null): void {
  if (lic) localStorage.setItem('anbar_license', JSON.stringify(sealLicenseRecord(lic)));
  else localStorage.removeItem('anbar_license');
}

/** پارس کلید ANB3.... یا فرمت‌های قدیمی */
export function parseLicenseKey(key: string): LicenseRecord | null {
  key = (key || '').trim();
  if (!key) return null;

  // ANB3.payload.sig
  if (key.startsWith('ANB3.') || key.startsWith('ANBAR-')) {
    let payload = '';
    let sig = '';
    if (key.startsWith('ANB3.')) {
      const parts = key.split('.');
      if (parts.length < 3) return null;
      payload = parts[1];
      sig = parts[2];
      if (!licenseSignMatches(payload, sig)) {
        // امضاهای خیلی قدیمی فقط اگر راز بیلد تنظیم نشده باشد
        if (BUILD_LICENSE_SECRET) return null;
        const old1 = djb2(payload + '|anbar-azar-phase-c-2026-v2').slice(0, 10);
        const old2 = djb2(payload + '|anbar-azar-phase-c-2026').slice(0, 8);
        if (sig !== old1 && sig !== old2) return null;
      }
    } else {
      // ANBAR- legacy: try base64 body
      try {
        const raw = key.replace(/^ANBAR-/, '');
        const json = JSON.parse(decodeURIComponent(escape(atob(raw))));
        if (!json?.exp) return null;
        return {
          org: json.org || 'لایسنس',
          exp: json.exp,
          plan: json.plan || 'full',
          device: json.device || null,
          demo: !!json.demo,
        };
      } catch {
        return null;
      }
    }

    try {
      const json = JSON.parse(decodeURIComponent(escape(atob(payload))));
      if (!json || !json.exp) return null;
      // demo یا open (allowOpen) می‌توانند بدون قفل دستگاه باشند
      const isOpen = !!json.open || !!json.allowOpen;
      if (key.startsWith('ANB3.') && !json.demo && !json.device && !isOpen) return null;
      return {
        org: json.org || 'لایسنس',
        exp: json.exp,
        plan: json.plan || 'full',
        modules: Array.isArray(json.modules) ? json.modules.filter((m: string) => m === 'count' || m === 'accounting') : undefined,
        device: json.device || null,
        demo: !!json.demo,
        // open در record نگه داشته نمی‌شود؛ فقط برای پارس مجاز است
      };
    } catch {
      return null;
    }
  }
  return null;
}

export function makeLicenseKey(opts: {
  org?: string;
  exp?: string;
  plan?: string;
  modules?: Array<'count' | 'accounting'>;
  device?: string | null;
  demo?: boolean;
  allowOpen?: boolean;
}): string {
  const plan = opts.plan || 'standard';
  let device = opts.device || null;
  if (!opts.demo && !opts.allowOpen && !device) {
    throw new Error('device_required');
  }
  // صدور کلید تجاری ANB3 بدون راز بیلد غیرفعال است — مسیر امن: لایسنس آفلاین RSA
  if (!opts.demo && !BUILD_LICENSE_SECRET) {
    throw new Error(
      'صدور کلید ANB3 تجاری در این build ممکن نیست. از لایسنس آفلاین امضاشده (RSA) استفاده کنید یا VITE_LICENSE_HMAC_SECRET را در بیلد تنظیم کنید.',
    );
  }
  const secret = opts.demo
    ? (BUILD_LICENSE_SECRET || LEGACY_LICENSE_SECRET)
    : BUILD_LICENSE_SECRET;
  if (!secret) throw new Error('راز امضای لایسنس در دسترس نیست.');
  const body: Record<string, unknown> = {
    org: opts.org || 'مشتری',
    exp: opts.exp || '2099-12-31',
    plan,
    device,
    demo: !!opts.demo,
    v: BUILD_LICENSE_SECRET ? LICENSE_FORMAT_V_BUILD : LICENSE_FORMAT_V,
    iat: new Date().toISOString().slice(0, 10),
  };
  // allowOpen: کلید بدون قفل دستگاه — برای پارس باید open=true باشد
  if (opts.allowOpen && !device) {
    body.open = true;
    body.device = null;
  }
  if (opts.modules && opts.modules.length) body.modules = opts.modules;
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(body))));
  return 'ANB3.' + payload + '.' + licenseSignWithSecret(payload, secret);
}

export function getLicenseState(): LicenseState {
  const install = getInstallMeta();
  const first = new Date(install.firstAt).getTime();
  const now = Date.now();
  let trialEnd = first + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  if (install.clockTamper) trialEnd = first;
  const trialLeft = Math.max(0, Math.ceil((trialEnd - now) / (24 * 60 * 60 * 1000)));
  const trialActive = now < trialEnd && !install.clockTamper;
  const lic = getStoredLicense();

  let licensed = false;
  let licInfo: LicenseRecord | null = null;
  let deviceMismatch = false;
  let sealBroken = false;

  try {
    const raw = JSON.parse(localStorage.getItem('anbar_license') || 'null');
    if (raw && !lic) {
      if (raw.device && raw.device !== getDeviceId()) deviceMismatch = true;
      else sealBroken = true;
    }
  } catch {
    // ignore
  }

  if (lic?.exp) {
    const expOk =
      lic.exp === '2099-12-31' ||
      (!isNaN(new Date(lic.exp).getTime()) && new Date(lic.exp).getTime() > now);
    if (expOk) {
      if (lic.device && lic.device !== getDeviceId()) deviceMismatch = true;
      else {
        licensed = true;
        licInfo = lic;
      }
    }
  }

  const offline = getOfflineLicense();
  if (offline && !licensed) {
    licensed = true;
    licInfo = {
      org: offline.customerName || 'لایسنس آفلاین',
      exp: offline.validUntil,
      plan: offline.plan || 'full',
      modules: offline.modules,
      device: offline.deviceId,
      demo: false,
    };
  }

  return {
    trialActive,
    trialLeft,
    trialEnd: new Date(trialEnd).toISOString(),
    licensed,
    license: licInfo,
    deviceMismatch,
    sealBroken,
    clockTamper: !!install.clockTamper,
    premium: licensed || trialActive || !!offline,
    installId: install.id,
    deviceId: getDeviceId(),
    firstAt: install.firstAt,
    plan: (licInfo && licInfo.plan) || (trialActive ? 'trial' : 'none'),
  };
}

export function isPremium(): boolean {
  return !!getLicenseState().premium || !!getOfflineLicense();
}

export function requirePremium(feature?: string): boolean {
  if (isPremium()) return true;
  toast(
    'نسخه آزمایشی تمام شده — برای «' + (feature || 'این قابلیت') + '» لایسنس فعال کنید',
    'error'
  );
  showPage('admin');
  updateLicenseUI();
  return false;
}

export function activateLicenseFromInput(): boolean {
  const inp = document.getElementById('licenseKeyInput') as HTMLInputElement | null;
  const key = (inp?.value || '').trim();
  if (!key) {
    toast('کلید لایسنس را وارد کنید', 'error');
    return false;
  }
  const parsed = parseLicenseKey(key);
  if (!parsed) {
    toast('کلید نامعتبر است', 'error');
    return false;
  }
  if (parsed.device && parsed.device !== getDeviceId()) {
    toast('این کلید برای دستگاه دیگری صادر شده', 'error');
    return false;
  }
  // اگر کلید بدون device است و demo نیست، به این دستگاه قفل می‌شود
  if (!parsed.demo && !parsed.device) {
    parsed.device = getDeviceId();
  }
  parsed.activatedAt = new Date().toISOString();
  // یک منبع فعال: کلید متنی جایگزین فایل آفلاین می‌شود تا تداخل ماژول پیش نیاید
  deactivateOfflineLicense();
  saveStoredLicense(parsed);
  toast('لایسنس متنی فعال شد (فایل آفلاین قبلی پاک شد)', 'success');
  updateLicenseUI();
  return true;
}

export async function deactivateLicense(): Promise<void> {
  if (!(await confirmAction('لایسنس حذف شود؟', { danger: true }))) return;
  saveStoredLicense(null);
  deactivateOfflineLicense();
  toast('لایسنس حذف شد', 'info');
  updateLicenseUI();
}

export function updateLicenseUI(): void {
  // هر بار نمایش وضعیت: امضای لایسنس آفلاین را در پس‌زمینه دوباره بررسی کن
  void ensureOfflineLicenseIntegrity().then((ok) => {
    if (!ok) {
      // در صورت رد شدن امضا، UI را یک‌بار دیگر با وضعیت خالی به‌روز کن
      try {
        const el = document.getElementById('licenseStatusText');
        if (el && !getOfflineLicense()) {
          /* updateLicenseUI همگام در ادامه همین فریم متن را تنظیم می‌کند */
        }
      } catch { /* ignore */ }
    }
  });
  const st = getLicenseState();
  let text = getOfflineLicenseStatus() || '';
  try {
    void import('./license-modules').then((m) => m.applyLicenseModuleUI());
  } catch { /* UI optional */ }
  if (!text && st.clockTamper) text = '⚠️ تغییر ساعت سیستم — آزمایشی غیرفعال';
  else if (!text && st.sealBroken) text = '⚠️ لایسنس ذخیره‌شده نامعتبر یا دستکاری‌شده';
  else if (!text && st.deviceMismatch) text = '⚠️ لایسنس متعلق به دستگاه دیگر است';
  else if (!text && st.licensed)
    text =
      '✅ لایسنس فعال — ' +
      (st.license?.org || '') +
      ' | ' +
      (st.license?.plan || '') +
      ' | تا ' +
      (st.license?.exp || '') +
      (st.license?.device ? ' | قفل‌دستگاه' : '');
  else if (!text && st.trialActive) text = '⏳ آزمایشی — ' + st.trialLeft + ' روز باقی';
  else if (!text) text = '🔒 بدون لایسنس ویژه — شمارش پایه آزاد؛ حسابداری و امکانات ویژه نیاز به لایسنس دارد';

  const el = document.getElementById('licenseDetail');
  if (el) el.textContent = text;
  const did = document.getElementById('deviceIdDisplay') as HTMLInputElement | null;
  if (did) did.value = st.deviceId;

  // ظاهر فعال/غیرفعال دکمه‌های لایسنس
  const active = !!(st.licensed || getOfflineLicense());
  document.querySelectorAll<HTMLElement>('[data-license-role]').forEach((btn) => {
    const role = btn.dataset.licenseRole || '';
    let on = false;
    if (role === 'deactivate') on = active;
    if (role === 'activate-file' || role === 'activate-key') on = !active;
    if (role === 'copy-id') {
      btn.classList.remove('is-active');
      btn.classList.add('is-available');
      btn.removeAttribute('aria-pressed');
      return;
    }
    btn.classList.toggle('is-active', on);
    btn.classList.toggle('is-available', !on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

/** تولید کلید برای ادمین (ابزار داخلی) */
export function generateDemoKeyForThisDevice(days = 365): string {
  const exp = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  return makeLicenseKey({
    org: 'مشتری',
    exp,
    plan: 'full',
    device: getDeviceId(),
    demo: false,
  });
}




/** بررسی امضای لایسنس آفلاین در شروع برنامه */
export async function bootstrapLicenseIntegrity(): Promise<void> {
  await bootstrapOfflineLicenseIntegrity();
}
