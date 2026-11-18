/**
 * گذرگاه رویداد دامنه‌ای بازرگانی/مالی — جایگزین render سراسری تدریجی.
 * بدون وابستگی به DOM.
 */
type Handler = (detail?: unknown) => void;

const handlers = new Map<string, Set<Handler>>();

export type CommerceEventName =
  | 'commerce:updated'
  | 'stock:truth-changed'
  | 'invoice:posted'
  | 'backup:completed'
  | 'accounting:data-updated';

export function onCommerceEvent(name: CommerceEventName | string, handler: Handler): () => void {
  let set = handlers.get(name);
  if (!set) {
    set = new Set();
    handlers.set(name, set);
  }
  set.add(handler);
  return () => {
    set!.delete(handler);
  };
}

export function emitCommerceEvent(name: CommerceEventName | string, detail?: unknown): void {
  const set = handlers.get(name);
  if (!set || set.size === 0) return;
  for (const handler of [...set]) {
    try {
      handler(detail);
    } catch (e) {
      console.error('[Anbarin] commerce event handler failed', name, e);
    }
  }
  // سازگاری با listenerهای window موجود
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  } catch (e) {
    console.error('[Anbarin] window event dispatch failed', name, e);
  }
}
