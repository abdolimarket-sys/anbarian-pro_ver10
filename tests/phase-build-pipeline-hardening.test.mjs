import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('CI keeps one canonical Android workflow and runs regression tests before build', () => {
  const workflowDir = resolve(root, '.github/workflows');
  const workflows = readdirSync(workflowDir).filter(name => name.endsWith('.yml') || name.endsWith('.yaml'));
  assert.deepEqual(workflows, ['main.yml']);
  const workflow = readFileSync(resolve(workflowDir, 'main.yml'), 'utf8');
  assert.match(workflow, /node-version:\s*"22"/);
  const testsAt = workflow.indexOf('run: npm test');
  const buildAt = workflow.indexOf('run: npm run build');
  assert.ok(testsAt >= 0 && buildAt > testsAt, 'regression tests must pass before production build');
});

test('critical refactored TypeScript modules parse under the Node 22 test runtime', () => {
  for (const file of [
    'src/modules/accounting-commerce-ui.ts',
    'src/modules/commerce-ui-actions.ts',
    'src/modules/commerce-ui-parties.ts',
    'src/modules/financial-commit.ts',
  ]) {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '--check', resolve(root, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
  }
});
