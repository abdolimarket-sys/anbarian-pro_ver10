/** اتصال رویدادهای پایدار پنل بازرگانی به‌صورت delegation؛ بدون وابستگی به state برنامه. */

export interface CommercePanelActionHandlers {
  onEditParty: (partyId: string) => void;
  onPostInvoice: (invoiceId: string) => void;
}

const boundRoots = new WeakSet<Document | HTMLElement>();

/**
 * برای DOMهای پویا فقط یک listener روی ریشه نصب می‌کند؛ بنابراین پس از render
 * مجدد، دکمه‌ها listener تکراری دریافت نمی‌کنند.
 */
export function bindCommercePanelActions(
  root: Document | HTMLElement,
  handlers: CommercePanelActionHandlers,
): void {
  if (boundRoots.has(root)) return;
  boundRoots.add(root);

  root.addEventListener('click', (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const editButton = target.closest<HTMLElement>('[data-edit-party]');
    if (editButton && root.contains(editButton)) {
      const partyId = editButton.dataset.editParty;
      if (partyId) handlers.onEditParty(partyId);
      return;
    }

    const settleButton = target.closest<HTMLElement>('[data-post-invoice]');
    if (settleButton && root.contains(settleButton)) {
      const invoiceId = settleButton.dataset.postInvoice;
      if (invoiceId) handlers.onPostInvoice(invoiceId);
    }
  });
}


export interface CashTransactionActionHandlers {
  onSave: () => void | Promise<void>;
  onChequeClear: (transactionId: string) => void | Promise<void>;
  onChequeBounce: (transactionId: string) => void | Promise<void>;
}

const cashBoundRoots = new WeakSet<Document | HTMLElement>();

/** رویدادهای ثبت دریافت/پرداخت و تعیین وضعیت چک را روی ریشه پایدار مدیریت می‌کند. */
export function bindCashTransactionActions(
  root: Document | HTMLElement,
  handlers: CashTransactionActionHandlers,
): void {
  if (cashBoundRoots.has(root)) return;
  cashBoundRoots.add(root);

  root.addEventListener('click', (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const saveButton = target.closest<HTMLElement>('#cashSave');
    if (saveButton && root.contains(saveButton)) {
      event.preventDefault();
      void handlers.onSave();
      return;
    }

    const clearButton = target.closest<HTMLElement>('[data-cheque-clear]');
    if (clearButton && root.contains(clearButton)) {
      const transactionId = clearButton.dataset.chequeClear;
      if (transactionId) {
        event.preventDefault();
        void handlers.onChequeClear(transactionId);
      }
      return;
    }

    const bounceButton = target.closest<HTMLElement>('[data-cheque-bounce]');
    if (bounceButton && root.contains(bounceButton)) {
      const transactionId = bounceButton.dataset.chequeBounce;
      if (transactionId) {
        event.preventDefault();
        void handlers.onChequeBounce(transactionId);
      }
    }
  });
}


export interface ChequeManagementActionHandlers {
  onEndorse: (button: HTMLElement) => void | Promise<void>;
  onChainTransfer: (button: HTMLElement) => void | Promise<void>;
  onChainOutcome: (button: HTMLElement) => void | Promise<void>;
  onExtend: (button: HTMLElement) => void | Promise<void>;
  onReplace: (button: HTMLElement) => void | Promise<void>;
  onDeposit: (button: HTMLElement) => void | Promise<void>;
}

const chequeManagementBoundRoots = new WeakSet<Document | HTMLElement>();

/** مدیریت متمرکز کلیک‌های گردش چک؛ listenerها پس از render مجدد تکثیر نمی‌شوند. */
export function bindChequeManagementActions(
  root: Document | HTMLElement,
  handlers: ChequeManagementActionHandlers,
): void {
  if (chequeManagementBoundRoots.has(root)) return;
  chequeManagementBoundRoots.add(root);

  const actions: Array<[string, keyof ChequeManagementActionHandlers]> = [
    ['[data-chq-endorse]', 'onEndorse'],
    ['[data-chain-endorsement]', 'onChainTransfer'],
    ['[data-chain-outcome]', 'onChainOutcome'],
    ['[data-chq-extend]', 'onExtend'],
    ['[data-chq-replace]', 'onReplace'],
    ['[data-chq-deposit]', 'onDeposit'],
  ];

  root.addEventListener('click', (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    for (const [selector, key] of actions) {
      const button = target.closest<HTMLElement>(selector);
      if (!button || !root.contains(button)) continue;
      event.preventDefault();
      void handlers[key](button);
      return;
    }
  });
}


export interface BankManagementActionHandlers {
  onTransfer: () => void | Promise<void>;
  onStatementImport: () => void | Promise<void>;
  onMove: () => void | Promise<void>;
  onFee: () => void | Promise<void>;
  onLedgerLoad: () => void | Promise<void>;
}

const bankManagementBoundRoots = new WeakSet<Document | HTMLElement>();

/** اتصال متمرکز عملیات بانکی؛ فرم‌های پویا با یک listener پایدار کار می‌کنند. */
export function bindBankManagementActions(
  root: Document | HTMLElement,
  handlers: BankManagementActionHandlers,
): void {
  if (bankManagementBoundRoots.has(root)) return;
  bankManagementBoundRoots.add(root);

  const actions: Array<[string, keyof BankManagementActionHandlers]> = [
    ['#bankTransferSave', 'onTransfer'],
    ['#bankStatementImport', 'onStatementImport'],
    ['#bankMoveSave', 'onMove'],
    ['#bankFeeSave', 'onFee'],
    ['#bankLedgerLoad', 'onLedgerLoad'],
  ];

  root.addEventListener('click', (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    for (const [selector, key] of actions) {
      const button = target.closest<HTMLElement>(selector);
      if (!button || !root.contains(button)) continue;
      event.preventDefault();
      void handlers[key]();
      return;
    }
  });
}
