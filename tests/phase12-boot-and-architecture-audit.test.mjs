import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('bootApp rejects a second invocation before any recovery or DOM initialization', () => {
  const source = read('src/main.ts');
  const fn = source.slice(source.indexOf('async function bootApp()'), source.indexOf('\nfunction bindEvents()'));
  assert.match(source, /let bootStarted = false/);
  assert.ok(fn.indexOf('if (bootStarted)') >= 0);
  assert.ok(fn.indexOf('bootStarted = true') < fn.indexOf('runBootRecovery()'));
  assert.match(fn, /duplicate boot request ignored/);
});

test('main module event listeners that survive shell rendering remain module-scoped', () => {
  const source = read('src/main.ts');
  assert.match(source, /let authReadyUiListenerRegistered = false/);
  assert.match(source, /if \(authReadyUiListenerRegistered\) return/);
  assert.match(source, /let bootStarted = false/);
});

test('all extracted event binders retain explicit idempotence guards', () => {
  const files = [
    'src/modules/access-session-events.ts',
    'src/modules/backup-settings-events.ts',
    'src/modules/backup-settings-events.ts',
    'src/modules/inventory-count-events.ts',
    'src/modules/report-events.ts',
    'src/modules/import-export-events.ts',
    'src/modules/team-photo-license-events.ts',
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /let\s+\w*(?:Bound|Registered)\s*=\s*false/, `${file} has no module binding guard`);
    assert.match(source, /if\s*\(\w*(?:Bound|Registered)\)\s*return/, `${file} guard is not enforced`);
  }
});
