/**
 * تست قرارداد اصلاح ریشه‌ای commit اتمیک.
 * بدون مرورگر: رفتار idbPutMany و ساختار payload را بررسی می‌کند.
 *
 * اجرا: node --test tests/phase-atomic-financial-commit.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// شبیه‌سازی سبک storage برای تست قرارداد
function createMemoryIdb() {
  const store = new Map();
  let lastTransactionKeys = [];
  let failNext = false;

  return {
    store,
    failNextWrite() {
      failNext = true;
    },
    getLastTransactionKeys() {
      return lastTransactionKeys.slice();
    },
    async idbPutMany(entries) {
      if (failNext) {
        failNext = false;
        throw new Error('simulated idb failure');
      }
      lastTransactionKeys = entries.map((e) => e.key);
      for (const e of entries) store.set(e.key, e.value);
    },
    async idbGet(key) {
      return store.get(key);
    },
    async idbPut(key, value) {
      store.set(key, value);
    },
  };
}

const FINANCIAL_KEYS = {
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
};

async function commitFinancialDomains(idb, payload) {
  const entries = [];
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
        state: 'completed',
        completedAt: new Date().toISOString(),
        lastError: undefined,
      },
    });
  }
  if (!entries.length) throw new Error('empty commit');
  await idb.idbPutMany(entries);
}

describe('atomic financial commit contract', () => {
  it('writes accounting + commerce + costing + journal in one transaction', async () => {
    const idb = createMemoryIdb();
    const op = {
      id: 'post-invoice:inv1:1',
      kind: 'post-invoice',
      invoiceId: 'inv1',
      startedAt: new Date().toISOString(),
      attempts: 1,
      state: 'pending',
    };

    await commitFinancialDomains(idb, {
      accounting: { journalEntries: [{ id: 'je1', status: 'posted' }] },
      commerce: { invoices: [{ id: 'inv1', status: 'posted' }] },
      costing: { movements: [{ sourceDocumentId: 'inv1' }] },
      completedOperation: op,
    });

    const keys = idb.getLastTransactionKeys();
    assert.ok(keys.includes(FINANCIAL_KEYS.accounting.primary));
    assert.ok(keys.includes(FINANCIAL_KEYS.accounting.backup));
    assert.ok(keys.includes(FINANCIAL_KEYS.commerce.primary));
    assert.ok(keys.includes(FINANCIAL_KEYS.commerce.backup));
    assert.ok(keys.includes(FINANCIAL_KEYS.costing.primary));
    assert.ok(keys.includes(FINANCIAL_KEYS.costing.backup));
    assert.ok(keys.includes(FINANCIAL_KEYS.operationJournal));

    const journal = await idb.idbGet(FINANCIAL_KEYS.operationJournal);
    assert.equal(journal.state, 'completed');
    assert.equal(journal.invoiceId, 'inv1');
    assert.ok(journal.completedAt);

    const commerce = await idb.idbGet(FINANCIAL_KEYS.commerce.primary);
    assert.equal(commerce.invoices[0].status, 'posted');
  });

  it('does not partially apply when idbPutMany fails', async () => {
    const idb = createMemoryIdb();
    // seed previous state
    await idb.idbPut(FINANCIAL_KEYS.commerce.primary, {
      invoices: [{ id: 'inv1', status: 'draft' }],
    });

    idb.failNextWrite();

    await assert.rejects(
      () =>
        commitFinancialDomains(idb, {
          accounting: { ok: true },
          commerce: { invoices: [{ id: 'inv1', status: 'posted' }] },
          costing: { ok: true },
          completedOperation: {
            id: 'x',
            kind: 'post-invoice',
            invoiceId: 'inv1',
            startedAt: new Date().toISOString(),
            attempts: 1,
            state: 'pending',
          },
        }),
      /simulated idb failure/,
    );

    const commerce = await idb.idbGet(FINANCIAL_KEYS.commerce.primary);
    assert.equal(commerce.invoices[0].status, 'draft');
    assert.equal(await idb.idbGet(FINANCIAL_KEYS.accounting.primary), undefined);
    assert.equal(await idb.idbGet(FINANCIAL_KEYS.operationJournal), undefined);
  });

  it('rejects empty payload', async () => {
    const idb = createMemoryIdb();
    await assert.rejects(() => commitFinancialDomains(idb, {}), /empty commit/);
  });
});
