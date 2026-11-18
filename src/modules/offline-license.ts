/** offline, vendor-signed ANBARIN-LICENSE activation (RS256 / RSA-PKCS1-v1_5 + SHA-256).
 * The matching public key must be configured at build time as VITE_LICENSE_PUBLIC_KEY.
 * Never put the issuer private key in this application or APK.
 *
 * منبع حقیقت فقط envelope است (payload base64url + signature).
 * کپی جداگانهٔ payload در storage نگه داشته نمی‌شود تا ناسازگاری ممکن نباشد.
 */
import { ISSUER_PUBLIC_KEY_PEM } from '../license/issuer-public-key';

export interface OfflineLicensePayload {
  schemaVersion: 1;
  applicationId: 'com.anbarian.app';
  licenseId: string;
  customerName: string;
  customerReference?: string;
  plan: string;
  modules?: Array<'count' | 'accounting'>;
  issuedAt: string;
  validUntil: string;
  deviceId: string;
  maxDevices: 1;
  status: 'active';
  transferRequiresIssuerApproval: true;
  internalNote?: string;
}
interface LicenseEnvelope {
  format: 'ANBARIN-LICENSE';
  algorithm: 'RS256';
  keyId: string;
  payload: string;
  signature: string;
}
/** فقط envelope ذخیره می‌شود — payload همیشه از envelope.payload decode می‌شود */
interface StoredLicense {
  v: 2;
  envelope: LicenseEnvelope;
}

const STORAGE_KEY = 'anbarin_offline_signed_license_v1';

// Device identity is injected by license.ts to keep this low-level verifier
// independent and prevent a license.ts <-> offline-license.ts import cycle.
let deviceIdProvider: (() => string) | null = null;
export function configureOfflineLicenseDeviceIdProvider(provider: () => string): void {
  if (typeof provider !== 'function') throw new Error('Device ID provider must be a function.');
  deviceIdProvider = provider;
}
function getDeviceId(): string {
  if (!deviceIdProvider) {
    throw new Error('Offline license device identity has not been configured.');
  }
  return deviceIdProvider();
}

let sessionSignatureValid: boolean | null = null;
let sessionVerifyPromise: Promise<boolean> | null = null;

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function pemToBytes(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function configuredPublicKey(): string {
  const fromEnv = String(import.meta.env.VITE_LICENSE_PUBLIC_KEY || '').trim();
  if (fromEnv) return fromEnv;
  return String(ISSUER_PUBLIC_KEY_PEM || '').trim();
}

function isEnvelopeShape(envelope: unknown): envelope is LicenseEnvelope {
  if (!envelope || typeof envelope !== 'object') return false;
  const e = envelope as LicenseEnvelope;
  return (
    e.format === 'ANBARIN-LICENSE' &&
    e.algorithm === 'RS256' &&
    typeof e.payload === 'string' &&
    e.payload.length > 0 &&
    typeof e.signature === 'string' &&
    e.signature.length > 0
  );
}

/**
 * خواندن storage: فقط envelope معتبر است.
 * اگر نسخهٔ قدیمی { payload, envelope } باشد و دو payload ناسازگار باشند → باطل.
 */
function readStoredEnvelope(): LicenseEnvelope | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return null;

    // فرمت جدید v2: فقط envelope
    if (raw.v === 2 && isEnvelopeShape(raw.envelope)) {
      return raw.envelope as LicenseEnvelope;
    }

    // فرمت قدیمی: { payload, envelope }
    if (isEnvelopeShape(raw.envelope)) {
      const envelope = raw.envelope as LicenseEnvelope;
      const fromEnvelope = parsePayloadFromEnvelope(envelope);
      if (!fromEnvelope) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      // اگر payload جداگانه هست باید با envelope یکی باشد؛ وگرنه دستکاری
      if (raw.payload && typeof raw.payload === 'object') {
        try {
          const separate = raw.payload as OfflineLicensePayload;
          if (JSON.stringify(normalizePayload(separate)) !== JSON.stringify(normalizePayload(fromEnvelope))) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY);
          return null;
        }
      }
      // مهاجرت به v2 فقط-envelope
      writeStoredEnvelope(envelope);
      return envelope;
    }

    return null;
  } catch {
    return null;
  }
}

function writeStoredEnvelope(envelope: LicenseEnvelope): void {
  const stored: StoredLicense = { v: 2, envelope };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

function normalizePayload(p: OfflineLicensePayload): unknown {
  return {
    schemaVersion: p.schemaVersion,
    applicationId: p.applicationId,
    licenseId: p.licenseId,
    customerName: p.customerName,
    customerReference: p.customerReference || '',
    plan: p.plan,
    modules: Array.isArray(p.modules) ? [...p.modules].sort() : [],
    issuedAt: p.issuedAt,
    validUntil: p.validUntil,
    deviceId: p.deviceId,
    maxDevices: p.maxDevices,
    status: p.status,
    transferRequiresIssuerApproval: p.transferRequiresIssuerApproval,
  };
}

function parsePayloadFromEnvelope(envelope: LicenseEnvelope): OfflineLicensePayload | null {
  try {
    const payloadBytes = decodeBase64Url(envelope.payload);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as OfflineLicensePayload;
    if (!payload || payload.schemaVersion !== 1 || payload.applicationId !== 'com.anbarian.app') return null;
    return payload;
  } catch {
    return null;
  }
}

function isPayloadCurrentlyValid(payload: OfflineLicensePayload): boolean {
  if (payload.status !== 'active') return false;
  if (!payload.licenseId || !payload.customerName || !payload.deviceId) return false;
  if (payload.maxDevices !== 1 || payload.transferRequiresIssuerApproval !== true) return false;
  if (payload.deviceId !== getDeviceId()) return false;
  if (!payload.validUntil || !Number.isFinite(Date.parse(payload.validUntil))) return false;
  const until =
    payload.validUntil.length === 10 ? payload.validUntil + 'T23:59:59Z' : payload.validUntil;
  if (Date.parse(until) < Date.now()) return false;
  return true;
}

async function verifyEnvelopeSignature(envelope: LicenseEnvelope): Promise<boolean> {
  const publicPem = configuredPublicKey();
  if (!publicPem) return false;
  try {
    const payloadBytes = decodeBase64Url(envelope.payload);
    const signature = decodeBase64Url(envelope.signature);
    const key = await crypto.subtle.importKey(
      'spki',
      pemToBytes(publicPem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, payloadBytes);
  } catch {
    return false;
  }
}

export async function ensureOfflineLicenseIntegrity(force = false): Promise<boolean> {
  if (!force && sessionSignatureValid === true) return true;
  if (!force && sessionVerifyPromise) return sessionVerifyPromise;

  sessionVerifyPromise = (async () => {
    const envelope = readStoredEnvelope();
    if (!envelope) {
      sessionSignatureValid = false;
      return false;
    }
    const payload = parsePayloadFromEnvelope(envelope);
    if (!payload || !isPayloadCurrentlyValid(payload)) {
      localStorage.removeItem(STORAGE_KEY);
      sessionSignatureValid = false;
      return false;
    }
    const ok = await verifyEnvelopeSignature(envelope);
    if (!ok) {
      localStorage.removeItem(STORAGE_KEY);
      sessionSignatureValid = false;
      return false;
    }
    writeStoredEnvelope(envelope);
    sessionSignatureValid = true;
    return true;
  })();

  try {
    return await sessionVerifyPromise;
  } finally {
    sessionVerifyPromise = null;
  }
}

export function getOfflineLicense(): OfflineLicensePayload | null {
  if (sessionSignatureValid === false) return null;

  const envelope = readStoredEnvelope();
  if (!envelope) return null;

  const payload = parsePayloadFromEnvelope(envelope);
  if (!payload || !isPayloadCurrentlyValid(payload)) return null;

  if (sessionSignatureValid !== true) {
    void ensureOfflineLicenseIntegrity();
  }
  return payload;
}

export async function getOfflineLicenseVerified(): Promise<OfflineLicensePayload | null> {
  const ok = await ensureOfflineLicenseIntegrity();
  if (!ok) return null;
  return getOfflineLicense();
}

export async function activateOfflineLicenseFile(file: File): Promise<OfflineLicensePayload> {
  if (!(file instanceof File) || file.size < 32 || file.size > 256_000) {
    throw new Error('فایل لایسنس نامعتبر است.');
  }
  const publicPem = configuredPublicKey();
  if (!publicPem) throw new Error('کلید عمومی صادرکننده در برنامه موجود نیست.');
  let envelope: LicenseEnvelope;
  try {
    envelope = JSON.parse(await file.text()) as LicenseEnvelope;
  } catch {
    throw new Error('ساختار فایل لایسنس قابل‌خواندن نیست.');
  }
  if (!isEnvelopeShape(envelope)) {
    throw new Error('فرمت یا الگوریتم فایل لایسنس پشتیبانی نمی‌شود.');
  }
  const verified = await verifyEnvelopeSignature(envelope);
  if (!verified) throw new Error('امضای دیجیتال لایسنس معتبر نیست.');

  const payload = parsePayloadFromEnvelope(envelope);
  if (!payload) throw new Error('اطلاعات داخل لایسنس خراب است.');
  if (payload.status !== 'active') throw new Error('این لایسنس برای این برنامه صادر نشده است.');
  if (
    !payload.licenseId ||
    !payload.customerName ||
    !payload.deviceId ||
    payload.maxDevices !== 1 ||
    payload.transferRequiresIssuerApproval !== true
  ) {
    throw new Error('فیلدهای ضروری لایسنس ناقص است.');
  }
  if (payload.deviceId !== getDeviceId()) {
    throw new Error('این لایسنس برای دستگاه دیگری صادر شده است. برای انتقال، تأیید صادرکننده لازم است.');
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(payload.validUntil) ||
    !Number.isFinite(Date.parse(payload.validUntil + 'T23:59:59Z'))
  ) {
    throw new Error('تاریخ انقضای لایسنس معتبر نیست.');
  }
  if (Date.parse(payload.validUntil + 'T23:59:59Z') < Date.now()) {
    throw new Error('اعتبار این لایسنس به پایان رسیده است.');
  }

  // فقط envelope — بدون کپی جداگانه payload
  writeStoredEnvelope(envelope);
  sessionSignatureValid = true;
  sessionVerifyPromise = null;
  return payload;
}

export function deactivateOfflineLicense(): void {
  localStorage.removeItem(STORAGE_KEY);
  sessionSignatureValid = false;
  sessionVerifyPromise = null;
}

export function getOfflineLicenseStatus(): string | null {
  const license = getOfflineLicense();
  if (!license) return null;
  const mods =
    Array.isArray(license.modules) && license.modules.length
      ? license.modules.join('+')
      : license.plan;
  return `لایسنس آفلاین امضاشده فعال — ${license.customerName} | ${mods} | تا ${license.validUntil}`;
}

export async function bootstrapOfflineLicenseIntegrity(): Promise<void> {
  await ensureOfflineLicenseIntegrity(true);
}
