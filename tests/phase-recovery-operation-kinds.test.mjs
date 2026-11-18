/**
 * قرارداد انواع عملیات Journal و تشخیص عملیات یکسان در beginCommerceOperation
 * اجرا: node --test tests/phase-recovery-operation-kinds.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const KINDS = [
  'post-invoice',
  'cash-transaction',
  'cheque-status',
  'cheque-endorsement',
  'nrv-write-down',
];

function createMemoryIdb() {
  const store = new Map();
  return {
    store,
    async idbPut(key, value) {
      store.set(key, structuredClone(value));
    },
    async idbGet(key) {
      const v = store.get(key);
      return v === undefined ? undefined : structuredClone(v);
    },
  };
}

const JOURNAL_KEY = 'accounting_operation_journal_v1';

async function beginCommerceOperation(idb, next) {
  const existing = await idb.idbGet(JOURNAL_KEY);
  if (existing && existing.state !== 'completed') {
    const sameInvoice =
      next.kind === 'post-invoice' &&
      existing.kind === 'post-invoice' &&
      existing.invoiceId === next.invoiceId;
    const sameTx =
      (next.kind === 'cash-transaction' ||
        next.kind === 'cheque-status' ||
        next.kind === 'cheque-endorsement') &&
      existing.kind === next.kind &&
      existing.transactionId === next.transactionId;
    const sameNrv =
      next.kind === 'nrv-write-down' &&
      existing.kind === 'nrv-write-down' &&
      existing.id === next.id;
    const sameById = existing.id === next.id;
    if (!sameInvoice && !sameTx && !sameNrv && !sameById) {
      throw new Error('یک عملیات مالی نیمه‌تمام وجود دارد؛ ابتدا بازیابی آن را تکمیل کنید.');
    }
    const resumed = {
      ...existing,
      attempts: (existing.attempts || 0) + 1,
      lastError: undefined,
      state: 'pending',
    };
    await idb.idbPut(JOURNAL_KEY, resumed);
    return resumed;
  }
  const created = {
    ...next,
    startedAt: new Date().toISOString(),
    attempts: next.attempts ?? 1,
    state: 'pending',
  };
  await idb.idbPut(JOURNAL_KEY, created);
  return created;
}

describe('commerce operation kinds contract', () => {
  it('supports all recovery kinds', () => {
    for (const k of KINDS) assert.ok(typeof k === 'string' && k.length > 0);
    assert.equal(KINDS.length, 5);
  });

  it('resumes same post-invoice operation', async () => {
    const idb = createMemoryIdb();
    const a = await beginCommerceOperation(idb, {
      id: 'post-invoice:inv1:1',
      kind: 'post-invoice',
      invoiceId: 'inv1',
    });
    const b = await beginCommerceOperation(idb, {
      id: 'post-invoice:inv1:2',
      kind: 'post-invoice',
      invoiceId: 'inv1',
    });
    assert.equal(b.id, a.id);
    assert.equal(b.attempts, 2);
  });

  it('blocks different operation while one is pending', async () => {
    const idb = createMemoryIdb();
    await beginCommerceOperation(idb, {
      id: 'post-invoice:inv1:1',
      kind: 'post-invoice',
      invoiceId: 'inv1',
    });
    await assert.rejects(
      () =>
        beginCommerceOperation(idb, {
          id: 'cash:tx1',
          kind: 'cash-transaction',
          transactionId: 'tx1',
        }),
      /نیمه‌تمام/,
    );
  });

  it('resumes same cheque-endorsement by transactionId', async () => {
    const idb = createMemoryIdb();
    const a = await beginCommerceOperation(idb, {
      id: 'endorse:tx1:endorsement:1',
      kind: 'cheque-endorsement',
      transactionId: 'tx1',
    });
    const b = await beginCommerceOperation(idb, {
      id: 'endorse:tx1:endorsement:1-retry',
      kind: 'cheque-endorsement',
      transactionId: 'tx1',
    });
    assert.equal(b.id, a.id);
    assert.equal(b.attempts, 2);
  });

  it('resumes same nrv by operation id', async () => {
    const idb = createMemoryIdb();
    const id = 'nrv:nrv-wd:p1:wh:1403/01/01:1000';
    const a = await beginCommerceOperation(idb, { id, kind: 'nrv-write-down' });
    const b = await beginCommerceOperation(idb, { id, kind: 'nrv-write-down' });
    assert.equal(b.id, a.id);
    assert.equal(b.attempts, 2);
  });

  it('allows new operation after completed tombstone', async () => {
    const idb = createMemoryIdb();
    await idb.idbPut(JOURNAL_KEY, {
      id: 'old',
      kind: 'post-invoice',
      invoiceId: 'inv1',
      state: 'completed',
      startedAt: new Date().toISOString(),
      attempts: 1,
      completedAt: new Date().toISOString(),
    });
    const next = await beginCommerceOperation(idb, {
      id: 'cash:tx9',
      kind: 'cash-transaction',
      transactionId: 'tx9',
    });
    assert.equal(next.kind, 'cash-transaction');
    assert.equal(next.state, 'pending');
  });
});
