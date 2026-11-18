import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const moduleSource = fs.readFileSync(new URL('../src/modules/management-panels.ts', import.meta.url), 'utf8');
const headerUpdater = fs.readFileSync(new URL('../src/modules/header-updater.ts', import.meta.url), 'utf8');

test('management dashboard, inventory movement and activity panels are delegated to a module', () => {
  assert.match(headerUpdater, /import \{ renderManagementPanels \} from '\.\/management-panels'/);
  assert.match(headerUpdater, /renderManagementPanels\(root\)/);
  assert.doesNotMatch(main, /renderManagementDashboard|renderInventoryMovementPanel|renderActivityHistoryPanel/);
});

test('management panels preserve independent optional DOM targets', () => {
  for (const id of ['managementDashboard', 'inventoryMovementPanel', 'activityHistoryPanel']) {
    assert.ok(moduleSource.includes(`'${id}'`));
  }
  assert.match(moduleSource, /root: Document = document/);
  assert.match(moduleSource, /if \(dashboard\)/);
  assert.match(moduleSource, /if \(movementPanel\)/);
  assert.match(moduleSource, /if \(activityPanel\)/);
});
