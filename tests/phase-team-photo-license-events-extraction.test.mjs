import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const events = fs.readFileSync(new URL('../src/modules/team-photo-license-events.ts', import.meta.url), 'utf8');

test('team sync, photo and license events are delegated to a dedicated module', () => {
  assert.match(main, /bindTeamPhotoLicenseEvents\(\{ updateHeader, refreshLists \}\)/);
  assert.doesNotMatch(main, /getElementById\('(teamSyncMode|btnActivateOfflineLicense|photoPackFile)'\)/);
  assert.match(events, /export function bindTeamPhotoLicenseEvents/);
  assert.match(events, /syncTeamOnlineNow\(\)/);
  assert.match(events, /importTeamSyncPack\(f\)/);
  assert.match(events, /importPhotosPack\(f\)/);
  assert.match(events, /activateOfflineLicenseFile\(file\)/);
});

test('team, photo and license event binding is idempotent', () => {
  assert.match(events, /let eventsBound = false/);
  assert.match(events, /if \(eventsBound\) return/);
  assert.match(events, /eventsBound = true/);
});
