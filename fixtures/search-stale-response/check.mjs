import { readFile } from 'node:fs/promises';
import { replay } from './model.mjs';
import { assertInvariant, isTargetFailure, assertHumanApproved } from './oracle.mjs';
const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
const mode = process.argv[2] ?? 'fixed';
try {
  if (process.argv.includes('--require-human-approval')) assertHumanApproved(manifest);
  const actual = replay(manifest.inputs, mode);
  assertInvariant(actual, manifest.expectedBehavior);
  console.log(JSON.stringify({ fixture: manifest.id, mode, result: 'pass', actual, classification: manifest.classification, approval: manifest.approval.status }));
} catch (error) {
  console.error(JSON.stringify({ fixture: manifest.id, mode, result: isTargetFailure(error) ? 'target-invariant-failure' : 'other-error', code: error.code ?? null, message: error.message }));
  process.exitCode = isTargetFailure(error) ? 1 : 2;
}
