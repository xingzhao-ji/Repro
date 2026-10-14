import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, rename, rm, rmdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/manifest.js';
import { ReproError } from '../src/contracts.js';
import { HciCaseError, parseCaseJson, validatePacket } from './hci-case.js';

export interface BuildStudyOptions { packetPath: string; outputDir: string }
export interface StudyBuildManifest {
  schemaVersion: 1; caseSha256: string; sourcePacketSha256: string; packetSha256: string;
  files: { path: 'P.html' | 'L.html' | 'evidence.json'; sha256: string; bytes: number }[];
}
const LIMIT = 4 * 1024 * 1024;
function fail(message: string): never { throw new HciCaseError(message, 'HCI_STUDY_INPUT'); }
function diagnostic(cause: unknown): HciCaseError {
  if (cause instanceof HciCaseError) return cause;
  if (cause instanceof ReproError && ['input', 'unsupported', 'verification'].includes(cause.category)) {
    return new HciCaseError('Study packet is invalid or unsupported.', 'HCI_STUDY_INPUT', 'input', { cause });
  }
  return new HciCaseError('Study build failed; no completed build is claimed.', 'HCI_STUDY_ENVIRONMENT', 'environment', { cause });
}
async function withStudyFile<T>(file: { close(): Promise<void> }, work: () => Promise<T>): Promise<T> {
  let value: T | undefined;
  let primary: HciCaseError | null = null;
  try { value = await work(); } catch (cause) { primary = diagnostic(cause); }
  try { await file.close(); }
  catch (cause) {
    if (primary) throw new HciCaseError(primary.message, primary.code, primary.category, { cause: new AggregateError([primary, cause]) });
    throw new HciCaseError('The study file could not be closed; no completed build is claimed.', 'HCI_STUDY_CLOSE', 'environment', { cause });
  }
  if (primary) throw primary;
  return value as T;
}
const missing = (cause: unknown) => (cause as NodeJS.ErrnoException)?.code === 'ENOENT';
async function requireAbsent(path: string): Promise<void> {
  try { await lstat(path); fail('Study output already exists; it will not be replaced.'); }
  catch (cause) { if (!missing(cause)) throw cause; }
}
function within(boundary: string, target: string): boolean {
  const path = relative(boundary, target);
  return Boolean(path) && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}
async function directories(target: string, create: boolean): Promise<void> {
  let path = process.cwd();
  for (const part of relative(path, target).split(sep)) {
    if (!part) continue;
    path = join(path, part);
    let stat;
    try { stat = await lstat(path); }
    catch (cause) {
      if (!create || (cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
      await mkdir(path); stat = await lstat(path);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Study paths cannot traverse symbolic links or non-directories.');
  }
}
async function readPacket(path: string): Promise<{ value: unknown; sourcePacketSha256: string }> {
  if (!within(resolve('.repro-runs'), path)) fail('Study input must be an owned packet under .repro-runs.');
  await directories(dirname(path), false);
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > LIMIT) fail('Study packet must be a bounded regular single-link file.');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  return withStudyFile(file, async () => {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > LIMIT || stat.ino !== before.ino || stat.dev !== before.dev) fail('Study packet changed or is not a bounded regular file.');
    const buffer = Buffer.alloc(LIMIT + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = await file.read(buffer, length, buffer.length - length, null);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > LIMIT) fail('Study packet exceeds its size limit.');
    const bytes = buffer.subarray(0, length);
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (cause) { throw new HciCaseError('Study packet is not valid UTF-8.', 'HCI_STUDY_INPUT', 'input', { cause }); }
    try { return { value: parseCaseJson(text, LIMIT), sourcePacketSha256: sha(bytes) }; }
    catch (cause) {
      if (cause instanceof HciCaseError && cause.category === 'input') throw new HciCaseError('Study packet is not valid unambiguous JSON.', 'HCI_STUDY_INPUT', 'input', { cause });
      throw cause;
    }
  });
}
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const cspHash = (value: string) => `'sha256-${createHash('sha256').update(value).digest('base64')}'`;
function safeEmbeddedJson(value: string): string {
  const escapes: Record<string, string> = { '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' };
  return value.replace(/[<>&\u2028\u2029]/g, character => escapes[character]!);
}
function html(condition: 'P' | 'L', packet: string, script: string, css: string): string {
  const policy = `default-src 'none'; script-src ${cspHash(script)}; style-src ${cspHash(css)}; connect-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>Repro frozen evidence · ${condition}</title><style>${css}</style></head><body><div id="root" data-condition="${condition}"></div><script id="hci-evidence" type="application/json">${safeEmbeddedJson(packet)}</script><script>${script}</script></body></html>\n`;
}

export interface StudyOutputFile { path: 'P.html' | 'L.html' | 'evidence.json' | 'build-manifest.json'; contents: string }
async function writeStagedFile(path: string, contents: string): Promise<void> {
  const file = await open(path, 'wx', 0o600);
  await withStudyFile(file, async () => { await file.writeFile(contents); await file.sync(); });
}
/** Complete a private stage before an exclusive empty-directory reservation and
 * atomic rename. The local workspace is trusted against hostile concurrent
 * ancestor replacement. Existing destinations are never adopted or removed. */
export async function publishStudyFiles(output: string, files: readonly StudyOutputFile[], write: (path: string, contents: string) => Promise<void> = writeStagedFile): Promise<void> {
  const outputDir = resolve(output);
  if (!within(resolve('.repro-runs/hci-comparator'), outputDir)) fail('Study output must be a new directory under .repro-runs/hci-comparator.');
  const names = ['P.html', 'L.html', 'evidence.json', 'build-manifest.json'];
  if (files.length !== 4 || new Set(files.map(file => file.path)).size !== 4 || files.some(file => !names.includes(file.path) || Buffer.byteLength(file.contents) > 16 * 1024 * 1024)) fail('A complete bounded four-file study is required for publication.');
  await requireAbsent(outputDir);
  await directories(dirname(outputDir), true);
  const stage = await mkdtemp(join(dirname(outputDir), '.hci-study-stage-'));
  let stagedIdentity: { dev: number; ino: number } | null = null;
  let reserved: { dev: number; ino: number } | null = null;
  let reservationCreated = false;
  try {
    stagedIdentity = await lstat(stage);
    for (const file of files) await write(join(stage, file.path), file.contents);
    try { await mkdir(outputDir, { mode: 0o700 }); }
    catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'EEXIST') throw new HciCaseError('Study output already exists; it will not be replaced.', 'HCI_STUDY_INPUT', 'input', { cause });
      throw cause;
    }
    reservationCreated = true;
    reserved = await lstat(outputDir);
    await rename(stage, outputDir);
  } catch (cause) {
    const cleanup: unknown[] = [];
    if (reservationCreated) {
      try {
        const current = await lstat(outputDir);
        if (!reserved || current.dev !== reserved.dev || current.ino !== reserved.ino || !current.isDirectory() || current.isSymbolicLink()) throw new Error('Output reservation identity could not be confirmed.', { cause });
        // Never recursively remove this reservation: unexpected contents remain intact.
        await rmdir(outputDir);
      } catch (error) { if (!missing(error)) cleanup.push(error); }
    }
    try {
      const current = await lstat(stage);
      if (!stagedIdentity || current.dev !== stagedIdentity.dev || current.ino !== stagedIdentity.ino || !current.isDirectory() || current.isSymbolicLink()) throw new Error('Study staging identity could not be confirmed.', { cause });
      await rm(stage, { recursive: true });
    } catch (error) { if (!missing(error)) cleanup.push(error); }
    if (cleanup.length) throw new HciCaseError('Study publication failed and owned cleanup is incomplete; inspect the owned output before retrying.', 'HCI_STUDY_CLEANUP', 'environment', { cause: new AggregateError([cause, ...cleanup]) });
    if (cause instanceof HciCaseError) throw cause;
    throw new HciCaseError('Study publication failed; no completed build is claimed.', 'HCI_STUDY_PUBLISH', 'environment', { cause });
  }
}

/** Validate before creating output. The packet is the only evidence input;
 * no retained database, application, browser, server, or runner is opened. */
async function prepareStudy(options: BuildStudyOptions): Promise<StudyBuildManifest> {
  const packetPath = resolve(options.packetPath), outputDir = resolve(options.outputDir);
  if (!within(resolve('.repro-runs/hci-comparator'), outputDir)) fail('Study output must be a new directory under .repro-runs/hci-comparator.');
  await requireAbsent(outputDir);
  const source = await readPacket(packetPath);
  const packet = validatePacket(source.value);
  const encoded = canonicalJson(packet);
  const bundled = await build({
    absWorkingDir: resolve(fileURLToPath(new URL('..', import.meta.url))),
    entryPoints: ['web/hci-report.tsx'], outfile: 'study.js', bundle: true, write: false,
    platform: 'browser', target: 'es2022', format: 'iife', minify: true, legalComments: 'none', logLevel: 'silent',
    define: { __HCI_STUDY__: 'true', 'process.env.NODE_ENV': '"production"' },
  });
  const js = bundled.outputFiles.find(file => file.path.endsWith('.js'))?.text;
  const css = bundled.outputFiles.find(file => file.path.endsWith('.css'))?.text;
  if (!js || !css) throw new HciCaseError('Study bundle did not produce its script and stylesheet.', 'HCI_STUDY_BUNDLE', 'environment');
  const script = js.replace(/<\/script/gi, '<\\/script');
  const documents = [
    { path: 'P.html' as const, contents: html('P', encoded, script, css) },
    { path: 'L.html' as const, contents: html('L', encoded, script, css) },
    { path: 'evidence.json' as const, contents: encoded },
  ];
  const manifest: StudyBuildManifest = { schemaVersion: 1, caseSha256: packet.caseSha256, sourcePacketSha256: source.sourcePacketSha256, packetSha256: sha(encoded), files: documents.map(file => ({ path: file.path, sha256: sha(file.contents), bytes: Buffer.byteLength(file.contents) })) };
  await publishStudyFiles(outputDir, [...documents, { path: 'build-manifest.json', contents: `${JSON.stringify(manifest, null, 2)}\n` }]);
  return manifest;
}
export async function buildStudy(options: BuildStudyOptions): Promise<StudyBuildManifest> {
  try { return await prepareStudy(options); } catch (cause) { throw diagnostic(cause); }
}

export async function main(args: string[]): Promise<number> {
  try {
    if (args.length !== 4 || args[0] !== '--packet' || args[2] !== '--output' || !args[1] || !args[3]) fail('Required arguments: --packet .repro-runs/.../case.json --output .repro-runs/hci-comparator/new-build.');
    const result = await buildStudy({ packetPath: args[1]!, outputDir: args[3]! });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (cause) {
    const error = diagnostic(cause);
    process.stderr.write(`${JSON.stringify({ status: 'failed', category: error.category, code: error.code, message: error.message })}\n`);
    return error.category === 'input' ? 2 : 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
