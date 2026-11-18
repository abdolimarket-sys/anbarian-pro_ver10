import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const events = readFileSync(new URL('../src/modules/inventory-count-events.ts', import.meta.url), 'utf8');

test('inventory and counting event handlers are delegated to the dedicated module', () => {
  assert.match(main, /import \{ bindInventoryCountEvents \} from '\.\/modules\/inventory-count-events';/);
  assert.match(main, /bindInventoryCountEvents\(\{ updateHeader, refreshLists, updateUndoBtn \}\)/);
  for (const id of ['btnClearCounts', 'btnZeroUncounted', 'btnApplySystem', 'btnResetToSystem', 'btnOpenScanner', 'btnQuickCount', 'qtyConfirm', 'undoBtn', 'btnPrintLabels']) {
    assert.ok(events.includes(`#${id}`) || events.includes(`'${id}'`), `missing handler for ${id}`);
    assert.ok(!new RegExp(`getElementById\\('${id}'\\)\\?\\.addEventListener`).test(main), `handler ${id} remains in main.ts`);
  }
});

test('inventory/count event registration is idempotent and keeps guarded write actions', () => {
  assert.match(events, /let inventoryCountEventsBound = false/);
  assert.match(events, /if \(inventoryCountEventsBound\) return/);
  assert.match(events, /guardWrite\('اعمال شمارش روی موجودی سیستم'\)/);
  assert.match(events, /guardWrite\('اسکن'\)/);
  assert.match(events, /guardWrite\('شمارش سریع'\)/);
});
