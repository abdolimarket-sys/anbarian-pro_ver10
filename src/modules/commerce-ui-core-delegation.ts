/**
 * Event delegation یک‌باره برای click / change / input بازرگانی.
 * پس از هر render فقط handler map به‌روز می‌شود.
 */

export type CoreEventHandler = (event: Event) => void | Promise<void>;
export type CoreAttrHandler = (node: HTMLElement, event: Event) => void | Promise<void>;

const clickById = new Map<string, CoreEventHandler>();
const clickByAttr = new Map<string, CoreAttrHandler>();
const changeById = new Map<string, CoreEventHandler>();
const inputById = new Map<string, CoreEventHandler>();
let installed = false;

export function setCoreClickHandler(id: string, handler: CoreEventHandler | null): void {
  if (!handler) clickById.delete(id);
  else clickById.set(id, handler);
}

export function setCoreAttrHandler(attr: string, handler: CoreAttrHandler | null): void {
  if (!handler) clickByAttr.delete(attr);
  else clickByAttr.set(attr, handler);
}

export function setCoreChangeHandler(id: string, handler: CoreEventHandler | null): void {
  if (!handler) changeById.delete(id);
  else changeById.set(id, handler);
}

export function setCoreInputHandler(id: string, handler: CoreEventHandler | null): void {
  if (!handler) inputById.delete(id);
  else inputById.set(id, handler);
}

function runHandler(label: string, handler: CoreEventHandler, event: Event): void {
  void Promise.resolve(handler(event)).catch((e) => {
    console.error('[Anbarin] core handler failed', label, e);
  });
}

export function installCommerceCoreDelegation(root: Document | HTMLElement = document): void {
  if (installed) return;
  installed = true;

  root.addEventListener('click', (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const withId = target.closest<HTMLElement>(
      'button[id], [role="button"][id], a[id], input[type="button"][id], input[type="submit"][id]',
    );
    if (withId?.id) {
      const handler = clickById.get(withId.id);
      if (handler) {
        event.preventDefault();
        runHandler(withId.id, handler, event);
        return;
      }
    }

    for (const [attr, handler] of clickByAttr) {
      const node = target.closest<HTMLElement>(`[${attr}]`);
      if (node && (root === document || root.contains(node))) {
        event.preventDefault();
        void Promise.resolve(handler(node, event)).catch((e) => {
          console.error('[Anbarin] core attr handler failed', attr, e);
        });
        return;
      }
    }
  });

  root.addEventListener('change', (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.id) return;
    const handler = changeById.get(target.id);
    if (!handler) return;
    runHandler(target.id, handler, event);
  });

  root.addEventListener('input', (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.id) return;
    const handler = inputById.get(target.id);
    if (!handler) return;
    runHandler(target.id, handler, event);
  });
}

export function isCommerceCoreDelegationInstalled(): boolean {
  return installed;
}
