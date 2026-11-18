import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const moduleSource = fs.readFileSync(new URL('../src/modules/header-updater.ts', import.meta.url), 'utf8');

test('header and dashboard refresh logic is delegated to header-updater module', () => {
  assert.match(main, /import \{ updateHeader \} from '\.\/modules\/header-updater'/);
  assert.doesNotMatch(main, /function updateHeader\s*\(/);
  assert.match(moduleSource, /export function updateHeader\(root: Document = document\)/);
});

test('header updater keeps all optional panels independent', () => {
  for (const id of ['headerStats', 'statsBox', 'sessionHint', 'sessionLabel', 'phaseBar', 'storageInfo', 'warehouseInfo', 'roleInfo', 'doubleInfo', 'reportSummary', 'stockAlertsPanel', 'photoCountInfo']) {
    assert.ok(moduleSource.includes(`'${id}'`), `missing DOM target ${id}`);
  }
  assert.match(moduleSource, /if \(headerStats\)/);
  assert.match(moduleSource, /if \(statsBox\)/);
  assert.match(moduleSource, /renderManagementPanels\(root\)/);
  assert.match(moduleSource, /refreshTeamSyncUI\(\)/);
  assert.match(moduleSource, /refreshTeamOnlineStatus\(\)/);
});
