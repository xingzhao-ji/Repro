import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Inventory only the repository inputs used by the trusted package checks.
export async function packageInputHashes(root, includeDist = false) {
  const paths = ['package.json', 'package-lock.json', 'tsconfig.json', 'assets/tokens.css',
    'scripts/build.mjs', 'scripts/build-repository-cases.mjs', 'scripts/package-inputs.mjs', 'scripts/package-smoke.mjs', 'scripts/authored-package-smoke.mjs'];
  const folders = ['src', 'web', 'fixtures/browser-search', 'fixtures/repository-cases', 'security'];
  if (includeDist) folders.push('dist');
  for (const folder of folders) {
    for (const path of await readdir(join(root, folder), { recursive: true })) {
      const local = join(folder, path);
      if ((await lstat(join(root, local))).isFile()) paths.push(local);
    }
  }
  return Object.fromEntries(await Promise.all(paths.sort().map(async path => [path, createHash('sha256').update(await readFile(join(root, path))).digest('hex')])));
}
