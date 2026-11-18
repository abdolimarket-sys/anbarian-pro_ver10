import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/modules/ui.ts', import.meta.url), 'utf8');
const backup = readFileSync(new URL('../src/modules/device-auto-backup.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const backupEvents = readFileSync(new URL('../src/modules/backup-settings-events.ts', import.meta.url), 'utf8');
const combined = main + '\n' + backupEvents;

test('backup credential collection uses the in-app prompt, not browser prompt', () => {
  assert.match(ui, /export function promptAction\(/);
  assert.match(ui, /inputType\?: 'text' \| 'password'/);
  assert.match(backup, /promptAction\([^\n]*inputType: 'password'/);
  assert.match(backup, /multiline: true/);
  assert.doesNotMatch(backup, /window\.prompt\s*\(/);
  assert.doesNotMatch(main, /window\.prompt\s*\(/);
});

test('manager key password setup validates and confirms the password in-app', () => {
  assert.match(combined, /title: 'تعیین رمز مدیر'.*inputType: 'password'.*minLength: 12/);
  assert.match(combined, /title: 'تکرار رمز مدیر'.*inputType: 'password'.*minLength: 12/);
});

test('Drive OAuth connected state is reflected on disconnect action', () => {
  assert.match(combined, /role === 'drive' && r === 'drive-disconnect'/);
  assert.doesNotMatch(combined, /role === 'drive' && r === 'drive-connect'/);
});

test('SAF Drive folder is treated as selected custom folder, not OAuth connection', () => {
  assert.match(combined, /if \(s\.isDrive\)[\s\S]*?setActive\('custom'\)/);
  assert.match(combined, /s\.mode === 'unsupported' \? null/);
});

test('stale async Drive status refresh cannot overwrite a newer backup-location state', () => {
  assert.match(combined, /let backupLocationRefreshSeq = 0/);
  assert.match(combined, /const refreshSeq = \+\+backupLocationRefreshSeq/);
  assert.equal((combined.match(/refreshSeq !== backupLocationRefreshSeq/g) || []).length, 3);
});
