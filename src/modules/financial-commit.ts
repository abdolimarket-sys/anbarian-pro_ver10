/**
 * financial-commit.ts
 * ---------------------------------------------------------------------------
 * اصلاح ریشه‌ای ناهمگامی چنددامنه‌ای در انبارین.
 *
 * مشکل قبلی:
 *   ثبت فاکتور / دریافت / پرداخت در چند فراخوانی جداگانه IndexedDB انجام
 *   می‌شد (حسابداری → بهای تمام‌شده → بازرگانی → نشانگر). کرش بین این
 *   مراحل وضعیت نیمه‌تمام ایجاد می‌کرد.
 *
 * راه‌حل:
 *   همه کلیدهای مرتبط (primary + backup هر دامنه + نشانگر عملیات) در
 *   یک تراکنش واحد IndexedDB نوشته می‌شوند. یا همه با هم commit می‌شوند
 *   یا هیچ‌کدام.
 *
 * محدودیت آگاهانه:
 *   موجودی کارت کالا (app_state) هنوز پس از commit مالی ذخیره می‌شود،
 *   چون مسیر پشتیبان/تاریخچه آن جداست. منبع حقیقت مالی، دامنه‌های زیر است
 *   و در بازیابی می‌توان موجودی کارت را از گردش بهای تمام‌شده هم‌تراز کرد.
 */

import { idbGet, idbPut, idbPutMany, idbPutManyGuarded, idbDelete } from './storage';

// ——— کلیدهای دامنه (باید با ماژول‌های accounting / commerce / costing یکی باشد) ———

export const FINANCIAL_KEYS = {
  accounting: {
    primary: 'accounting_phase20_data',
    backup: 'accounting_phase20_backup',
  },
  commerce: {
    primary: 'accounting_phase22_commerce',
    backup: 'accounting_phase22_commerce_backup',
  },
  costing: {
    primary: 'accounting_phase23_costing',
    backup: 'accounting_phase23_costing_backup',
  },
  operationJournal: 'accounting_operation_journal_v1',
} as const;

// ——— مدل نشانگر عملیات پایدار ———

export type CommerceOperationKind =
  | 'post-invoice'
  | 'cash-transaction'
  | 'cheque-status'
  | 'cheque-endorsement'
  | 'nrv-write-down';

export type PendingCommerceOperation = {
  id: string;
  kind: CommerceOperationKind;
  /** برای post-invoice */
  invoiceId?: string;
  /** برای cash-transaction و cheque-status */
  transactionId?: string;
  /**
   * ورودی اصلی عملیات نقدی/چکی تا در بازیابی دوباره اجرا شود.
   * فقط داده‌های لازم و سریال‌پذیر؛ بدون ارجاع به objectهای زنده.
   */
  inputSnapshot?: unknown;
  startedAt: string;
  attempts: number;
  lastError?: string;
  state?: 'pending' | 'completed';
  completedAt?: string;
};

// ——— خواندن / نوشتن نشانگر ———

export async function readPendingCommerceOperation(): Promise<PendingCommerceOperation | undefined> {
  return idbGet<PendingCommerceOperation>(FINANCIAL_KEYS.operationJournal);
}

export async function writePendingCommerceOperation(operation: PendingCommerceOperation): Promise<void> {
  await idbPut(FINANCIAL_KEYS.operationJournal, operation);
}

/**
 * علامت‌گذاری تکمیل به‌صورت tombstone.
 * اگر همراه commitFinancialDomains صدا زده شود، در همان تراکنش نوشته می‌شود
 * و این تابع جداگانه لازم نیست.
 */
export async function markOperationCompleted(operationId: string): Promise<void> {
  const current = await readPendingCommerceOperation();
  if (current?.id !== operationId) return;
  await idbPut(FINANCIAL_KEYS.operationJournal, {
    ...current,
    state: 'completed' as const,
    completedAt: new Date().toISOString(),
    lastError: undefined,
  });
}

/**
 * انصراف آگاهانه از عملیات مالی نیمه‌تمام.
 * ----------------------------------------------------------------
 * فقط نشانگر عملیات (operation journal) را به حالت completed تبدیل می‌کند.
 * هیچ تغییری در داده‌های حسابداری، بازرگانی، بهای تمام‌شده یا موجودی کارت
 * ایجاد نمی‌کند. مناسب وقتی بازیابی خودکار ممکن نیست و کاربر می‌خواهد
 * قفل عملیات را آزاد کند.
 *
 * بازگشت:
 *   - discarded: نشانگر پاک‌سازی شد
 *   - none: عملیات نیمه‌تمامی وجود نداشت
 */
export async function discardPendingCommerceOperation(reason?: string): Promise<{
  status: 'discarded' | 'none';
  operation?: PendingCommerceOperation;
}> {
  const current = await readPendingCommerceOperation();
  if (!current || current.state === 'completed') {
    return { status: 'none' };
  }

  const discarded: PendingCommerceOperation = {
    ...current,
    state: 'completed',
    completedAt: new Date().toISOString(),
    lastError: reason
      ? `انصراف آگاهانه توسط کاربر: ${reason}`
      : 'انصراف آگاهانه توسط کاربر',
  };

  await idbPut(FINANCIAL_KEYS.operationJournal, discarded);
  return { status: 'discarded', operation: discarded };
}

// ——— Commit اتمیک چنددامنه‌ای ———

export type FinancialCommitPayload = {
  /** داده نهایی حسابداری (سند posted) */
  accounting?: unknown;
  /** داده نهایی بازرگانی (فاکتور posted یا تراکنش نقدی) */
  commerce?: unknown;
  /** داده نهایی بهای تمام‌شده / گردش انبار */
  costing?: unknown;
  /**
   * نشانگر عملیات که باید در همان تراکنش به completed تبدیل شود.
   * اگر داده نشود، نشانگر دست‌نخورده می‌ماند.
   */
  completedOperation?: PendingCommerceOperation;
};

/**
 * نوشتن اتمیک همه دامنه‌های مالی + tombstone عملیات.
 *
 * ترتیب داخل تراکنش مهم نیست؛ IndexedDB یا همه putها را commit می‌کند
 * یا در صورت خطا هیچ‌کدام را اعمال نمی‌کند.
 */
export async function commitFinancialDomains(payload: FinancialCommitPayload): Promise<void> {
  const entries: Array<{ key: string; value: unknown }> = [];

  if (payload.accounting !== undefined) {
    entries.push({ key: FINANCIAL_KEYS.accounting.backup, value: payload.accounting });
    entries.push({ key: FINANCIAL_KEYS.accounting.primary, value: payload.accounting });
  }
  if (payload.commerce !== undefined) {
    entries.push({ key: FINANCIAL_KEYS.commerce.backup, value: payload.commerce });
    entries.push({ key: FINANCIAL_KEYS.commerce.primary, value: payload.commerce });
  }
  if (payload.costing !== undefined) {
    entries.push({ key: FINANCIAL_KEYS.costing.backup, value: payload.costing });
    entries.push({ key: FINANCIAL_KEYS.costing.primary, value: payload.costing });
  }
  if (payload.completedOperation) {
    entries.push({
      key: FINANCIAL_KEYS.operationJournal,
      value: {
        ...payload.completedOperation,
        state: 'completed' as const,
        completedAt: new Date().toISOString(),
        lastError: undefined,
      },
    });
  }

  if (!entries.length) {
    throw new Error('commitFinancialDomains: هیچ دامنه‌ای برای ذخیره ارسال نشده است.');
  }

  await idbPutMany(entries);
}

/**
 * ثبت نشانگر pending قبل از شروع کار سنگین.
 * اگر عملیات دیگری نیمه‌تمام باشد و مربوط به همین هدف نباشد، خطا می‌دهد.
 */
export async function beginCommerceOperation(
  next: Omit<PendingCommerceOperation, 'startedAt' | 'attempts' | 'state'> & {
    attempts?: number;
  },
): Promise<PendingCommerceOperation> {
  // Claim the journal key with a single IndexedDB readwrite transaction.
  // This closes the cross-tab race where two tabs could both read an empty
  // journal and then overwrite each other's pending operation.
  const claimed: PendingCommerceOperation = {
    ...next,
    startedAt: new Date().toISOString(),
    attempts: next.attempts ?? 1,
    state: 'pending',
  };

  await idbPutManyGuarded(
    [{ key: FINANCIAL_KEYS.operationJournal, value: claimed }],
    FINANCIAL_KEYS.operationJournal,
    (rawCurrent) => {
      const existing = rawCurrent as PendingCommerceOperation | undefined;
      if (!existing || existing.state === 'completed') return;

      const sameInvoice = next.kind === 'post-invoice' &&
        existing.kind === 'post-invoice' && existing.invoiceId === next.invoiceId;
      const sameTx = (next.kind === 'cash-transaction' || next.kind === 'cheque-status' || next.kind === 'cheque-endorsement') &&
        existing.kind === next.kind && existing.transactionId === next.transactionId;
      const sameNrv = next.kind === 'nrv-write-down' &&
        existing.kind === 'nrv-write-down' && existing.id === next.id;
      const sameById = existing.id === next.id;

      if (!sameInvoice && !sameTx && !sameNrv && !sameById) {
        throw new Error('یک عملیات مالی نیمه‌تمام وجود دارد؛ ابتدا بازیابی آن را تکمیل کنید.');
      }

      // Preserve the original operation identity and snapshot on a retry.
      Object.assign(claimed, existing, {
        attempts: (existing.attempts || 0) + 1,
        lastError: undefined,
        state: 'pending' as const,
      });
    },
  );

  return claimed;
}

/**
 * بازیابی پشتیبان چنددامنه‌ای — همان commit اتمیک بدون journal عملیات روزمره.
 * حداقل یک دامنه باید ارسال شود.
 */
export async function commitRestoredFinancialSnapshot(args: {
  accounting?: unknown;
  commerce?: unknown;
  costing?: unknown;
}): Promise<void> {
  if (args.accounting === undefined && args.commerce === undefined && args.costing === undefined) {
    return;
  }
  await commitFinancialDomains({
    accounting: args.accounting,
    commerce: args.commerce,
    costing: args.costing,
  });
}

/**
 * ریست کنترل‌شده دامنه‌های مالی و عملیاتی.
 * ----------------------------------------------------------------
 * قبل از پاک‌سازی، یک نسخه اضطراری از وضعیت فعلی در کلید
 * emergency_before_factory_reset ذخیره می‌شود.
 *
 * پاک می‌شود:
 *   - حسابداری، بازرگانی، بهای تمام‌شده (+ پشتیبان‌هایشان)
 *   - نشانگر عملیات نیمه‌تمام
 *   - دفتر چک، زنجیره ظهرنویسی، نتایج وصول
 *   - مغایرت بانکی
 *   - app_state (کارت کالا / موجودی عملیاتی)
 *   - autobackup و تاریخچه خودکار
 *
 * حفظ می‌شود (عمداً):
 *   - لایسنس
 *   - تنظیمات پایه و کاربران محلی
 *   - لاگ حسابرسی (برای ردیابی خودِ عمل ریست)
 */
export type FactoryResetResult = {
  ok: boolean;
  backedUp: boolean;
  clearedKeys: string[];
  message: string;
};

const FACTORY_RESET_KEYS = [
  FINANCIAL_KEYS.accounting.primary,
  FINANCIAL_KEYS.accounting.backup,
  FINANCIAL_KEYS.commerce.primary,
  FINANCIAL_KEYS.commerce.backup,
  FINANCIAL_KEYS.costing.primary,
  FINANCIAL_KEYS.costing.backup,
  FINANCIAL_KEYS.operationJournal,
  'accounting_phase35_bank_reconciliation',
  'accounting_phase36_cheque_book',
  'accounting_phase39_cheque_chain',
  'accounting_phase40_cheque_holder_outcomes',
  'app_state',
  'autobackup',
  'autobackup_prev',
  'autobackup_history',
  'emergency_before_import_restore',
  'emergency_before_selected_restore',
] as const;

export async function factoryResetFinancialAndOperationalData(
  confirmationPhrase: string,
): Promise<FactoryResetResult> {
  const expected = 'پاک کردن همه داده‌ها';
  if (confirmationPhrase.trim() !== expected) {
    return {
      ok: false,
      backedUp: false,
      clearedKeys: [],
      message: `عبارت تأیید نادرست است. برای ادامه باید دقیقاً بنویسید: ${expected}`,
    };
  }

  // ۱) نسخه اضطراری قبل از ریست
  let backedUp = false;
  try {
    const snapshot: Record<string, unknown> = {
      createdAt: new Date().toISOString(),
      reason: 'emergency_before_factory_reset',
    };
    for (const key of FACTORY_RESET_KEYS) {
      try {
        const value = await idbGet(key);
        if (value !== undefined) snapshot[key] = value;
      } catch {
        /* کلید ممکن است وجود نداشته باشد */
      }
    }
    await idbPut('emergency_before_factory_reset', snapshot);
    backedUp = true;
  } catch (e) {
    return {
      ok: false,
      backedUp: false,
      clearedKeys: [],
      message: `امکان تهیه نسخه اضطراری قبل از ریست وجود نداشت: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // ۲) پاک‌سازی کلیدها
  const clearedKeys: string[] = [];
  for (const key of FACTORY_RESET_KEYS) {
    try {
      await idbDelete(key);
      clearedKeys.push(key);
    } catch {
      /* ادامه می‌دهیم؛ بعضی کلیدها ممکن است از قبل نباشند */
    }
  }

  return {
    ok: true,
    backedUp,
    clearedKeys,
    message: backedUp
      ? `ریست انجام شد. ${clearedKeys.length} کلید پاک شد و نسخه اضطراری ذخیره گردید.`
      : `ریست انجام شد. ${clearedKeys.length} کلید پاک شد.`,
  };
}

