import { products, settings, findProductByCode } from './state';
import { initScanner, isInvoiceScanActive, getScannerCapabilities, type ScanResult } from './scanner';
import { handleScannedCode, openQtyModal, isQtyModalOpen, canCount } from './count';
import { offerAddProduct } from './products-ui';

let scannerInitialized = false;
let capabilityListenerRegistered = false;

/** مقداردهی اسکنر و اتصال نتیجه اسکن به شمارش یا فاکتور؛ فقط یک بار در هر صفحه. */
export function initScannerController(): void {
  if (!capabilityListenerRegistered) {
    capabilityListenerRegistered = true;
    window.addEventListener('anbarin:scanner-capabilities-changed', updateScannerCapabilities);
  }
  if (scannerInitialized) return;
  scannerInitialized = true;

  initScanner({
    containerId: 'scanner-container',
    getSettings: () => settings,
    canScan: () => isInvoiceScanActive() || canCount(),
    isQtyModalOpen: () => isQtyModalOpen(),
    onScan: (result: ScanResult) => {
      if (isInvoiceScanActive()) {
        window.dispatchEvent(new CustomEvent('anbarin:invoice-barcode-scan', { detail: { code: result.code } }));
        return;
      }
      handleScannedCode(result.code, {
        onNotFound: (code) => offerAddProduct(code, {
          onSaved: (productId) => {
            const product = products.find((item) => item.id === productId);
            if (product) openQtyModal(product);
          },
        }),
      });
      const info = document.getElementById('lastScanInfo');
      if (info) {
        const product = findProductByCode(result.code);
        info.textContent = product
          ? `کالای انتخاب‌شده: ${product.name}`
          : `کالایی با بارکد ${result.code} پیدا نشد`;
      }
    },
    onFieldFill: (fieldId, code) => {
      const field = document.getElementById(fieldId) as HTMLInputElement | null;
      if (field) field.value = code;
    },
  });
  updateScannerCapabilities();
}

export function updateScannerCapabilities(): void {
  const caps = getScannerCapabilities();
  const element = document.getElementById('capsInfo');
  if (!element) return;
  const parts = [
    caps.barcodeDetector ? 'BarcodeDetector' : null,
    caps.html5Qrcode ? 'Html5Qrcode' : null,
    caps.mediaDevices ? 'Camera' : null,
    'USB/BT',
  ].filter(Boolean);
  element.textContent = parts.join(' + ') || 'فقط دستی';
}
