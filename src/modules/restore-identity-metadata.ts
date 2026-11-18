/**
 * اعمال اتمیک فراداده هویتی همراه پشتیبان.
 * اگر هر نوشتن localStorage شکست بخورد، مقادیر قبلی تا حد امکان برگردانده می‌شوند.
 */
export type RestoreIdentityPayload = {
  localUsers?: unknown;
  operator?: unknown;
};

export type RestoreMetadataStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const IDENTITY_KEYS = ['anbarin_local_users_v1', 'anbar_operator'] as const;

export function applyRestoredIdentityMetadata(
  storage: RestoreMetadataStorage,
  payload: RestoreIdentityPayload,
): void {
  const updates: Array<{ key: typeof IDENTITY_KEYS[number]; value: string }> = [];
  if (Array.isArray(payload.localUsers)) {
    updates.push({ key: 'anbarin_local_users_v1', value: JSON.stringify(payload.localUsers) });
  }
  if (typeof payload.operator === 'string' && payload.operator) {
    updates.push({ key: 'anbar_operator', value: payload.operator });
  }
  if (!updates.length) return;

  const before = new Map(updates.map(({ key }) => [key, storage.getItem(key)]));
  try {
    for (const update of updates) storage.setItem(update.key, update.value);
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const { key } of [...updates].reverse()) {
      try {
        const previous = before.get(key);
        if (previous === null || previous === undefined) storage.removeItem(key);
        else storage.setItem(key, previous);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], 'ذخیره فراداده بازیابی و بازگردانی مقادیر قبلی ناموفق بود');
    }
    throw error;
  }
}
