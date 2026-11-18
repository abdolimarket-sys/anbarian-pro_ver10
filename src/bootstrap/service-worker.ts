const APP_VERSION = '2.1.10';

/** پاک‌سازی کش نسخه قدیمی و ثبت/به‌روزرسانی Service Worker. */
export function initializeServiceWorker(): void {
  try {
    const previousVersion = localStorage.getItem('anbarin_app_version') || '';
    if (previousVersion && previousVersion !== APP_VERSION) {
      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(keys
            .filter((key) => key.startsWith('anbarin-'))
            .map((key) => caches.delete(key))))
          .catch(() => {});
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations?.()
          .then((registrations) => registrations.forEach((registration) => registration.update()))
          .catch(() => {});
      }
    }
    localStorage.setItem('anbarin_app_version', APP_VERSION);
  } catch {
    // فضای ذخیره‌سازی ممکن است در حالت خصوصی یا محدود در دسترس نباشد.
  }

  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js').then((registration) => {
    console.log('[Anbarin] SW registered', registration.scope);
    if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
    registration.update().catch(() => {});
  }, (error) => console.warn('[Anbarin] SW failed', error));
}
