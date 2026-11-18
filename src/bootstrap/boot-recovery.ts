import { bootState, products } from '../modules/state';
import { toast } from '../modules/ui';
import { recoverInterruptedSelectedRestore, tryRecoverFromExternalBackup } from '../modules/device-auto-backup';
import { runFinancialIntegrityOnBoot } from '../modules/accounting-commerce';

/** بارگذاری داده‌ها، بازیابی پشتیبان نیمه‌تمام و کنترل یکپارچگی مالی پیش از ساخت رابط. */
export async function runBootRecovery(): Promise<string> {
  let source = await bootState();
  console.log('[Anbarin] boot source:', source, '| products:', products.length);

  const interruptedRestore = await recoverInterruptedSelectedRestore();
  if (interruptedRestore === 'recovered') source = await bootState();

  if (interruptedRestore !== 'failed' && (source === 'empty' || products.length === 0)) {
    const recovered = await tryRecoverFromExternalBackup();
    if (recovered === 'restored') source = await bootState();
  }

  try {
    const integrity = await runFinancialIntegrityOnBoot();
    if (integrity.recovery.status === 'recovered' && integrity.recovery.message) {
      toast(integrity.recovery.message, 'success');
    } else if (integrity.recovery.status === 'blocked' && integrity.recovery.message) {
      toast(integrity.recovery.message, 'error');
    }
    if (integrity.stockReconciled > 0) {
      console.log('[Anbarin] stock reconciled on boot:', integrity.stockReconciled);
    }
    if (integrity.integrityErrors > 0) {
      console.error('[Anbarin] financial integrity errors on boot:', integrity.integrityErrors);
      toast(`هشدار یکپارچگی مالی: ${integrity.integrityErrors} مورد نیاز به بررسی دارد.`, 'error');
    }
  } catch (error) {
    console.error('[Anbarin] financial integrity on boot failed:', error);
    toast('بازیابی عملیات مالی نیمه‌تمام انجام نشد؛ اطلاعات برای بررسی حفظ شده است.', 'error');
  }

  return source;
}
