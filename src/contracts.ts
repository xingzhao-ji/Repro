import type { AppActionKind, AppTarget, CheckProperty, Comparison, TargetReference } from './steps.js';
export const VERSION = '0.2.2';
export const ADAPTER = 'synthetic-search-v1';
export type Outcome = 'target-failure' | 'requirement-satisfied' | 'inconclusive' | 'cancelled';
export type ErrorCategory = 'input' | 'unsupported' | 'environment' | 'harness' | 'target-failure' | 'cancelled' | 'verification';
export class ReproError extends Error {
  constructor(public category: ErrorCategory, public code: string, message: string, options?: ErrorOptions) {
    super(message, options); this.name = 'ReproError';
  }
}
export interface Action {
  id: string;
  kind: 'navigate' | 'search' | 'noise';
  value: string;
  dependsOn: string[];
}
export interface ExpectationV1 {
  invariantId: 'LATEST_SEARCH_RESPONSE_WINS';
  description: string;
  latestRequestId: 2;
  latestQuery: 'beta';
  expectedResults: ['Beta synthetic result'];
}
export interface ManifestV1 {
  schemaVersion: 1;
  id: string;
  classification: 'synthetic-training-fixture';
  adapter: { id: typeof ADAPTER; version: string };
  runnerVersion: string;
  expectation: ExpectationV1;
  assertionDigest: string;
  expectationBasis: 'supplied-synthetic-specification' | 'proposed-unconfirmed';
  humanApproval: 'not-claimed';
  actions: Action[];
  responses: { requestId: number; results: string[] }[];
  environment: {
    browser: 'chromium'; viewport: { width: number; height: number };
    locale: 'en-US'; timezoneId: 'UTC'; clock: string; seed: number;
    platform: 'linux-container'; timeoutMs: number;
  };
  boundary: { behavior: 'frontend'; network: 'controlled-http'; database: 'none'; externalDependencies: string[] };
  app: { revision: 'buggy' | 'fixed'; sourceDigest: string };
}
export type SearchQuery = 'alpha' | 'beta';
export type SearchOrder = ['alpha', 'beta'] | ['beta', 'alpha'];
export interface Expectation {
  invariantId: 'LATEST_SEARCH_RESPONSE_WINS';
  description: string;
  latestRequestId: 2;
  latestQuery: SearchQuery;
  expectedResults: [string];
}
export interface ManifestV2 extends Omit<ManifestV1, 'schemaVersion' | 'expectation' | 'expectationBasis'> {
  schemaVersion: 2;
  scenario: { searchOrder: SearchOrder };
  expectation: Expectation;
  expectationBasis: 'independent-contract' | 'proposed-unconfirmed';
  expectationSource: { kind: 'caller-supplied'; contractId: 'registered-search-latest-response-v1'; contractDigest: string };
}
export type SyntheticManifest = ManifestV1 | ManifestV2;
export interface BrowserCaseAction {
  id: string;
  kind: 'navigate' | 'click' | 'fill' | 'focus';
  target: string;
  value: string;
  dependsOn: string[];
}
export interface BrowserCaseExpectation {
  invariantId: string;
  description: string;
  checks: { selector: string; property: 'value' | 'textContent' | 'checked' | 'innerHTML'; expected: string }[];
}
export interface BrowserCaseObservation { kind: 'browser-case'; values: string[] }
export interface ManifestV3 {
  schemaVersion: 3;
  id: string;
  caseId: string;
  classification: 'public-repository-development-case';
  adapter: { id: 'registered-browser-v1'; version: string };
  runnerVersion: string;
  expectation: BrowserCaseExpectation;
  assertionDigest: string;
  expectationBasis: 'independent-contract' | 'proposed-unconfirmed';
  humanApproval: 'not-claimed';
  expectationSource: { kind: 'public-issue'; url: string; contractUrls: string[]; contractDigest: string };
  actions: BrowserCaseAction[];
  responses: [];
  environment: ManifestV1['environment'];
  boundary: { behavior: 'frontend'; network: 'local-assets-only'; database: 'none'; externalDependencies: [] };
  app: { revision: 'buggy' | 'fixed'; sourceDigest: string; repository: string; commit: string };
}
export interface AppAction {
  id: string; kind: AppActionKind; target: AppTarget | null; reference: TargetReference | null;
  /** Empty when the typed value is withheld; then secret names the environment variable that supplies it. */
  value: string; secret: string | null; text: string; dependsOn: string[];
}
export interface AppCheck { target: AppTarget | null; reference: TargetReference | null; property: CheckProperty; comparison: Comparison; expected: string; text: string }
export interface AppObservation {
  kind: 'local-app'; values: (string | null)[]; url: string;
  /** Sanitized, bounded diagnostics recorded during the run; never part of the verdict except page-error checks. */
  pageErrors: string[]; console: string[]; failedRequests: string[]; blockedHosts: string[]; dialogs: string[];
  /** Traced runs only: checked values (shortened) after each step, in step order. */
  trace?: (string | null)[][];
}
export interface ManifestV4 {
  schemaVersion: 4;
  id: string;
  classification: 'user-local-application';
  adapter: { id: 'local-web-app-v1'; version: string };
  runnerVersion: string;
  /** draft: reporter references not yet resolved against the live page. */
  resolution: 'draft' | 'resolved';
  expectation: { invariantId: 'REPORTED_EXPECTATION'; description: string; checks: AppCheck[] };
  assertionDigest: string;
  expectationBasis: 'reporter-approved' | 'proposed-unconfirmed';
  humanApproval: 'reporter-confirmed' | 'not-claimed';
  /**
   * Signature of the first failing capture. exact[i]: the observed value must match values[i];
   * otherwise only passed[i] (computed on the full observed value) must match. values are for display.
   */
  failure: { values: (string | null)[]; exact: boolean[]; passed: boolean[] } | null;
  actions: AppAction[];
  responses: [];
  environment: {
    browser: 'chromium'; viewport: { width: number; height: number }; locale: 'en-US'; timezoneId: 'UTC';
    clock: string | null; seed: number; platform: 'host'; timeoutMs: number; actionTimeoutMs: number; settleMs: number; checkTimeoutMs: number;
  };
  boundary: { behavior: 'local-web-app'; network: 'loopback-only'; database: 'not-reset'; externalDependencies: [] };
  app: { revision: 'working-tree'; sourceDigest: string; commit: string | null; dirty: boolean; name: string };
}
export interface AppResolution {
  actions: { id: string; target: AppTarget | null; sensitive: boolean }[];
  checks: (AppTarget | null)[];
  /** Up to eight visible elements offered when a check target is missing; local UI only, never in a report. */
  candidates: { selector: string; text: string }[];
}
export type Manifest = SyntheticManifest | ManifestV3 | ManifestV4;
/** Manifests of the evidence workbench's capture sessions; local-app reports use REPRO.md jobs instead. */
export type WorkbenchManifest = SyntheticManifest | ManifestV3;
export interface AuthoredExperimentDeclaration {
  searchOrder: SearchOrder;
  expectation: Omit<Expectation, 'description'>;
  expectationBasis: ManifestV2['expectationBasis'];
}
export interface RunEvent { seq: number; at: string; type: string; message: string; actionId?: string }
/** Optional case-adapter diagnostics, separate from product evidence. No target data or exception text. */
export interface TeardownEvent {
  seq: number; runId: string; elapsedMs: number; monotonicNs: string;
  profileProbeCompletedMonotonicNs: string;
  profileState: 'not-created' | 'present' | 'absent' | 'unavailable';
  phase: 'run' | 'server-close' | 'context-close' | 'execution-work' | 'execution-drain' | 'profile-cleanup';
  event: 'start' | 'call' | 'wait-start' | 'wait-settled' | 'wait-timeout' | 'wait-return' |
    'context-close-event' | 'browser-disconnected' | 'retained' | 'removed' | 'return';
  outcome?: 'resolved' | 'rejected' | 'timeout';
  late?: boolean; budgetMs?: number; deadlineElapsedMs?: number;
  causeKind?: 'error' | 'non-error';
}
export interface RunResult {
  id: string; outcome: Outcome; reason: string; category?: ErrorCategory;
  manifestDigest: string; assertionDigest: string; harnessDigest: string;
  appRevision: string; appDigest: string; adapterVersion: string; runnerVersion: string;
  seed: number; startedAt: string; durationMs: number; assertionCount: number;
  observation: { latestRequestId: number; query: string; results: string[] } | BrowserCaseObservation | AppObservation | null;
  events: RunEvent[]; artifacts: { path: string; sha256: string; bytes: number }[];
  environment: { platform: string; node: string; browser: string; isolation: string };
}
export interface AppRunTarget {
  /** Loopback origin of the running app for this execution. */
  origin: string;
  /** Withheld typed values by variable name; held in memory only. */
  secrets: Record<string, string>;
  /** Resolve draft references (capture) instead of using frozen targets. */
  resolve: boolean;
  /** Also record every checked value after each step (relevance for reduction). */
  trace?: boolean;
}
export interface RunOptions {
  artifactDir: string; signal?: AbortSignal; revision?: 'buggy' | 'fixed';
  /** Required for schema 4: where and how to run the user's app. */
  app?: AppRunTarget;
  /** Schema 4 capture only: receives how each reporter reference resolved on the live page, even when the run is blocked. */
  onResolution?: (resolution: AppResolution) => void;
  onEvent?: (event: RunEvent) => void;
  /** Best-effort synchronous diagnostic sink. A throwing sink is disabled; callers must validate coverage. */
  onTeardown?: (event: TeardownEvent) => void;
}
export type RunFunction = (manifest: Manifest, options: RunOptions) => Promise<RunResult>;
export interface Trial {
  index: number; inputDigest: string; seed: number; removed: string[];
  outcome: Outcome; reason: string; durationMs: number; accepted: boolean;
  runIds: string[];
}
export interface ReductionResult {
  manifest: Manifest; trials: Trial[]; baseline: RunResult;
  status: 'complete' | 'budget-exhausted' | 'cancelled' | 'inconclusive';
  minimality: 'dependency-group-1-minimal' | 'unverified';
  reason: string; executions: number; durationMs: number;
}
export interface ReductionOptions {
  artifactDir: string; maxExecutions: number; maxDurationMs: number; repetitions: number;
  /** Actions that must be kept; a candidate removing one (or a prerequisite of one) is not tested. */
  pinned?: string[];
  signal?: AbortSignal; onTrial?: (trial: Trial) => void;
}
