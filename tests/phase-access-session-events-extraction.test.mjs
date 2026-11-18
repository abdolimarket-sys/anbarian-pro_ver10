import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const access = fs.readFileSync(new URL('../src/modules/access-session-events.ts', import.meta.url), 'utf8');

test('role preview and settings save events are isolated and idempotently bound', () => {
  assert.match(main, /bindAccessSettingsEvents\(\{ updateHeader, refreshLists \}\)/);
  assert.match(main, /updateRolePreview\(\)/);
  assert.match(access, /let accessSettingsEventsBound = false/);
  assert.match(access, /if \(accessSettingsEventsBound\) return/);
  assert.match(access, /applySettingsFromForm\(\)/);
  assert.match(access, /callbacks\.updateHeader\(\)/);
  assert.match(access, /callbacks\.refreshLists\(\)/);
  assert.match(access, /setRole.*addEventListener\('change', updateRolePreview\)/);
  assert.doesNotMatch(main, /applySettingsFromForm\(\)/);
});

test('session start and close use one delegated listener with duplicate-click protection', () => {
  assert.match(main, /bindSessionControlEvents\(\{ updateHeader, refreshLists, updateUndoBtn \}\)/);
  assert.match(access, /let sessionControlEventsBound = false/);
  assert.match(access, /if \(sessionControlEventsBound\) return/);
  assert.match(access, /document\.addEventListener\('click'/);
  assert.match(access, /target\.dataset\.actionPending === 'true'/);
  assert.match(access, /finally \{[\s\S]*?delete target\.dataset\.actionPending/);
  assert.doesNotMatch(main, /actionStartSession|actionCloseSession|guardWrite/);
});
