/** قفل درون‌فرآیندی برای جلوگیری از اجرای هم‌زمان عملیات حساس. */
const activeOperations = new Set<string>();

export async function runExclusive<T>(
  key: string,
  operation: () => Promise<T>,
  busyResult: T,
): Promise<T> {
  if (activeOperations.has(key)) return busyResult;
  activeOperations.add(key);
  try {
    return await operation();
  } finally {
    activeOperations.delete(key);
  }
}

export function isOperationActive(key: string): boolean {
  return activeOperations.has(key);
}
