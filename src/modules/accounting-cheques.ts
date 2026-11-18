/** دفتر چک‌ها، سررسید، واگذاری به بانک و سوابق تغییرات */
import { idbGet, idbPut } from './storage';
import { loadCommerceData, saveCommerceData, withCommerceMutationLock, type CashTransaction } from './accounting-commerce';
import { logAudit } from './state';
import { digits, latinDigits } from './commerce-ui-shared';

export type ChequeEventType = 'deposited'|'extended'|'replaced'|'bounced_note'|'cleared_note'|'void_note';
export interface ChequeEvent { id:string; transactionId:string; type:ChequeEventType; date:string; note:string; oldValue?:string; newValue?:string; createdAt:string; }
export interface ChequeBookData { schemaVersion:1; events:ChequeEvent[]; }
const KEY='accounting_phase36_cheque_book';
const now=()=>new Date().toISOString();
const uid=()=>`chq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;

/** نرمال‌سازی تاریخ شمسی به YYYY/MM/DD با ارقام لاتین */
function normalizeJalaliDate(raw: string): string {
  const d = digits(String(raw || '').trim()).replace(/-/g, '/').replace(/\./g, '/');
  const m = d.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return '';
  return `${m[1]}/${m[2].padStart(2, '0')}/${m[3].padStart(2, '0')}`;
}

const validDate = (s: string) => /^\d{4}\/\d{2}\/\d{2}$/.test(normalizeJalaliDate(s));

export async function loadChequeBook(): Promise<ChequeBookData> {
  const v = await idbGet<unknown>(KEY);
  if (v && typeof v === 'object' && (v as ChequeBookData).schemaVersion === 1 && Array.isArray((v as ChequeBookData).events)) {
    return v as ChequeBookData;
  }
  return { schemaVersion: 1, events: [] };
}

async function addEvent(
  tx: CashTransaction,
  type: ChequeEventType,
  date: string,
  note: string,
  oldValue?: string,
  newValue?: string,
) {
  const data = await loadChequeBook();
  data.events.push({
    id: uid(),
    transactionId: tx.id,
    type,
    date: normalizeJalaliDate(date) || date,
    note,
    oldValue,
    newValue,
    createdAt: now(),
  });
  await idbPut(KEY, data);
  logAudit(`cheque_${type}`, { transactionId: tx.id, date, note, oldValue, newValue });
}

function cheque(tx: CashTransaction) {
  if (tx.method !== 'cheque' || !tx.chequeNumber || !tx.chequeDueDate) throw new Error('چک معتبر پیدا نشد.');
  if (tx.chequeStatus !== 'pending') throw new Error('فقط چک در انتظار قابل تغییر است.');
}

export async function extendChequeDueDate(transactionId: string, newDueDate: string, note: string): Promise<void> {
  return withCommerceMutationLock(async () => {
    // Snapshot باید پس از گرفتن قفل خوانده شود تا ذخیره این تغییر، عملیات مالی تازه‌تر را نپوشاند.
    const c = await loadCommerceData();
    const tx = c.cashTransactions.find(x => x.id === transactionId);
    if (!tx) throw new Error('چک پیدا نشد.');
    cheque(tx);
    const due = normalizeJalaliDate(newDueDate);
    if (!validDate(due) || due < normalizeJalaliDate(tx.date)) throw new Error('تاریخ سررسید جدید معتبر نیست.');
    const old = normalizeJalaliDate(tx.chequeDueDate!) || tx.chequeDueDate!;
    if (due === old) throw new Error('تاریخ جدید با سررسید فعلی یکسان است.');
    await saveCommerceData({
      ...c,
      cashTransactions: c.cashTransactions.map(x => (x.id === tx.id ? { ...x, chequeDueDate: due } : x)),
    });
    await addEvent(tx, 'extended', due, note.trim() || 'تمدید سررسید', old, due);
  });
}

export async function replaceChequeDetails(
  transactionId: string,
  input: { number: string; bank: string; dueDate: string; date: string; note: string },
): Promise<void> {
  return withCommerceMutationLock(async () => {
    const c = await loadCommerceData();
    const tx = c.cashTransactions.find(x => x.id === transactionId);
    if (!tx) throw new Error('چک پیدا نشد.');
    cheque(tx);
    const number = input.number.trim();
    const bank = input.bank.trim();
    const due = normalizeJalaliDate(input.dueDate);
    const eventDate = normalizeJalaliDate(input.date);
    if (!number || !bank || !validDate(due) || due < normalizeJalaliDate(tx.date) || !validDate(eventDate)) {
      throw new Error('شماره، بانک و تاریخ‌های چک جایگزین معتبر و الزامی هستند.');
    }
    // تکراری فقط در همان جهت و برای چک فعال (pending/cleared)
    const isActive = (s?: string) => !s || s === 'pending' || s === 'cleared';
    const duplicate = c.cashTransactions.some(
      x =>
        x.id !== tx.id &&
        x.type === tx.type &&
        x.method === 'cheque' &&
        isActive(x.chequeStatus) &&
        (x.chequeNumber || '').trim() === number &&
        (x.chequeBank || '').trim().toLocaleLowerCase() === bank.toLocaleLowerCase(),
    );
    if (duplicate) throw new Error('شماره چک جایگزین قبلاً برای چک فعال دیگری در همین نوع سند ثبت شده است.');
    const old = `${tx.chequeNumber}|${tx.chequeBank}|${tx.chequeDueDate}`;
    await saveCommerceData({
      ...c,
      cashTransactions: c.cashTransactions.map(x =>
        x.id === tx.id ? { ...x, chequeNumber: number, chequeBank: bank, chequeDueDate: due } : x,
      ),
    });
    await addEvent(tx, 'replaced', eventDate, input.note.trim() || 'جایگزینی برگه چک', old, `${number}|${bank}|${due}`);
  });
}

export async function recordChequeEvent(
  transactionId: string,
  type: 'deposited' | 'bounced_note' | 'cleared_note' | 'void_note',
  date: string,
  note: string,
): Promise<void> {
  const c = await loadCommerceData();
  const tx = c.cashTransactions.find(x => x.id === transactionId);
  if (!tx) throw new Error('چک پیدا نشد.');
  if (tx.method !== 'cheque') throw new Error('سند انتخابی چک نیست.');
  const eventDate = normalizeJalaliDate(date);
  if (!validDate(eventDate)) throw new Error('تاریخ شمسی معتبر وارد کنید.');
  if (type === 'deposited' && tx.type !== 'receipt') throw new Error('ثبت واگذاری به بانک فقط برای چک دریافتی است.');
  if (type === 'deposited' && tx.chequeStatus !== 'pending') throw new Error('فقط چک دریافتی در انتظار قابل واگذاری است.');
  await addEvent(tx, type, eventDate, note.trim() || 'بدون توضیح');
}

/** تقریب ترتیبی برای مقایسه سررسید شمسی (با ارقام نرمال‌شده) */
function jalaliOrdinal(value: string): number {
  const norm = normalizeJalaliDate(value);
  if (!norm) return Number.NaN;
  const [y, m, d] = norm.split('/').map(Number);
  if (![y, m, d].every(n => Number.isFinite(n) && n > 0)) return Number.NaN;
  let days = (y - 1) * 365 + Math.floor((y - 1) / 4) - Math.floor((y - 1) / 100) + Math.floor((y - 1) / 400);
  days += m <= 6 ? (m - 1) * 31 : 186 + (m - 7) * 30;
  return days + d;
}

export async function getChequeDashboard(today: string): Promise<{
  pending: number;
  overdue: CashTransaction[];
  dueSoon: CashTransaction[];
  events: ChequeEvent[];
}> {
  const todayNorm = normalizeJalaliDate(today);
  if (!validDate(todayNorm)) throw new Error('تاریخ امروز باید شمسی باشد (مثال: 1405/08/16).');
  const c = await loadCommerceData();
  const b = await loadChequeBook();
  const base = jalaliOrdinal(todayNorm);
  if (!Number.isFinite(base)) throw new Error('تاریخ امروز نامعتبر است.');

  const pending = c.cashTransactions.filter(x => x.method === 'cheque' && x.chequeStatus === 'pending');

  const withDue = pending
    .map(x => {
      const due = x.chequeDueDate ? jalaliOrdinal(x.chequeDueDate) : Number.NaN;
      return { tx: x, due };
    })
    .filter(x => Number.isFinite(x.due));

  const overdue = withDue
    .filter(x => x.due < base)
    .sort((a, b) => a.due - b.due)
    .map(x => x.tx);

  const dueSoon = withDue
    .filter(x => x.due >= base && x.due <= base + 7)
    .sort((a, b) => a.due - b.due)
    .map(x => x.tx);

  // رویدادها جدیدتر اول؛ کلید تاریخ با ارقام لاتین
  const events = [...b.events].sort((a, b) => {
    const da = latinDigits(a.date);
    const db = latinDigits(b.date);
    return db.localeCompare(da) || b.createdAt.localeCompare(a.createdAt);
  });

  return { pending: pending.length, overdue, dueSoon, events };
}
