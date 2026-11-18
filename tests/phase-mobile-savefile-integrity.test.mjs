import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plugin = readFileSync(new URL('../android/app/src/main/java/com/anbarian/app/SaveFilePlugin.java', import.meta.url), 'utf8');
const helpers = readFileSync(new URL('../src/utils/helpers.ts', import.meta.url), 'utf8');
const backupEvents = readFileSync(new URL('../src/modules/backup-settings-events.ts', import.meta.url), 'utf8');

test('native SaveFile reads the original payload after the Android picker returns', () => {
  assert.match(plugin, /call\.getString\("data",\s*""\)/);
  assert.doesNotMatch(plugin, /pendingBase64|pendingFilename/);
});

test('native SaveFile rejects empty data and explicitly truncates before writing', () => {
  assert.match(plugin, /bytes\.length == 0/);
  assert.match(plugin, /openOutputStream\(uri,\s*"wt"\)/);
});

test('native SaveFile verifies the written file before reporting success', () => {
  assert.match(plugin, /openInputStream\(uri\)/);
  assert.match(plugin, /verifiedBytes != bytes\.length/);
  assert.match(plugin, /response\.put\("bytesWritten",\s*verifiedBytes\)/);
});

test('Android download helper refuses empty payloads and checks native byte count', () => {
  assert.match(helpers, /blob\.size <= 0/);
  assert.match(helpers, /result\.bytesWritten !== blob\.size/);
});

test('unified backup still uses the shared verified Android download helper', () => {
  assert.match(backupEvents, /downloadFile\(JSON\.stringify\(encrypted, null, 2\), filename/);
});
