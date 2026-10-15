import { mkdir, writeFile, appendFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runBrowser } from '../src/adapter.js';
import { createManifest, digest } from '../src/manifest.js';
import { fixtureDigest } from '../src/fixture.js';
import { ASSERTION_DIGEST } from '../src/oracle.js';
import type { RunResult } from '../src/contracts.js';

export async function runSyntheticBenchmark(root = join('.repro-runs', 'benchmark', randomUUID()), signal?: AbortSignal) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const manifest = createManifest();
  const expected = { manifestDigest: digest(manifest), assertionDigest: ASSERTION_DIGEST, appDigests: { buggy: fixtureDigest('buggy'), fixed: fixtureDigest('fixed') }, repetitionsPerRevision: 20 };
  const metadata = { classification: 'synthetic-training-fixture', historicalBugs: 0, startedAt: new Date().toISOString(), runner: fileURLToPath(import.meta.url).endsWith('.ts') ? 'TypeScript source module' : 'JavaScript module', node: process.version, host: `${process.platform}-${process.arch}`, channel: process.env['REPRO_BROWSER_CHANNEL'] ?? 'pinned Chromium', expected };
  await writeFile(join(root, 'specification.json'), JSON.stringify({ ...metadata, manifest }, null, 2) + '\n', { mode: 0o600 });
  const runs: { repetition: number; revision: 'buggy' | 'fixed'; expectedOutcome: string; matchesExpected: boolean; observationDigest: string; run: RunResult }[] = [];
  let harness: string | undefined;
  for (let repetition = 1; repetition <= 20; repetition++) {
    for (const revision of ['buggy', 'fixed'] as const) {
      if (signal?.aborted) break;
      const run = await runBrowser(manifest, { artifactDir: root, revision, ...(signal ? { signal } : {}) });
      harness ??= run.harnessDigest;
      const expectedOutcome = revision === 'buggy' ? 'target-failure' : 'requirement-satisfied';
      const matchesExpected = run.outcome === expectedOutcome && run.assertionCount === 1 && run.manifestDigest === expected.manifestDigest && run.assertionDigest === expected.assertionDigest && run.harnessDigest === harness && run.appDigest === expected.appDigests[revision] && run.seed === manifest.environment.seed;
      const row = { repetition, revision, expectedOutcome, matchesExpected, observationDigest: digest(run.observation), run };
      runs.push(row);
      // Preserve every completed attempt even if a later run or process fails.
      await appendFile(join(root, 'runs.ndjson'), JSON.stringify(row) + '\n', { mode: 0o600 });
    }
    if (signal?.aborted) break;
  }
  const report = {
    ...metadata, endedAt: new Date().toISOString(), root: resolve(root),
    status: signal?.aborted ? 'cancelled' : runs.length === 40 && runs.every(row => row.matchesExpected) ? 'pass' : 'inconclusive',
    counts: { planned: 40, executed: runs.length, matchedExpected: runs.filter(row => row.matchesExpected).length, unexpected: runs.filter(row => !row.matchesExpected).length, skipped: 0, unrun: 40 - runs.length },
    claims: 'Twenty repetitions per registered synthetic revision under identical declared input; no historical-bug coverage, universal determinism, or Linux portability claim.',
    runs,
  };
  await writeFile(join(root, 'summary.partial.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  await rename(join(root, 'summary.partial.json'), join(root, 'summary.json'));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const report = await runSyntheticBenchmark(undefined, controller.signal);
    console.log(JSON.stringify({ status: report.status, counts: report.counts, report: join(report.root, 'summary.json') }, null, 2));
    process.exitCode = report.status === 'pass' ? 0 : report.status === 'cancelled' ? 130 : 2;
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
