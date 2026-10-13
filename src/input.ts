import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { ReproError, type Manifest } from './contracts.js';
import { validateManifest } from './manifest.js';

export async function readManifest(path: string): Promise<Manifest> {
  const limit = 65_536;
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > limit) throw new ReproError('input', 'MANIFEST_FILE', 'Manifest must be a regular, single-link file no larger than 64 KiB.');
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit || stat.ino !== before.ino || stat.dev !== before.dev) throw new ReproError('input', 'MANIFEST_FILE', 'Manifest must be a regular, single-link file no larger than 64 KiB.');
      const buffer = Buffer.alloc(limit + 1); let bytes = 0;
      while (bytes < buffer.length) {
        const read = await file.read(buffer, bytes, buffer.length - bytes, null);
        if (!read.bytesRead) break; bytes += read.bytesRead;
      }
      if (bytes > limit) throw new ReproError('input', 'MANIFEST_TOO_LARGE', 'Manifest exceeds 64 KiB.');
      let parsed: unknown;
      try { parsed = JSON.parse(buffer.subarray(0, bytes).toString('utf8')); }
      catch (cause) { throw new ReproError('input', 'MANIFEST_JSON', 'Manifest is not valid JSON.', { cause }); }
      return validateManifest(parsed);
    } finally { await file.close(); }
  } catch (cause) {
    if (cause instanceof ReproError) throw cause;
    throw new ReproError('input', 'MANIFEST_READ', 'Manifest could not be read safely.', { cause });
  }
}
