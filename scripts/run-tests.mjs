import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const testsRoot = join(root, 'tests');
const files = [];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.mjs')) files.push(fullPath);
  }
}

collect(testsRoot);
files.sort();
if (files.length === 0) {
  process.stderr.write('No .mjs test files found under tests/.\\n');
  process.exit(1);
}
process.stdout.write(`Running ${files.length} test files (recursive discovery).\\n`);
const result = spawnSync(process.execPath, [
  '--experimental-strip-types',
  '--disable-warning=ExperimentalWarning',
  '--test',
  ...files,
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
