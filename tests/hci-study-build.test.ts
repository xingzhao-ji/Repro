import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { buildStudy } from '../scripts/build-hci-study.js';
import { createPacket } from '../scripts/hci-case.js';
import { canonicalJson } from '../src/manifest.js';
import { caseFixture } from './helpers/hci-case-fixture.js';

const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
async function setup() {
  const root = resolve('.repro-runs/hci-comparator/verification', `build-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  const packet = createPacket(caseFixture()), packetPath = join(root, 'packet.json');
  await writeFile(packetPath, JSON.stringify(packet));
  return { root, packet, packetPath, outputDir: join(root, 'study') };
}

test('study build has the same validated evidence and independently checked byte hashes in both conditions', async () => {
  const { packet, packetPath, outputDir } = await setup();
  const manifest = await buildStudy({ packetPath, outputDir });
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.caseSha256, packet.caseSha256);
  assert.deepEqual(await readdir(outputDir).then(items => items.sort()), ['L.html', 'P.html', 'build-manifest.json', 'evidence.json']);
  assert.deepEqual(JSON.parse(await readFile(join(outputDir, 'build-manifest.json'), 'utf8')), manifest);
  assert.deepEqual(manifest.files.map(file => file.path).sort(), ['L.html', 'P.html', 'evidence.json']);
  const downloaded = await readFile(join(outputDir, 'evidence.json'));
  assert.deepEqual(JSON.parse(downloaded.toString()), packet);
  assert.equal(manifest.packetSha256, sha(downloaded));
  assert.equal((manifest as unknown as Record<string, unknown>)['sourcePacketSha256'], sha(await readFile(packetPath)), 'Original input byte identity stays distinct from canonical emitted packet bytes');
  for (const file of manifest.files) {
    const bytes = await readFile(join(outputDir, file.path));
    assert.equal(file.sha256, sha(bytes), `${file.path} hash must match bytes, not just another manifest field`);
    assert.equal(file.bytes, bytes.length);
    assert.equal((await lstat(join(outputDir, file.path))).nlink, 1);
  }
  for (const condition of ['P', 'L']) {
    const html = await readFile(join(outputDir, `${condition}.html`), 'utf8');
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
    const embedded = scripts.find(item => /id=["']hci-evidence["']/.test(item[1]!));
    assert.ok(embedded, `${condition} embeds its validated packet`);
    assert.deepEqual(JSON.parse(embedded[2]!), packet);
    assert.equal(canonicalJson(JSON.parse(embedded[2]!)), canonicalJson(packet));
    assert.doesNotMatch(embedded[2]!, /[<>&\u2028\u2029]/, 'Packet script text must use safe HTML encoding');
    assert.match(html, /Content-Security-Policy/i);
    assert.match(html, /default-src (?:'|&#39;)none/);
    assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)=["']https?:/i, 'Study must be self contained');
  }
});

test('study output refuses replacement without modifying an existing evidence directory', async () => {
  const { packetPath, outputDir } = await setup();
  await mkdir(outputDir); await writeFile(join(outputDir, 'owner.txt'), 'retained');
  await assert.rejects(buildStudy({ packetPath, outputDir }));
  assert.deepEqual(await readdir(outputDir), ['owner.txt']);
  assert.equal(await readFile(join(outputDir, 'owner.txt'), 'utf8'), 'retained');
});

test('invalid packet identity is rejected before creating study output', async () => {
  const { packet, packetPath, outputDir } = await setup();
  await writeFile(packetPath, JSON.stringify({ ...packet, caseSha256: '0'.repeat(64) }));
  await assert.rejects(buildStudy({ packetPath, outputDir }));
  await assert.rejects(lstat(outputDir), { code: 'ENOENT' });
});

test('study input symbolic links are rejected rather than following a mutable alias', async () => {
  const { root, packetPath, outputDir } = await setup();
  const alias = join(root, 'packet-link.json'); await symlink(packetPath, alias);
  await assert.rejects(buildStudy({ packetPath: alias, outputDir }));
  await assert.rejects(lstat(outputDir), { code: 'ENOENT' });
});


test('study rejects duplicate packet and nested evidence members before any output exists', async () => {
  for (const duplicate of ['packet', 'nested', 'escaped']) {
    const { packet, packetPath, outputDir } = await setup();
    const source = JSON.stringify(packet);
    const ambiguous = duplicate === 'escaped'
      ? source.replace('"schemaVersion":1', String.raw`"schemaVersion":999,"\u0073chemaVersion":1`)
      : duplicate === 'packet'
      ? source.replace('"schemaVersion":1', '"schemaVersion":999,"schemaVersion":1')
      : source.replace('"assertionCount":1', '"assertionCount":0,"assertionCount":1');
    assert.notEqual(ambiguous, source, 'Negative control actually adds a duplicate member');
    assert.deepEqual(JSON.parse(ambiguous), packet, 'Ordinary JSON.parse would silently discard the contradictory earlier value');
    await writeFile(packetPath, ambiguous);
    await assert.rejects(buildStudy({ packetPath, outputDir }));
    await assert.rejects(lstat(outputDir), { code: 'ENOENT' });
  }
});

test('corrupt UTF-8 cannot hide in a discarded duplicate packet value', async () => {
  const { packet, packetPath, outputDir } = await setup();
  const source = JSON.stringify(packet);
  const corrupted = Buffer.concat([Buffer.from('{"schemaVersion":"'), Buffer.from([0xff]), Buffer.from('",'), Buffer.from(source.slice(1))]);
  assert.deepEqual(JSON.parse(corrupted.toString('utf8')), packet, 'A replacement decoder plus last-member-wins parser would accept this malformed source');
  await writeFile(packetPath, corrupted);
  await assert.rejects(buildStudy({ packetPath, outputDir }));
  await assert.rejects(lstat(outputDir), { code: 'ENOENT' });
});

test('study CLI reports input failures as structured input errors and exit 2', async () => {
  const { packetPath, outputDir } = await setup();
  await writeFile(packetPath, '{');
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/build-hci-study.ts', '--packet', packetPath, '--output', outputDir], { cwd: process.cwd(), encoding: 'utf8', timeout: 20_000 });
  assert.ifError(child.error);
  assert.equal(child.status, 2);
  assert.equal(child.stdout, '');
  const error = JSON.parse(child.stderr) as { category: string; code: string; message: string };
  assert.equal(error.category, 'input'); assert.equal(error.code, 'HCI_STUDY_INPUT');
  assert.ok(error.message.length > 0); assert.equal(child.stderr.includes(packetPath), false, 'Structured public error must not leak an absolute host path');
  await assert.rejects(lstat(outputDir), { code: 'ENOENT' });
});


const publicationFiles = [
  { path: 'P.html' as const, contents: '<!doctype html><title>P</title>' },
  { path: 'L.html' as const, contents: '<!doctype html><title>L</title>' },
  { path: 'evidence.json' as const, contents: '{"instrumentation":true}' },
  { path: 'build-manifest.json' as const, contents: '{"syntheticFaultTest":true}' },
];
function hasCause(value: unknown, expected: Error): boolean {
  return value === expected || value instanceof AggregateError && value.errors.some(item => hasCause(item, expected)) || value instanceof Error && value.cause !== undefined && hasCause(value.cause, expected);
}

test('failed staged write preserves its cause and publishes no partial study', async () => {
  const { root, outputDir } = await setup();
  const { publishStudyFiles } = await import('../scripts/build-hci-study.js');
  assert.equal(typeof publishStudyFiles, 'function', 'Build publishing must expose its bounded I/O boundary for deterministic fault verification');
  const sentinel = Object.assign(new Error('Explicit synthetic second-write failure'), { code: 'EIO' });
  let writes = 0;
  await assert.rejects(publishStudyFiles(outputDir, publicationFiles, async (path, contents) => {
    writes++;
    await assert.rejects(lstat(outputDir), { code: 'ENOENT' }, 'Final path is absent until every staged write succeeds');
    if (writes === 2) throw sentinel;
    await writeFile(path, contents, { flag: 'wx' });
  }), error => hasCause(error, sentinel));
  assert.equal(writes, 2, 'Fault actually occurred after one successful staged write');
  await assert.rejects(lstat(outputDir), { code: 'ENOENT' });
  assert.deepEqual(await readdir(root), ['packet.json'], 'Owned incomplete staging files are cleaned without publishing anything');
});

test('complete staged study becomes visible only after all four writes succeed', async () => {
  const { root, outputDir } = await setup();
  const { publishStudyFiles } = await import('../scripts/build-hci-study.js');
  assert.equal(typeof publishStudyFiles, 'function');
  let writes = 0;
  await publishStudyFiles(outputDir, publicationFiles, async (path, contents) => {
    await assert.rejects(lstat(outputDir), { code: 'ENOENT' });
    await writeFile(path, contents, { flag: 'wx' }); writes++;
  });
  assert.equal(writes, 4);
  assert.deepEqual((await readdir(outputDir)).sort(), publicationFiles.map(item => item.path).sort());
  for (const file of publicationFiles) assert.equal(await readFile(join(outputDir, file.path), 'utf8'), file.contents);
  assert.deepEqual((await readdir(root)).sort(), ['packet.json', 'study']);
});

test('a competing final directory remains untouched when publication loses its reservation', async () => {
  const { root, outputDir } = await setup();
  const { publishStudyFiles } = await import('../scripts/build-hci-study.js');
  assert.equal(typeof publishStudyFiles, 'function');
  let writes = 0;
  await assert.rejects(publishStudyFiles(outputDir, publicationFiles, async (path, contents) => {
    if (writes++ === 0) { await mkdir(outputDir); await writeFile(join(outputDir, 'owner.txt'), 'preserve competing owner'); }
    await writeFile(path, contents, { flag: 'wx' });
  }));
  assert.deepEqual(await readdir(outputDir), ['owner.txt']);
  assert.equal(await readFile(join(outputDir, 'owner.txt'), 'utf8'), 'preserve competing owner');
  assert.deepEqual((await readdir(root)).sort(), ['packet.json', 'study']);
});


for (const mode of ['read-double', 'read-close-only', 'write-double', 'write-close-only'] as const) test(`study retains primary and close truth under ${mode}`, async () => {
  const { root, packetPath, outputDir } = await setup();
  const script = `
    import filesystem from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    import { basename, resolve } from 'node:path';
    const options = ${JSON.stringify({ packetPath, outputDir })}; const mode = ${JSON.stringify(mode)};
    const open = filesystem.open; let operationFaulted = false; let closeFaulted = false;
    const fault = code => Object.assign(new Error('PRIVATE_TEST_FAULT_SENTINEL'), { code });
    filesystem.open = async (...args) => {
      const handle = await open(...args), path = String(args[0]);
      const targeted = mode.startsWith('read') ? resolve(path) === resolve(options.packetPath) : basename(path) === 'P.html' && path.includes('.hci-study-stage-');
      if (targeted) {
        const close = handle.close.bind(handle);
        handle.close = async () => { await close(); closeFaulted = true; throw fault('TEST_CLOSE_FAILURE'); };
        if (mode.endsWith('double')) {
          const method = mode.startsWith('read') ? 'read' : 'writeFile';
          handle[method] = async () => { operationFaulted = true; throw fault('TEST_PRIMARY_FAILURE'); };
        }
      }
      return handle;
    };
    syncBuiltinESMExports();
    const codes = (error, depth = 0) => depth > 8 || !error || typeof error !== 'object' ? [] : [error.code, ...codes(error.cause, depth + 1), ...(error instanceof AggregateError ? error.errors.flatMap(item => codes(item, depth + 1)) : [])].filter(value => typeof value === 'string');
    const { buildStudy } = await import('./scripts/build-hci-study.ts');
    try { await buildStudy(options); console.log(JSON.stringify({ succeeded: true, operationFaulted, closeFaulted })); }
    catch (error) { console.log(JSON.stringify({ succeeded: false, category: error.category, message: error.message, causeCodes: codes(error), operationFaulted, closeFaulted })); }
  `;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { cwd: process.cwd(), encoding: 'utf8', timeout: 20_000, maxBuffer: 65_536 });
  assert.ifError(child.error); assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(child.stdout) as { succeeded: boolean; category: string; message: string; causeCodes: string[]; operationFaulted: boolean; closeFaulted: boolean };
  assert.equal(report.succeeded, false); assert.equal(report.category, 'environment'); assert.equal(report.closeFaulted, true);
  assert.ok(report.causeCodes.includes('TEST_CLOSE_FAILURE'), 'The close failure must remain inspectable');
  assert.equal(report.operationFaulted, mode.endsWith('double'));
  if (mode.endsWith('double')) assert.ok(report.causeCodes.includes('TEST_PRIMARY_FAILURE'), 'A finally-close failure must not replace the primary failure');
  assert.equal(report.message.includes('PRIVATE_TEST_FAULT_SENTINEL'), false);
  assert.equal(report.message.includes(root), false);
  await assert.rejects(lstat(outputDir), { code: 'ENOENT' });
  assert.deepEqual(await readdir(root), ['packet.json'], 'Failed read/write and close leave no final or staged study');
});


test('compile failure keeps private diagnostics in its cause and emits only a sanitized environment CLI error', async () => {
  const { root, packetPath, outputDir } = await setup();
  const badSource = join(root, 'PRIVATE_COMPILE_SENTINEL.ts');
  await writeFile(badSource, 'const PRIVATE_COMPILE_SENTINEL = ;\n');
  const script = `
    import { registerHooks, createRequire } from 'node:module';
    import { pathToFileURL } from 'node:url';
    import { inspect } from 'node:util';
    const require = createRequire(import.meta.url);
    const esbuildUrl = pathToFileURL(require.resolve('esbuild')).href;
    const options = ${JSON.stringify({ packetPath, outputDir })};
    const badSource = ${JSON.stringify(badSource)};
    const facade = 'data:text/javascript,' + encodeURIComponent('import { build as original } from ' + JSON.stringify(esbuildUrl) + '; export function build(options) { return original({ ...options, entryPoints: [' + JSON.stringify(badSource) + '] }); }');
    registerHooks({ resolve(specifier, context, nextResolve) { return specifier === 'esbuild' && context.parentURL?.includes('/scripts/build-hci-study.') ? { url: facade, shortCircuit: true } : nextResolve(specifier, context); } });
    const { buildStudy, main } = await import('./scripts/build-hci-study.ts');
    let report;
    try { await buildStudy(options); report = { succeeded: true }; }
    catch (error) { report = { succeeded: false, category: error.category, causeHasMarker: inspect(error.cause, { depth: 8, getters: true }).includes('PRIVATE_COMPILE_SENTINEL'), publicHasMarker: error.message.includes('PRIVATE_COMPILE_SENTINEL') }; }
    const status = await main(['--packet', options.packetPath, '--output', options.outputDir]);
    console.log(JSON.stringify({ ...report, status })); process.exitCode = status;
  `;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { cwd: process.cwd(), encoding: 'utf8', timeout: 20_000, maxBuffer: 65_536 });
  assert.ifError(child.error); assert.equal(child.status, 1);
  assert.deepEqual(JSON.parse(child.stdout), { succeeded: false, category: 'environment', causeHasMarker: true, publicHasMarker: false, status: 1 });
  const diagnostic = JSON.parse(child.stderr) as { status: string; category: string; code: string; message: string };
  assert.equal(diagnostic.status, 'failed'); assert.equal(diagnostic.category, 'environment'); assert.ok(diagnostic.code.startsWith('HCI_STUDY_'));
  assert.equal(child.stderr.includes('PRIVATE_COMPILE_SENTINEL'), false); assert.equal(child.stderr.includes(root), false);
  await assert.rejects(lstat(outputDir), { code: 'ENOENT' });
  assert.deepEqual((await readdir(root)).sort(), ['PRIVATE_COMPILE_SENTINEL.ts', 'packet.json']);
});
