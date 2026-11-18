import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const moduleText=readFileSync(new URL('../src/modules/accounting-cheques.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const chequeUi=readFileSync(new URL('../src/modules/commerce-ui-cheques.ts',import.meta.url),'utf8');
const uiAll=ui+chequeUi;
const commerce=readFileSync(new URL('../src/modules/accounting-commerce.ts',import.meta.url),'utf8');
const scanner=readFileSync(new URL('../src/modules/scanner.ts',import.meta.url),'utf8');
test('phase 36 stores cheque events in an independent versioned store',()=>{assert.match(moduleText,/accounting_phase36_cheque_book/);assert.match(moduleText,/schemaVersion:1; events:ChequeEvent\[\]/)});
test('phase 36 validates pending cheque due-date extension and records old/new values',()=>{assert.match(moduleText,/extendChequeDueDate/);assert.match(moduleText,/فقط چک در انتظار قابل تغییر است/);assert.match(moduleText,/oldValue/);assert.match(moduleText,/newValue/);assert.match(moduleText,/addEvent\(tx, 'extended', due, note\.trim\(\) \|\| 'تمدید سررسید', old, due\)/)});
test('phase 36 replaces cheque instrument details without creating a duplicate active number',()=>{assert.match(moduleText,/replaceChequeDetails/);assert.match(moduleText,/شماره چک جایگزین قبلاً/);assert.match(moduleText,/chequeNumber: number, chequeBank: bank, chequeDueDate: due/)});
test('phase 36 tracks bank deposit, bounce and clearing notes with audit events',()=>{for(const marker of ['deposited','bounced_note','cleared_note','logAudit'])assert.ok(moduleText.includes(marker))});
test('phase 36 exposes cheque register, overdue alerts and operational actions',()=>{for(const marker of ['دفتر چک‌ها','سررسیدگذشته','data-chq-extend','data-chq-replace','data-chq-deposit'])assert.ok(uiAll.includes(marker))});
test('phase 36 leaves original cheque accounting lifecycle and barcode scanner source intact',()=>{assert.match(commerce,/updateChequeStatus/);assert.ok(scanner.length>0)});


test('phase 36 serializes cheque due-date and replacement edits with financial mutations', () => {
  for (const name of ['extendChequeDueDate', 'replaceChequeDetails']) {
    const start = moduleText.indexOf(`export async function ${name}`);
    const next = moduleText.indexOf('\nexport async function ', start + 1);
    const body = moduleText.slice(start, next > start ? next : moduleText.length);
    assert.match(body, /withCommerceMutationLock\(async \(\) =>/);
    assert.ok(body.indexOf('withCommerceMutationLock') < body.indexOf('loadCommerceData()'));
    assert.ok(body.indexOf('loadCommerceData()') < body.indexOf('saveCommerceData('));
  }
});
