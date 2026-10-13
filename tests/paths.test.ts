import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ownedDirectory } from '../src/paths.js';
import { Ledger } from '../src/ledger.js';
test('output paths cannot cross symlink ancestors or symlink ledger files', async () => {
  await mkdir('.repro-runs/tests', { recursive: true });
  const root = await mkdtemp('.repro-runs/tests/paths-');
  const outside = join(root, 'outside'); await mkdir(outside);
  await symlink(resolve(outside), join(root, 'link'));
  assert.throws(() => ownedDirectory(join(root, 'link', 'child')), /symbolic link/);
  assert.throws(() => new Ledger(join(root, 'link')), /symbolic link/);
  const actual = join(root, 'actual'); await mkdir(actual);
  const sentinel = join(outside, 'sentinel'); await writeFile(sentinel, 'UNCHANGED');
  await symlink(resolve(sentinel), join(actual, 'ledger.sqlite'));
  assert.throws(() => new Ledger(actual), /regular single-link/);
  assert.equal(await readFile(sentinel, 'utf8'), 'UNCHANGED');
});
