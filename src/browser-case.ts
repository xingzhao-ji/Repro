import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { ReproError, VERSION, type BrowserCaseAction, type BrowserCaseExpectation, type ManifestV3 } from './contracts.js';
import { canonicalJson, digest } from './manifest.js';

// Source execution binds this module; bundled execution binds the whole shipped
// executable. The adapter includes this identity alongside its own artifact.
export const BROWSER_CASE_ARTIFACT_DIGEST = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');

type Revision = 'buggy' | 'fixed';
export interface RegisteredBrowserCase {
  id: string;
  title: string;
  repository: string;
  issue: string;
  expectationUrls: string[];
  expectation: BrowserCaseExpectation;
  assertionDigest: string;
  contractDigest: string;
  actions: BrowserCaseAction[];
  ready: { selector: string; value: string };
  intendedFailures: string[][];
  revisions: Record<Revision, { commit: string; sourceDigest: string }>;
  wrapperDigest: string;
  assetPaths: string[];
}

const morphdomExpectation: BrowserCaseExpectation = {
  invariantId: 'MORPHDOM_TEXTAREA_LIVE_VALUE',
  description: 'Morphing an edited textarea to Hello World updates its live value after each input.',
  checks: [
    { selector: '#editor', property: 'value', expected: 'Hello World' },
    { selector: '#status', property: 'textContent', expected: 'rendered' },
  ],
};
const morphdomActions: BrowserCaseAction[] = [
  { id: 'navigate', kind: 'navigate', target: '/', value: '', dependsOn: [] },
  { id: 'first-edit', kind: 'fill', target: '#editor', value: 'first edit', dependsOn: ['navigate'] },
  { id: 'second-edit', kind: 'fill', target: '#editor', value: 'second edit', dependsOn: ['navigate'] },
];
const morphdomReady = { selector: '#status', value: 'ready' };
const morphdomFailures = [['first edit', 'rendered'], ['second edit', 'rendered']];
const morphdomRevisions = {
  buggy: { commit: '8221ace412be8dc1f519f2dc77393f0940134648', sourceDigest: '960acd3dbf500df2cd54341881f7b5a31c08ab4052b2608d7abb753a22a05011' },
  fixed: { commit: 'b72ddd5f21a759d235d70c92d3a37a990499c22f', sourceDigest: 'aa9404d21525b61fe6b79489b2ad32fd9bae565d705aaf8067a83bbfd3da3b7f' },
};
// Frozen descriptors contain public metadata only; upstream sources stay lazy.
const additionalCases: Record<string, Omit<RegisteredBrowserCase, 'assertionDigest' | 'contractDigest'>> = {
  "htmx-checkbox": {
    "id": "htmx-checkbox",
    "title": "htmx delegated click preserves native checkbox behavior",
    "repository": "https://github.com/bigskysoftware/htmx",
    "issue": "https://github.com/bigskysoftware/htmx/issues/2755",
    "expectationUrls": ["https://github.com/bigskysoftware/htmx/issues/2755"],
    "expectation": {
      "invariantId": "htmx-2755-native-checkbox-click",
      "description": "Clicking an unchecked checkbox checks it even when a form observes click events from body.",
      "checks": [
        {
          "selector": "#check",
          "property": "checked",
          "expected": "true"
        },
        {
          "selector": "#click-status",
          "property": "textContent",
          "expected": "clicked"
        }
      ]
    },
    "actions": [
      {
        "id": "open",
        "kind": "navigate",
        "target": "/",
        "value": "",
        "dependsOn": []
      },
      {
        "id": "check",
        "kind": "click",
        "target": "#check",
        "value": "",
        "dependsOn": [
          "open"
        ]
      }
    ],
    "ready": {
      "selector": "#status",
      "value": "ready"
    },
    "intendedFailures": [
      [
        "false",
        "clicked"
      ]
    ],
    "revisions": {
      "buggy": {
        "commit": "7388d0c0573b6d6bab43baa1f66fd7e59385bcea",
        "sourceDigest": "1e8bcfaf8ef91b5f5c96591b3a6262b74b8a736824c6c047332d4e131c9f365c"
      },
      "fixed": {
        "commit": "c9e2bea954efaf61d02b2f8639e31820e7632773",
        "sourceDigest": "5870bceb3f21e208fabff278b8d418147565caabc5fa198a91611e97e44e8621"
      }
    },
    "assetPaths": [
      "fixtures/repository-cases/htmx-checkbox/README.md",
      "fixtures/repository-cases/htmx-checkbox/buggy.js",
      "fixtures/repository-cases/htmx-checkbox/build.json",
      "fixtures/repository-cases/htmx-checkbox/fixed.js",
      "fixtures/repository-cases/htmx-checkbox/page.html",
      "fixtures/repository-cases/htmx-checkbox/provenance.json",
      "fixtures/repository-cases/htmx-checkbox/upstream/buggy/LICENSE",
      "fixtures/repository-cases/htmx-checkbox/upstream/buggy/README.md",
      "fixtures/repository-cases/htmx-checkbox/upstream/buggy/package.json",
      "fixtures/repository-cases/htmx-checkbox/upstream/buggy/src/htmx.js",
      "fixtures/repository-cases/htmx-checkbox/upstream/fixed/LICENSE",
      "fixtures/repository-cases/htmx-checkbox/upstream/fixed/README.md",
      "fixtures/repository-cases/htmx-checkbox/upstream/fixed/package.json",
      "fixtures/repository-cases/htmx-checkbox/upstream/fixed/src/htmx.js"
    ],
    "wrapperDigest": "31f0693754f5dabaf8e7fa301e617a9df6bbc32f34608853c5aecd8cb2d1d6a9"
  },
  "marked-empty-heading": {
    "id": "marked-empty-heading",
    "title": "Marked empty ATX heading interrupts a paragraph",
    "repository": "https://github.com/markedjs/marked",
    "issue": "https://github.com/markedjs/marked/issues/3048",
    "expectationUrls": ["https://spec.commonmark.org/0.30/#atx-headings"],
    "expectation": {
      "invariantId": "marked-3048-empty-atx-heading",
      "description": "An empty four-hash ATX heading interrupts surrounding paragraphs and renders as an empty h4.",
      "checks": [
        {
          "selector": "#result",
          "property": "innerHTML",
          "expected": "<p>Hashtags test</p>\n<h4></h4>\n<p>End of test</p>\n"
        },
        {
          "selector": "#render-status",
          "property": "textContent",
          "expected": "rendered"
        }
      ]
    },
    "actions": [
      {
        "id": "open",
        "kind": "navigate",
        "target": "/",
        "value": "",
        "dependsOn": []
      },
      {
        "id": "enter-markdown",
        "kind": "fill",
        "target": "#markdown",
        "value": "Hashtags test\n####\nEnd of test",
        "dependsOn": [
          "open"
        ]
      },
      {
        "id": "render",
        "kind": "click",
        "target": "#render",
        "value": "",
        "dependsOn": [
          "open",
          "enter-markdown"
        ]
      }
    ],
    "ready": {
      "selector": "#status",
      "value": "ready"
    },
    "intendedFailures": [
      [
        "<p>Hashtags test\n####\nEnd of test</p>\n",
        "rendered"
      ]
    ],
    "revisions": {
      "buggy": {
        "commit": "39cee771b659ea0eba49bd69dba10817403550d6",
        "sourceDigest": "193fcfd78cac1f95ac35e22608799fb9a727b7479e9c00b51fc67b2fe3d9c66c"
      },
      "fixed": {
        "commit": "a1034e6dd1ddbc2f723627f271bba29486005c1a",
        "sourceDigest": "ccac5cd37a1a779c2cf7923794000658783de203e7a353ac0d477f7ad7e42299"
      }
    },
    "assetPaths": [
      "fixtures/repository-cases/marked-empty-heading/README.md",
      "fixtures/repository-cases/marked-empty-heading/buggy.js",
      "fixtures/repository-cases/marked-empty-heading/build.json",
      "fixtures/repository-cases/marked-empty-heading/fixed.js",
      "fixtures/repository-cases/marked-empty-heading/page.html",
      "fixtures/repository-cases/marked-empty-heading/provenance.json",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/LICENSE.md",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/README.md",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/package-lock.json",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/package.json",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/rollup.config.js",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/src/Hooks.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/src/Instance.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/src/Lexer.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/src/MarkedOptions.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/src/Parser.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/src/Renderer.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/src/TextRenderer.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/src/Tokenizer.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/src/Tokens.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/src/defaults.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/src/helpers.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/src/marked.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/src/rules.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/buggy/tsconfig.json",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/LICENSE.md",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/README.md",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/package-lock.json",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/package.json",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/rollup.config.js",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/src/Hooks.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/src/Instance.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/src/Lexer.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/src/MarkedOptions.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/src/Parser.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/src/Renderer.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/src/TextRenderer.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/src/Tokenizer.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/src/Tokens.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/src/defaults.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/src/helpers.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/src/marked.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/src/rules.ts",
      "fixtures/repository-cases/marked-empty-heading/upstream/fixed/tsconfig.json"
    ],
    "wrapperDigest": "c72624a9ebf9b812b8d58c71accd9077fc360058a2c53f1b201c9ef117b7a06a"
  }
};

// Metadata is embedded in the trusted runner. No application files are read or
// evaluated at module load: an exported capsule needs only its selected case.
const registry: Record<string, Omit<RegisteredBrowserCase, 'assertionDigest' | 'contractDigest'>> = {
  ...additionalCases,
  'morphdom-textarea': {
    id: 'morphdom-textarea', title: 'Morphdom: edited textarea keeps its stale live value',
    repository: 'https://github.com/patrick-steele-idem/morphdom',
    issue: 'https://github.com/patrick-steele-idem/morphdom/issues/19',
    expectationUrls: ['https://github.com/patrick-steele-idem/morphdom/issues/19'],
    expectation: morphdomExpectation, actions: morphdomActions, ready: morphdomReady,
    intendedFailures: morphdomFailures, revisions: morphdomRevisions,
    wrapperDigest: 'd764f523c83b85d9d880087130404235afa25f6d7e1a98f909bcf0ab78692807',
    assetPaths: ['buggy.js', 'fixed.js', 'page.html', 'provenance.json', 'README.md',
      'upstream/buggy/lib/index.js', 'upstream/buggy/README.md', 'upstream/buggy/package.json',
      'upstream/fixed/lib/index.js', 'upstream/fixed/README.md', 'upstream/fixed/package.json',
    ].map(name => `fixtures/repository-cases/morphdom-textarea/${name}`),
  },
};

export function getRegisteredCase(caseId: string): RegisteredBrowserCase {
  if (typeof caseId !== 'string' || !Object.hasOwn(registry, caseId)) {
    throw new ReproError('unsupported', 'CASE_UNAVAILABLE', 'This public repository case is not registered. Choose an installed case.');
  }
  const registered = registry[caseId]!;
  const assertion = { expectation: registered.expectation, ready: registered.ready, intendedFailures: registered.intendedFailures };
  const contract = { id: registered.id, repository: registered.repository, issue: registered.issue, expectationUrls: registered.expectationUrls, assertion, actions: registered.actions, revisions: registered.revisions };
  return structuredClone({ ...registered, assertionDigest: digest(assertion), contractDigest: digest(contract) });
}

export function listRegisteredCases(): RegisteredBrowserCase[] {
  return Object.keys(registry).map(getRegisteredCase);
}

function invalid(code: string, message: string): never { throw new ReproError('input', code, message); }
function fields(value: unknown, expected: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('CASE_SCHEMA', 'Expected a registered browser-case object.');
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== expected.length || Object.keys(object).some(key => !expected.includes(key))) {
    invalid('CASE_FIELDS', 'Browser-case input contains missing or unapproved fields. Remove undeclared input and retry.');
  }
  return object;
}
function equal(actual: unknown, expected: unknown, code = 'CASE_CONTRACT'): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new ReproError('verification', code, 'Browser-case input differs from its frozen registered contract. Start a new capture using the installed case.');
  }
}
function integer(value: unknown, minimum: number, maximum: number): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) invalid('CASE_LIMIT', 'A browser-case number is outside the supported bounds.');
}
function revision(value: unknown): asserts value is Revision {
  if (value !== 'buggy' && value !== 'fixed') throw new ReproError('unsupported', 'CASE_REVISION', 'Choose the registered buggy or fixed revision.');
}

/** Data validation only; importing a manifest never evaluates upstream code. */
export function validateCaseManifest(input: unknown): ManifestV3 {
  const encoded = canonicalJson(input);
  if (Buffer.byteLength(encoded) > 65_536) invalid('MANIFEST_SIZE', 'Manifest exceeds 64 KiB.');
  const value: unknown = JSON.parse(encoded);
  const manifest = fields(value, ['schemaVersion', 'id', 'caseId', 'classification', 'adapter', 'runnerVersion', 'expectation', 'assertionDigest', 'expectationBasis', 'humanApproval', 'expectationSource', 'actions', 'responses', 'environment', 'boundary', 'app']);
  equal(manifest['schemaVersion'], 3);
  if (typeof manifest['caseId'] !== 'string') invalid('CASE_ID', 'Choose a registered browser case.');
  const registered = getRegisteredCase(manifest['caseId']);
  equal(manifest['id'], registered.id);
  equal(manifest['classification'], 'public-repository-development-case');
  equal(manifest['adapter'], { id: 'registered-browser-v1', version: VERSION });
  equal(manifest['runnerVersion'], VERSION);
  equal(manifest['expectation'], registered.expectation, 'EXPECTATION_CHANGED');
  equal(manifest['assertionDigest'], registered.assertionDigest, 'ORACLE_CHANGED');
  if (manifest['expectationBasis'] !== 'independent-contract' && manifest['expectationBasis'] !== 'proposed-unconfirmed') invalid('EXPECTATION_BASIS', 'Choose an independent contract or a provisional expectation.');
  equal(manifest['humanApproval'], 'not-claimed');
  equal(manifest['expectationSource'], { kind: 'public-issue', url: registered.issue, contractUrls: registered.expectationUrls, contractDigest: registered.contractDigest });
  equal(manifest['responses'], []);
  equal(manifest['boundary'], { behavior: 'frontend', network: 'local-assets-only', database: 'none', externalDependencies: [] });
  const app = fields(manifest['app'], ['revision', 'sourceDigest', 'repository', 'commit']);
  revision(app['revision']);
  equal(app, { revision: app['revision'], repository: registered.repository, ...registered.revisions[app['revision']] }, 'CASE_SOURCE_IDENTITY');

  const actions = manifest['actions'];
  if (!Array.isArray(actions) || actions.length > 256) invalid('ACTION_LIMIT', 'A browser case supports at most 256 registered actions.');
  let previous = -1;
  const completed = new Set<string>();
  for (const entry of actions) {
    const action = fields(entry, ['id', 'kind', 'target', 'value', 'dependsOn']);
    const index = registered.actions.findIndex(candidate => candidate.id === action['id']);
    if (index <= previous || index < 0) invalid('ACTION_ORDER', 'Actions must be a unique ordered subset of the registered capture.');
    const template = registered.actions[index]!;
    equal(action, template, 'ACTION_CHANGED');
    if (template.dependsOn.some(id => !completed.has(id))) invalid('ACTION_DEPENDENCY', 'Retained actions require their earlier registered prerequisites.');
    completed.add(template.id); previous = index;
  }

  const environment = fields(manifest['environment'], ['browser', 'viewport', 'locale', 'timezoneId', 'clock', 'seed', 'platform', 'timeoutMs']);
  equal(environment['browser'], 'chromium'); equal(environment['locale'], 'en-US');
  equal(environment['timezoneId'], 'UTC'); equal(environment['platform'], 'linux-container');
  const viewport = fields(environment['viewport'], ['width', 'height']);
  integer(viewport['width'], 64, 4096); integer(viewport['height'], 64, 4096);
  integer(environment['seed'], 0, 0xffff_ffff); integer(environment['timeoutMs'], 100, 60_000);
  const clock = environment['clock'];
  if (typeof clock !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(clock) || !Number.isFinite(Date.parse(clock)) || new Date(clock).toISOString() !== clock) {
    invalid('CLOCK_UNSUPPORTED', 'The clock must be a valid explicit UTC ISO timestamp.');
  }
  return value as ManifestV3;
}

export function createCaseManifest(caseId: string, expectation?: BrowserCaseExpectation): ManifestV3 {
  const registered = getRegisteredCase(caseId);
  return validateCaseManifest({
    schemaVersion: 3, id: registered.id, caseId: registered.id, classification: 'public-repository-development-case',
    adapter: { id: 'registered-browser-v1', version: VERSION }, runnerVersion: VERSION,
    expectation: expectation ?? registered.expectation, assertionDigest: registered.assertionDigest,
    expectationBasis: 'independent-contract', humanApproval: 'not-claimed',
    expectationSource: { kind: 'public-issue', url: registered.issue, contractUrls: registered.expectationUrls, contractDigest: registered.contractDigest },
    actions: registered.actions, responses: [],
    environment: { browser: 'chromium', viewport: { width: 1280, height: 720 }, locale: 'en-US', timezoneId: 'UTC', clock: '2026-01-01T00:00:00.000Z', seed: 1729, platform: 'linux-container', timeoutMs: 10_000 },
    boundary: { behavior: 'frontend', network: 'local-assets-only', database: 'none', externalDependencies: [] },
    app: { revision: 'buggy', sourceDigest: registered.revisions.buggy.sourceDigest, repository: registered.repository, commit: registered.revisions.buggy.commit },
  });
}

export function caseExpectationEstablished(manifest: ManifestV3): boolean {
  return validateCaseManifest(manifest).expectationBasis === 'independent-contract';
}

/** Runs in the trusted Node harness, never in the upstream application's page. */
export function evaluateCaseObservation(manifest: ManifestV3, input: unknown): 'target-failure' | 'requirement-satisfied' {
  const validated = validateCaseManifest(manifest);
  if (!caseExpectationEstablished(validated)) throw new ReproError('verification', 'PROVISIONAL_EXPECTATION', 'The expectation remains provisional; establish its independent contract before claiming a behavioral verdict.');
  const registered = getRegisteredCase(validated.caseId);
  const observation = fields(input, ['kind', 'values']);
  if (observation['kind'] !== 'browser-case' || !Array.isArray(observation['values']) || observation['values'].length !== registered.expectation.checks.length || observation['values'].some(value => typeof value !== 'string' || value.length > 8192)) {
    throw new ReproError('verification', 'CASE_OBSERVATION', 'The complete declared browser observation is unavailable. Check readiness and retry from fresh state.');
  }
  const values = canonicalJson(observation['values']);
  if (values === canonicalJson(registered.expectation.checks.map(check => check.expected))) return 'requirement-satisfied';
  if (registered.intendedFailures.some(failure => values === canonicalJson(failure))) return 'target-failure';
  throw new ReproError('verification', 'WRONG_FAILURE', 'The observed values do not establish the registered target failure or expected behavior. Inspect setup and readiness before retrying.');
}

function sourceAsset(path: string, expectedDigest: string): Buffer {
  try {
    const url = new URL(`../${path}`, import.meta.url);
    const before = lstatSync(url);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 2 * 1024 * 1024) throw new ReproError('verification', 'CASE_SOURCE_FILE', 'The registered case needs bounded regular source files without links.');
    const descriptor = openSync(url, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const after = fstatSync(descriptor);
      if (!after.isFile() || after.nlink !== 1 || after.size > 2 * 1024 * 1024 || before.ino !== after.ino || before.dev !== after.dev) throw new ReproError('verification', 'CASE_SOURCE_FILE', 'The registered case source changed during its safe read.');
      const bytes = readFileSync(descriptor);
      if (bytes.length > 2 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== expectedDigest) throw new ReproError('verification', 'CASE_SOURCE_CHANGED', 'Registered application or wrapper bytes differ from their pinned identity. Restore the installed case files before replay.');
      return bytes;
    } finally { closeSync(descriptor); }
  } catch (cause) {
    if (cause instanceof ReproError) throw cause;
    throw new ReproError('environment', 'CASE_SOURCE_UNAVAILABLE', 'A registered case asset is unavailable. Reinstall the complete Repro package or restore the exported case files before replay.', { cause });
  }
}

export function caseRevisionDigest(manifest: ManifestV3, selected: Revision): string {
  const validated = validateCaseManifest(manifest); revision(selected);
  return getRegisteredCase(validated.caseId).revisions[selected].sourceDigest;
}

export function caseSource(manifest: ManifestV3, selected: Revision): Map<string, Buffer> {
  const validated = validateCaseManifest(manifest); revision(selected);
  const registered = getRegisteredCase(validated.caseId);
  const root = `fixtures/repository-cases/${registered.id}`;
  return new Map([
    ['/', sourceAsset(`${root}/page.html`, registered.wrapperDigest)],
    ['/app.js', sourceAsset(`${root}/${selected}.js`, registered.revisions[selected].sourceDigest)],
  ]);
}
