import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const moduleUrl = new URL('../scripts/package-inputs.mjs', import.meta.url).href;
const inputs = ['package.json', 'package-lock.json', 'tsconfig.json', 'assets/tokens.css',
  'scripts/build.mjs', 'scripts/package-inputs.mjs', 'scripts/package-smoke.mjs', 'scripts/authored-package-smoke.mjs',
  'src/index.ts', 'web/main.tsx', 'web/style.css', 'fixtures/browser-search/buggy.js', 'security/policy.json', 'dist/cli.js'];

async function fixture() {
  const parent = resolve('.repro-runs/package-input-provenance/fixtures');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'inputs-'));
  for (const path of inputs) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `original ${path}\n`);
  }
  return root;
}

function inventory(root: string, includeDist: boolean) {
  // Execute the actual Node ESM helper; importing the package drivers would
  // start installations and browser runs unrelated to this filesystem guard.
  return spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { packageInputHashes } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(await packageInputHashes(process.argv[1], process.argv[2] === 'true')));`,
    root, String(includeDist)], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
}

function snapshot(root: string, includeDist: boolean): Record<string, string> {
  const result = inventory(root, includeDist);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as Record<string, string>;
}

for (const includeDist of [false, true]) {
  const mode = includeDist ? 'authored package' : 'package';
  for (const path of ['assets/tokens.css', 'tsconfig.json', 'src/index.ts']) {
    test(`${mode} source guard detects changes to ${path}`, async () => {
      const root = await fixture();
      const before = snapshot(root, includeDist);
      await writeFile(join(root, path), `changed ${path}\n`);
      assert.notDeepEqual(snapshot(root, includeDist), before, `${path} changed without invalidating package evidence`);
    });
  }
  test(`${mode} source guard detects added source and rejects missing required input`, async () => {
    const root = await fixture();
    const before = snapshot(root, includeDist);
    await writeFile(join(root, 'src/added.ts'), 'export const added = true;');
    assert.notDeepEqual(snapshot(root, includeDist), before);
    await unlink(join(root, 'assets/tokens.css'));
    const result = inventory(root, includeDist);
    assert.notEqual(result.status, 0, 'Missing required tokens must not yield a successful snapshot');
    assert.match(result.stderr, /ENOENT/);
  });
  test(`${mode} source guard excludes run/cache data and retains its built-artifact boundary`, async () => {
    const root = await fixture();
    const before = snapshot(root, includeDist);
    for (const folder of ['.repro-runs', '.repro-cache']) {
      await mkdir(join(root, folder));
      await writeFile(join(root, folder, 'generated.txt'), 'owned generated data');
    }
    assert.deepEqual(snapshot(root, includeDist), before);
    await writeFile(join(root, 'dist/cli.js'), 'changed built artifact');
    const after = snapshot(root, includeDist);
    if (includeDist) assert.notDeepEqual(after, before);
    else assert.deepEqual(after, before);
  });
}
