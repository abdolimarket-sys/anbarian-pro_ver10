import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('offline license verifier no longer imports the high-level license module', () => {
  const offline = read('src/modules/offline-license.ts');
  assert.doesNotMatch(offline, /from\s+['"]\.\/license['"]/);
  assert.match(offline, /configureOfflineLicenseDeviceIdProvider/);
  assert.match(offline, /deviceIdProvider\(\)/);
});

test('license module configures the offline verifier with the existing device identity', () => {
  const license = read('src/modules/license.ts');
  assert.match(license, /configureOfflineLicenseDeviceIdProvider\(\(\)\s*=>\s*getDeviceId\(\)\)/);
  assert.match(license, /import\s*\{[^}]*configureOfflineLicenseDeviceIdProvider[^}]*\}\s*from\s*['"]\.\/offline-license['"]/s);
});

test('offline license device identity is resolved lazily and missing setup fails closed', () => {
  const offline = read('src/modules/offline-license.ts');
  assert.match(offline, /if\s*\(!deviceIdProvider\)\s*\{\s*throw new Error/);
  assert.match(offline, /return deviceIdProvider\(\)/);
});

test('application source has no relative-import dependency cycles', () => {
  const sourceRoot = path.join(root, 'src');
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:ts|tsx|js)$/.test(full)) files.push(full);
    }
  };
  walk(sourceRoot);
  const known = new Set(files);
  const graph = new Map();
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const deps = [];
    for (const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) continue;
      let candidate = path.normalize(path.join(path.dirname(file), match[1]));
      if (!path.extname(candidate)) {
        const resolved = ['.ts', '.tsx', '.js'].map((ext) => candidate + ext).find((p) => known.has(p));
        if (resolved) candidate = resolved;
      }
      if (known.has(candidate)) deps.push(candidate);
    }
    graph.set(file, deps);
  }
  const complete = new Set();
  const active = new Set();
  const stack = [];
  const cycles = [];
  const visit = (file) => {
    if (active.has(file)) {
      const start = stack.indexOf(file);
      cycles.push([...stack.slice(start), file]);
      return;
    }
    if (complete.has(file)) return;
    active.add(file);
    stack.push(file);
    for (const dep of graph.get(file) || []) visit(dep);
    stack.pop();
    active.delete(file);
    complete.add(file);
  };
  for (const file of files) visit(file);
  assert.deepEqual(cycles, [], `Import cycles found:\n${cycles.map((c) => c.join(' -> ')).join('\n')}`);
});
