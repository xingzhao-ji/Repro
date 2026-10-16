export const VERSION = '0.1.0';
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
export type Manifest = SyntheticManifest | ManifestV3;
export interface AuthoredExperimentDeclaration {
  searchOrder: SearchOrder;
  expectation: Omit<Expectation, 'description'>;
  expectationBasis: ManifestV2['expectationBasis'];
}
export interface RunEvent { seq: number; at: string; type: string; message: string; actionId?: string }
export interface RunResult {
  id: string; outcome: Outcome; reason: string; category?: ErrorCategory;
  manifestDigest: string; assertionDigest: string; harnessDigest: string;
  appRevision: string; appDigest: string; adapterVersion: string; runnerVersion: string;
  seed: number; startedAt: string; durationMs: number; assertionCount: number;
  observation: { latestRequestId: number; query: string; results: string[] } | BrowserCaseObservation | null;
  events: RunEvent[]; artifacts: { path: string; sha256: string; bytes: number }[];
  environment: { platform: string; node: string; browser: string; isolation: string };
}
export interface RunOptions {
  artifactDir: string; signal?: AbortSignal; revision?: 'buggy' | 'fixed';
  onEvent?: (event: RunEvent) => void;
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
  signal?: AbortSignal; onTrial?: (trial: Trial) => void;
}
