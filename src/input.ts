import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { ReproError, type Manifest, type BrowserCaseExpectation } from './contracts.js';
import { createAuthoredManifest, validateManifest } from './manifest.js';
import { createCaseManifest } from './browser-case.js';

export async function readManifest(path: string): Promise<Manifest> {
  return validateManifest(await readDocument(path, 'MANIFEST', 'Manifest'));
}

export async function readExperiment(path: string): Promise<Manifest> {
  const input = await readDocument(path, 'EXPERIMENT', 'Experiment');
  if (input && typeof input === 'object' && !Array.isArray(input) && 'caseId' in input) {
    if (Object.keys(input).length !== 2 || !('expectation' in input) || typeof input.caseId !== 'string'
      || !input.expectation || typeof input.expectation !== 'object' || Array.isArray(input.expectation)) {
      throw new ReproError('input', 'CASE_DECLARATION', 'Provide only caseId and an explicit expectation. Run cases --case ID to inspect the supported declaration.');
    }
    return createCaseManifest(input.caseId, input.expectation as BrowserCaseExpectation);
  }
  return createAuthoredManifest(input);
}

async function readDocument(path: string, code: string, label: string): Promise<unknown> {
  const limit = 65_536;
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > limit) throw new ReproError('input', `${code}_FILE`, `${label} must be a regular, single-link file no larger than 64 KiB.`);
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit || stat.ino !== before.ino || stat.dev !== before.dev) throw new ReproError('input', `${code}_FILE`, `${label} must be a regular, single-link file no larger than 64 KiB.`);
      const buffer = Buffer.alloc(limit + 1); let bytes = 0;
      while (bytes < buffer.length) {
        const read = await file.read(buffer, bytes, buffer.length - bytes, null);
        if (!read.bytesRead) break; bytes += read.bytesRead;
      }
      if (bytes > limit) throw new ReproError('input', `${code}_TOO_LARGE`, `${label} exceeds 64 KiB.`);
      let parsed: unknown;
      try { parsed = JSON.parse(buffer.subarray(0, bytes).toString('utf8')); }
      catch (cause) { throw new ReproError('input', `${code}_JSON`, `${label} is not valid JSON.`, { cause }); }
      return parsed;
    } finally { await file.close(); }
  } catch (cause) {
    if (cause instanceof ReproError) throw cause;
    throw new ReproError('input', `${code}_READ`, `${label} could not be read safely.`, { cause });
  }
}
