import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createCaseManifest } from '../src/browser-case.js';
import { readExperiment } from '../src/input.js';

test('an explicit registered-case declaration freezes the same expectation through the public file reader', async () => {
  const root = join('.repro-runs/practical-beta/input-tests', randomUUID()); await mkdir(root, { recursive: true });
  const expected = createCaseManifest('morphdom-textarea');
  const path = join(root, 'declaration.json');
  await writeFile(path, JSON.stringify({ caseId: expected.caseId, expectation: expected.expectation }));
  assert.deepEqual(await readExperiment(path), expected);
  for (const data of [{ caseId: expected.caseId }, { caseId: expected.caseId, expectation: expected.expectation, authorization: 'privacy-sentinel' }]) {
    await writeFile(path, JSON.stringify(data));
    await assert.rejects(readExperiment(path), error => error instanceof Error && !error.message.includes('privacy-sentinel'));
  }
});

test('CLI lists an inspectable case declaration without launching a browser', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'cases', '--case', 'morphdom-textarea'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { caseId: 'morphdom-textarea', expectation: createCaseManifest('morphdom-textarea').expectation });
});
