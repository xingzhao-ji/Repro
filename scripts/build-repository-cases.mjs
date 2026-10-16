// Build only the registered, pinned upstream browser assets. This does not run
// their code, install their dependencies, or execute upstream package scripts.
import { build, version as esbuildVersion } from 'esbuild';
import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.slice(2).includes('--check');
if (process.argv.slice(2).some(argument => argument !== '--check')) {
  throw new Error('Usage: node scripts/build-repository-cases.mjs [--check]');
}
const expectedEsbuildVersion = '0.28.2';
if (esbuildVersion !== expectedEsbuildVersion) {
  throw new Error(`Expected esbuild ${expectedEsbuildVersion}; found ${esbuildVersion}. Restore dependencies with npm ci.`);
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const scriptPath = 'scripts/build-repository-cases.mjs';
const scriptSha256 = hash(await readFile(resolve(root, scriptPath)));
const settings = {
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  globalName: 'ReproMarked',
  charset: 'utf8',
  legalComments: 'inline',
  minify: false,
  sourcemap: false,
  treeShaking: true,
};
const recipes = [
  { id: 'htmx-checkbox', entry: 'src/htmx.js', mode: 'exact-copy' },
  { id: 'marked-empty-heading', entry: 'src/marked.ts', mode: 'esbuild' },
];

async function readRegular(relativePath) {
  const absolutePath = resolve(root, relativePath);
  if (!absolutePath.startsWith(root + sep) || !(await lstat(absolutePath)).isFile()) {
    throw new Error(`Expected a regular file inside the checkout: ${relativePath}`);
  }
  return readFile(absolutePath);
}

const outputs = new Map();
for (const recipe of recipes) {
  const directory = `fixtures/repository-cases/${recipe.id}`;
  const provenance = JSON.parse(await readRegular(`${directory}/provenance.json`));
  const verifiedFiles = new Map();
  for (const file of provenance.files) {
    if (!/^upstream\/(buggy|fixed)\/[a-zA-Z0-9_.\/-]+$/.test(file.path)
        || file.path.split('/').includes('..')) {
      throw new Error(`Invalid provenance path for ${recipe.id}.`);
    }
    const content = await readRegular(`${directory}/${file.path}`);
    if (content.length !== file.bytes || hash(content) !== file.sha256) {
      throw new Error(`Pinned source differs: ${directory}/${file.path}. Restore the original revision; do not rebuild from modified upstream source.`);
    }
    verifiedFiles.set(file.path, file.sha256);
  }

  const variants = {};
  for (const variant of ['buggy', 'fixed']) {
    const entryPoint = `${directory}/upstream/${variant}/${recipe.entry}`;
    const sourceHashes = Object.fromEntries([...verifiedFiles]
      .filter(([path]) => path.startsWith(`upstream/${variant}/`))
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    let bytes;
    let bundledInputs = [];
    if (recipe.mode === 'exact-copy') {
      bytes = await readRegular(entryPoint);
    } else {
      const result = await build({
        ...settings,
        absWorkingDir: root,
        entryPoints: [entryPoint],
        outfile: `${directory}/${variant}.js`,
        write: false,
        metafile: true,
        logLevel: 'silent',
      });
      bundledInputs = Object.keys(result.metafile.inputs).sort();
      for (const input of bundledInputs) {
        const relative = input.split(sep).join('/');
        if (!relative.startsWith(`${directory}/upstream/${variant}/`)
            || !verifiedFiles.has(relative.slice(directory.length + 1))) {
          throw new Error(`Bundle used an undeclared input: ${input}`);
        }
      }
      if (Object.values(result.metafile.outputs).some(output => output.imports.length > 0)
          || result.outputFiles.length !== 1) {
        throw new Error(`Bundle for ${recipe.id}/${variant} is not a single self-contained browser asset.`);
      }
      bytes = Buffer.from(result.outputFiles[0].contents);
    }
    const outputPath = `${directory}/${variant}.js`;
    outputs.set(outputPath, bytes);
    variants[variant] = {
      revision: provenance.revisions[variant],
      entryPoint,
      sourceHashes,
      bundledInputs,
      output: { path: outputPath, bytes: bytes.length, sha256: hash(bytes) },
    };
  }
  const attestation = {
    schemaVersion: 1,
    caseId: recipe.id,
    mode: recipe.mode,
    buildScript: { path: scriptPath, sha256: scriptSha256 },
    compiler: recipe.mode === 'esbuild' ? { name: 'esbuild', version: esbuildVersion } : null,
    settings: recipe.mode === 'esbuild' ? settings : null,
    variants,
    claim: 'Source acquisition and deterministic compilation only; no execution or buggy/fixed outcome is claimed.',
  };
  outputs.set(`${directory}/build.json`, Buffer.from(JSON.stringify(attestation, null, 2) + '\n'));
}

// Validate every source before changing any generated artifact.
for (const [path, bytes] of outputs) {
  if (check) {
    let existing;
    try { existing = await readRegular(path); } catch {
      throw new Error(`Missing generated asset ${path}. Run node ${scriptPath}.`);
    }
    if (!existing.equals(bytes)) {
      throw new Error(`Generated asset differs: ${path}. Review the change and run node ${scriptPath}.`);
    }
  } else {
    try {
      const current = await lstat(resolve(root, path));
      if (!current.isFile()) throw new Error(`Refusing to replace a non-file: ${path}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await writeFile(resolve(root, path), bytes);
  }
  console.log(`${check ? 'verified' : 'built'} ${path} ${bytes.length} bytes sha256=${hash(bytes)}`);
}
