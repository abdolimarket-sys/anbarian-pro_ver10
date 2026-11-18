import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('invoice posting writes a durable operation marker before mutating ledgers', () => {
  const source = read('../src/modules/accounting-commerce.ts');
  const wrapper = source.slice(
    source.indexOf('export async function postInvoice('),
    source.indexOf('async function postInvoiceExclusive'),
  );
  // فاکتور از قبل posted: مستقیم exclusive؛ در غیر این صورت نشانگر سپس exclusive
  assert.match(wrapper, /beginCommerceOperation\(/);
  assert.match(wrapper, /postInvoiceExclusive\(invoiceId, source\)/);
  const beginAt = wrapper.indexOf('beginCommerceOperation(');
  const exclusiveAfterBegin = wrapper.indexOf('postInvoiceExclusive(invoiceId, source)', beginAt);
  assert.ok(beginAt >= 0 && exclusiveAfterBegin > beginAt, 'beginCommerceOperation must precede exclusive post for non-posted invoices');
  assert.match(wrapper, /lastError/);
  assert.match(wrapper, /writePendingCommerceOperation\(\{\s*\.\.\.operation/);
});

test('startup attempts recovery after core state and backup restoration', () => {
  const source = read('../src/main.ts');
  const recovery = read('../src/bootstrap/boot-recovery.ts');
  const boot = source.slice(source.indexOf('async function bootApp()'));
  assert.ok(
    recovery.indexOf('tryRecoverFromExternalBackup') < recovery.indexOf('runFinancialIntegrityOnBoot'),
    'external backup recovery must run before financial integrity boot recovery',
  );
  assert.ok(
    boot.indexOf('runBootRecovery()') < boot.indexOf('renderShell(bindEvents, setupVirtualLists)'),
    'financial integrity boot must complete before shell render',
  );
  assert.match(recovery, /integrity\.recovery\.status === 'blocked'|recovery\.status === 'blocked'/);
});

test('recovery is idempotent and preserves unresolved operations for manual review', () => {
  const source = read('../src/modules/accounting-commerce.ts');
  const recovery = source.slice(
    source.indexOf('export async function recoverPendingCommerceOperation'),
    source.indexOf('async function postInvoiceExclusive'),
  );
  assert.match(recovery, /invoice\.status === 'posted'/);
  assert.match(recovery, /postInvoice\(operation\.invoiceId, commerce\)/);
  assert.match(recovery, /status: 'blocked'/);
  assert.match(recovery, /lastError: message/);
  assert.match(recovery, /markOperationCompleted/);
});


test('recovery does not clear pending markers when an already-applied business state has no posted journal', () => {
  const source = read('../src/modules/accounting-commerce.ts');
  const recovery = source.slice(
    source.indexOf('export async function recoverPendingCommerceOperation'),
    source.indexOf('async function postInvoiceExclusive'),
  );
  assert.match(recovery, /فاکتور .* سند حسابداری مرتبط پیدا نشد/);
  assert.match(recovery, /دریافت\/پرداخت .* سند حسابداری قطعی آن پیدا نشد/);
  assert.match(recovery, /سند حسابداری مرحله .* پیدا نشد/);
  assert.match(recovery, /status: 'blocked'/);
});
