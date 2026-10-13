import { constants, lstatSync, mkdirSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ReproError } from './contracts.js';

/** Refuse symlinks before creating or writing task-owned output. Local workspace is trusted, not a concurrent hostile filesystem sandbox. */
export function ownedDirectory(value: string): string {
  const target = resolve(value); const root = resolve('.repro-runs'); const local = relative(root, target);
  if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) throw new ReproError('input', 'OUTPUT_BOUNDARY', 'Generated output must be in a child directory of .repro-runs.');
  let current = process.cwd();
  for (const part of relative(current, target).split(sep)) {
    current = join(current, part);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      mkdirSync(current, { mode: 0o700 }); stat = lstatSync(current);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new ReproError('input', 'OUTPUT_LINK', 'Generated output cannot traverse a symbolic link or non-directory.');
  }
  return target;
}
export function regularOwnedFile(path: string): void {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new ReproError('input', 'OUTPUT_FILE', 'Owned state must be a regular single-link file.');
  } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
}

/** Check the opened file before truncation; never follow an existing output link. */
export async function writeOwnedFile(path: string, content: string): Promise<void> {
  regularOwnedFile(path);
  try {
    const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.nlink !== 1) throw new ReproError('input', 'OUTPUT_FILE', 'Owned output must be a regular single-link file.');
      await file.truncate(0);
      await file.writeFile(content);
    } finally { await file.close(); }
  } catch (cause) {
    if (cause instanceof ReproError) throw cause;
    throw new ReproError('input', 'OUTPUT_WRITE', 'Owned output could not be written safely.', { cause });
  }
}
