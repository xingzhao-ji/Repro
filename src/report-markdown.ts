import { createHash } from 'node:crypto';
import type { GeneratedFile } from './report-test.js';
import { REDACTION_LABELS, type RedactionKind } from './redaction.js';

/**
 * Renders the single transferable REPRO.md. Pure: every sentence comes from
 * data the orchestrator observed or the reporter supplied. Nothing here runs,
 * infers a cause, or upgrades a status.
 */
export type ReportStatus = 'reproduced' | 'intermittent' | 'not-reproduced' | 'blocked';
export interface RunLine { label: string; outcome: string; values: (string | null)[] | null; note: string; durationMs: number }
export interface CheckLine { text: string; expected: string; observed: string | null; passed: boolean }
export interface FreshCheck {
  status: 'reproduced' | 'not-reproduced' | 'different' | 'passed' | 'failed' | 'not-run';
  summary: string; observed: (string | null)[] | null; commands: string[]; durationMs: number; output: string[];
}
export interface ReportData {
  title: string; slug: string; generatedAt: string; reproVersion: string;
  status: ReportStatus; statusDetail: string;
  /** Whether a failure was frozen from a run; without one the test cannot say a failure is "the recorded" one. */
  failureRecorded: boolean;
  reporter: { wentWrong: string; shouldHappen: string; notes: string[] };
  expectation: { checks: CheckLine[]; approval: 'reporter-confirmed' | 'not-claimed' };
  observedFrom: string;
  steps: { final: string[]; original: string[]; reduction: string; secrets: { name: string; purpose: string }[] };
  runs: RunLine[];
  trials: { removed: string[]; outcome: string; accepted: boolean; runs: number }[];
  app: {
    name: string; folderNote: string;
    git: { commit: string; branch: string | null; remotes: { name: string; url: string }[]; pushedTo: string[]; appPath: string; dirty: boolean;
      changed: { path: string; status: string }[]; untracked: string[]; omitted: { path: string; reason: string }[] } | null;
    patch: GeneratedFile | null; patchRedacted: boolean;
    start: { command: string | null; source: string; url: string | null; kind: string } | null;
    install: string | null; packageManager: string | null;
  };
  environment: { os: string; node: string; packageManager: string | null; browser: string; nodeDeclared: string | null };
  dependencies: { declared: Record<string, string>; dev: Record<string, string>; resolved: Record<string, string>; lockfile: { file: string; sha256: string } | null };
  test: { files: GeneratedFile[]; testPath: string };
  fresh: FreshCheck;
  logs: { pageErrors: string[]; console: string[]; failedRequests: string[]; blockedHosts: string[]; dialogs: string[]; server: string[] };
  suspected: string[]; verified: string[];
  limitations: string[]; missing: string[];
  redactions: Partial<Record<RedactionKind, number>>;
  details: Record<string, string>;
}

/** From an app subfolder, plain `git apply` would skip changes outside it; apply from the repository root. */
const applyCommand = (appPath: string) => appPath === '.' ? 'git apply .repro/local-changes.patch' : 'git -C "$(git rev-parse --show-toplevel)" apply "$PWD/.repro/local-changes.patch"';
const STATUS_LABEL: Record<ReportStatus, string> = { reproduced: 'Reproduced', intermittent: 'Intermittent', 'not-reproduced': 'Not reproduced', blocked: 'Blocked' };
function fence(content: string): string {
  const longest = Math.max(2, ...[...content.matchAll(/`+/g)].map(match => match[0].length));
  return '`'.repeat(longest + 1);
}
/** Untrusted output (app logs, command output) is indented, so none of its lines can open a file block. */
function output(lines: string[]): string { return code(lines.map(line => `  ${line}`).join('\n'), 'text'); }
function code(content: string, language = ''): string {
  const marks = fence(content);
  return `${marks}${language}\n${content.endsWith('\n') ? content : `${content}\n`}${marks}`;
}
/** A fenced block whose info string names its destination and SHA-256, so it can be materialized safely. */
export function fileBlock(file: GeneratedFile): string {
  if (!file.content.endsWith('\n')) throw new Error('Generated files end with a newline.');
  const marks = fence(file.content);
  return `${marks}${file.language} repro-file=${file.path} sha256=${file.sha256}\n${file.content}${marks}`;
}
/** An inline code span that holds any text: its delimiter is longer than the longest backtick run inside. */
const inline = (value: string) => {
  const text = value.replace(/\s+/g, ' ');
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map(match => match[0].length));
  const marks = '`'.repeat(longest + 1), pad = longest ? ' ' : '';
  return `${marks}${pad}${text}${pad}${marks}`;
};
export const shown = (value: string | null, limit = 160) => value === null ? '_(element not found)_' : inline(value.length > limit ? `${value.slice(0, limit)}… (${value.length} characters)` : value || '(empty)');
const quote = (text: string) => text.trim() ? text.trim().split(/\r?\n/).map(line => `> ${line}`).join('\n') : '> _(not provided)_';
const list = (items: string[], empty: string) => items.length ? items.map(item => `- ${item}`).join('\n') : `- ${empty}`;
const escapeCell = (value: string) => value.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * The extraction command shown in REPRO.md. It writes only .repro/<name> files
 * named by fenced blocks, refuses to overwrite and checks each SHA-256.
 */
export const EXTRACTOR = `node --input-type=module -e '
import { readFileSync, writeFileSync, mkdirSync, lstatSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
const markdown = readFileSync(process.argv[1], "utf8").replace(/\\r\\n/g, "\\n");
try { mkdirSync(".repro"); } catch (error) { if (error.code !== "EEXIST") throw error; }
if (!lstatSync(".repro").isDirectory() || realpathSync(".repro") !== join(realpathSync("."), ".repro")) throw new Error(".repro must be a real folder inside this one, not a link; remove it and run this again.");
const blocks = /^(\`{3,})[a-z]+ repro-file=(\\.repro\\/(?:[a-z0-9][a-z0-9-]*\\.test\\.mjs|package\\.json|package-lock\\.json|local-changes\\.patch)) sha256=([0-9a-f]{64})\\n([\\s\\S]*?)^\\1$/gm;
let written = 0;
for (const [, , path, sha256, content] of markdown.matchAll(blocks)) {
  if (createHash("sha256").update(content).digest("hex") !== sha256) throw new Error(path + " does not match its SHA-256; use an unmodified REPRO.md.");
  writeFileSync(path, content, { flag: "wx" });
  console.log("wrote " + path);
  written++;
}
if (!written) throw new Error("No .repro files found in this REPRO.md.");
'`;

/** The same parse in TypeScript, used by Repro's own tests and fresh-checkout check. */
export function extractReproFiles(markdown: string): { path: string; content: string; sha256: string; valid: boolean }[] {
  const blocks = /^(`{3,})[a-z]+ repro-file=(\.repro\/(?:[a-z0-9][a-z0-9-]*\.test\.mjs|package\.json|package-lock\.json|local-changes\.patch)) sha256=([0-9a-f]{64})\n([\s\S]*?)^\1$/gm;
  return [...markdown.replace(/\r\n/g, '\n').matchAll(blocks)].map(([, , path, sha256, content]) => ({
    path: path!, content: content!, sha256: sha256!, valid: createHash('sha256').update(content!).digest('hex') === sha256,
  }));
}

/** A remote another machine can reach: a URL with a network scheme or scp-style host:path, never a local path. */
export function shareableRemote(url: string): boolean {
  return /^(?:https?|ssh|git):\/\//i.test(url) && !url.includes('[redacted') || /^[\w.-]+@[\w.-]+:[^/]/.test(url);
}
/** The clone URL without Repro's redaction marker: the recipient authenticates with their own credentials. */
const cloneUrl = (url: string) => url.replace('[redacted url-credentials]@', '');
/** One shell word, whatever the data: repository metadata is untrusted and must never be interpreted by the shell. */
export function shellQuote(value: string): string { return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) && !value.startsWith('-') ? value : `'${value.replace(/'/g, `'\\''`)}'`; }
/** A folder name for the clone: the app name made safe, never empty, ".", ".." or option-like. */
function cloneFolder(name: string): string {
  const folder = name.replace(/^@[^/]+\//, '').replace(/[^A-Za-z0-9._-]/g, '-');
  return /^[A-Za-z0-9_]/.test(folder) ? folder : `app-${folder.replace(/^[.-]+/, '')}`.replace(/-$/, '') || 'app';
}
function statusSentence(data: ReportData): string {
  return `**${STATUS_LABEL[data.status]}** — ${data.statusDetail}`;
}
function sourceSection(data: ReportData): string {
  const git = data.app.git;
  if (!git) return `The app folder is not a git repository, so this report cannot name an exact source revision. ${data.app.folderNote}`.trim();
  const remote = git.remotes.find(item => item.name === 'origin') ?? git.remotes[0];
  const rows = [
    ['Commit', inline(git.commit)],
    ['Branch', git.branch ? inline(git.branch) : '_(detached HEAD)_'],
    ['Remote', remote ? `${inline(remote.url)} (${remote.name})${shareableRemote(cloneUrl(remote.url)) ? '' : ' — a path on the reporter’s machine, not reachable from elsewhere'}` : '_none configured — share the repository or a git bundle with the recipient_'],
    ['On a remote branch', git.pushedTo.length ? git.pushedTo.map(inline).join(', ') : '_no — push the commit before sharing this report_'],
    ['App folder in repository', inline(git.appPath)],
    ['Local changes', git.dirty ? `yes — ${git.changed.length} changed tracked file(s), ${git.untracked.length} untracked file(s)` : 'none (working tree clean)'],
  ];
  const lines = ['| | |', '|---|---|', ...rows.map(([name, value]) => `| ${name} | ${value} |`)];
  if (git.dirty) {
    lines.push('', 'Repro reproduced the bug with these uncommitted changes in place:', '');
    for (const change of git.changed.slice(0, 40)) lines.push(`- ${inline(change.path)} (${change.status})`);
    for (const path of git.untracked.slice(0, 40)) lines.push(`- ${inline(path)} (untracked)`);
    if (git.changed.length + git.untracked.length > 80) lines.push('- …');
    if (git.omitted.length) lines.push('', 'Not included in the patch below:', '', ...git.omitted.map(item => `- ${inline(item.path)}: ${item.reason}`));
    if (data.app.patch) {
      lines.push('', `The patch is materialized with the test files as ${inline(data.app.patch.path)} and applied with ${inline(applyCommand(git.appPath))}.`
        + (data.app.patchRedacted ? ' **Repro redacted values in this copy, so it may not apply cleanly; ask the reporter for the original values.**' : ''), '', fileBlock(data.app.patch));
    }
  }
  return lines.join('\n');
}

export function renderReport(data: ReportData): string {
  const git = data.app.git;
  const testCommand = `node --test ${data.test.testPath}`;
  const out: string[] = [];
  out.push(`# ${data.title}`, '');
  out.push('| | |', '|---|---|');
  out.push(`| **Status** | ${statusSentence(data)} |`);
  out.push(`| **App** | ${inline(data.app.name)}${git ? ` at commit ${inline(git.commit.slice(0, 12))}${git.branch ? ` on ${inline(git.branch)}` : ''}${git.dirty ? ' **with uncommitted changes**' : ''}` : ' (no git revision)'} |`);
  out.push(`| **Fresh checkout** | ${escapeCell(data.fresh.summary)} |`);
  out.push(`| **Regression test** | ${inline(testCommand)} — ${({ reproduced: 'fails until the bug is fixed', intermittent: 'fails in some runs (the bug is intermittent)', 'not-reproduced': 'currently passes', blocked: 'not a verified reproduction' } as Record<ReportStatus, string>)[data.status]} |`);
  out.push(`| **Generated** | ${data.generatedAt} by Repro ${data.reproVersion}, locally, without an AI service |`, '');
  out.push('## Summary', '');
  const failing = data.expectation.checks.filter(check => !check.passed);
  if ((data.status === 'reproduced' || data.status === 'intermittent') && failing.length) {
    out.push(`After the steps below, Repro expected that ${failing.map(check => `${check.text}, but observed ${shown(check.observed)}`).join('; and that ')}.`);
  } else if (data.status === 'reproduced' || data.status === 'intermittent') {
    out.push('After the steps below, the expected behavior did not always happen; the runs under “Evidence” show when it failed.');
  } else if (data.status === 'not-reproduced') out.push('Repro followed the reported steps, and the expected behavior happened in every run. The bug did not reproduce under the conditions recorded here.');
  else out.push(`Repro could not complete the reported steps, so it could not tell whether the bug occurs: ${data.statusDetail}`);
  out.push('', 'In the reporter’s words:', '', quote(data.reporter.wentWrong), '');

  out.push('## Expected and observed behavior', '');
  out.push(`The expected behavior below was ${data.expectation.approval === 'reporter-confirmed' ? 'confirmed by the reporter in Repro before any run' : '**not confirmed by the reporter**'}. It is the exact check the regression test makes.`, '');
  out.push('| Check | Expected | Observed | Result |', '|---|---|---|---|');
  for (const check of data.expectation.checks) out.push(`| ${escapeCell(check.text)} | ${escapeCell(shown(check.expected))} | ${escapeCell(shown(check.observed))} | ${check.passed ? 'as expected' : '**not as expected**'} |`);
  out.push('', 'What the reporter said should happen:', '', quote(data.reporter.shouldHappen), '');
  if (data.reporter.notes.length) out.push('Observations in the reporter’s description that are not steps (Repro did not check them; its own observations are above):', '', list(data.reporter.notes, ''), '');

  out.push('## Steps to reproduce', '');
  out.push(data.steps.reduction, '');
  data.steps.final.forEach((step, index) => out.push(`${index + 1}. ${step}`));
  if (data.steps.secrets.length) out.push('', 'Values withheld from this report (set them as environment variables before running the test):', '', ...data.steps.secrets.map(secret => `- ${inline(secret.name)}: ${secret.purpose}`));
  if (data.steps.original.length !== data.steps.final.length || data.steps.original.some((step, index) => step !== data.steps.final[index])) {
    out.push('', '<details><summary>Steps as originally reported (' + data.steps.original.length + ')</summary>', '', ...data.steps.original.map((step, index) => `${index + 1}. ${step}`), '', '</details>');
  }
  out.push('');

  out.push('## Run the regression test', '');
  out.push('The test needs Node.js and npm; it does not need Repro, an account or an AI service. It contains only this bug’s steps and checks; it does not contain your application.', '');
  let number = 0;
  const heading = (text: string) => out.push(`### ${++number}. ${text}`, '');
  heading('Get the exact source');
  if (git) {
    const remote = git.remotes.find(item => item.name === 'origin') ?? git.remotes[0];
    const folder = cloneFolder(data.app.name);
    const reachable = remote && shareableRemote(cloneUrl(remote.url)) ? remote : null;
    // Every data argument is one quoted shell word; "--" ends git's options before the URL.
    out.push(code([`git clone -- ${reachable ? shellQuote(cloneUrl(reachable.url)) : '<repository URL or path>'} ${shellQuote(folder)}`, `cd ${shellQuote(folder)}`, `git checkout ${shellQuote(git.commit)}`,
      ...(git.appPath !== '.' ? [`cd ${shellQuote(git.appPath.startsWith('-') ? `./${git.appPath}` : git.appPath)}`] : [])].join('\n'), 'sh'));
    if (!remote) out.push('', 'The repository has no remote configured. Use any copy that contains this commit, for example a pushed branch or `git bundle`.');
    else if (!reachable) out.push('', `The repository's ${remote.name} remote is a path on the reporter’s machine (${inline(remote.url)}), so it is not reachable from elsewhere. Use any copy that contains this commit, for example a pushed branch or \`git bundle\`.`);
    if (git.dirty && !data.app.patch) out.push('', '**The local changes Repro tested could not be embedded** (see “Source revision and local changes”), so a clean checkout may not reproduce the bug.');
  } else out.push('No exact revision is available (the app folder is not a git repository). Use the same copy of the app the reporter used.');
  out.push('');
  heading('Create the test files');
  out.push('Save this REPRO.md in the app folder, then run this from the app folder. It writes only the `.repro/` files listed under “Test files”, refuses to overwrite existing files, and checks each file’s SHA-256. You can also copy the blocks by hand.', '');
  out.push(code(`${EXTRACTOR} REPRO.md`, 'sh'), '');
  if (git?.dirty && data.app.patch) {
    heading('Apply the local changes');
    out.push('This bug was reproduced with uncommitted changes. The previous step wrote them to `.repro/local-changes.patch`; apply them before installing, because they may change dependencies.', '');
    out.push(code(applyCommand(git.appPath), 'sh'), '');
  }
  heading('Install the app’s dependencies');
  out.push(data.app.install ? code(data.app.install, 'sh') : 'No install command is known for this app.', '');
  heading('Run it');
  out.push(code([`(cd .repro && npm ci && npx playwright install chromium --only-shell)`, ...data.steps.secrets.map(secret => `export ${secret.name}='…'   # ${secret.purpose}`), testCommand].join('\n'), 'sh'), '');
  if (data.app.start?.command) out.push(`The test starts the app with ${inline(data.app.start.command)} (${data.app.start.source}) on a free port. To use an app you already started, set ${inline('REPRO_BASE_URL')}, for example ${inline('REPRO_BASE_URL=http://127.0.0.1:3000 ' + testCommand)}.`, '');
  else if (data.app.start?.kind === 'static') out.push('The test serves the app’s static files itself on a free port.', '');
  else out.push(`Start the app yourself and set ${inline('REPRO_BASE_URL')} to its address before running the test.`, '');
  out.push(({
    reproduced: 'Right now the test **fails** with `REPRO_EXPECTATION_FAILED` and says “This is the failure recorded in REPRO.md”. If it fails with `REPRO_STEP_FAILED` instead, the app no longer matches the recorded steps; that is not the reported bug.',
    intermittent: `The bug is **intermittent** (${data.statusDetail.replace(/\.$/, '')}), so a single run may pass or fail. ${data.failureRecorded ? 'When it fails in the reported way, it says “This is the failure recorded in REPRO.md”.' : 'When it fails, compare what it prints with “Expected and observed behavior”.'}`,
    'not-reproduced': 'Right now the test **passes**, because the bug did not reproduce in Repro’s runs. It still records exactly what was tried.',
    blocked: 'Repro could not complete the steps, so this test is not a verified reproduction. It is likely to stop with `REPRO_STEP_FAILED` at the step that could not be performed.',
  } as Record<ReportStatus, string>)[data.status], '');

  out.push('## Checking a fix', '');
  if (data.status === 'reproduced') {
    out.push('A fix is done when, in the app folder:', '');
    out.push(list([`${inline(testCommand)} passes (exit code 0) with the test files exactly as written in step 2;`,
      'the checks in “Expected and observed behavior” are unchanged — do not edit the test’s expected values or steps to make it pass;',
      'the app’s own tests still pass.'], ''), '');
    out.push('Running the same command before and after the change is the comparison: it fails on the commit above and should pass on the fixed code.', '');
  } else if (data.status === 'intermittent') {
    out.push('Because the bug is intermittent, one passing run proves nothing. A fix is done when the unchanged test passes 10 times in a row:', '');
    out.push(code(`for run in 1 2 3 4 5 6 7 8 9 10; do ${testCommand} || exit 1; done`, 'sh'), '');
    out.push('Do not edit the test’s expected values or steps to make it pass, and keep the app’s own tests passing.', '');
  } else if (data.status === 'not-reproduced') {
    out.push('There is nothing to fix yet: the expected behavior happened in every run. If you can make the bug happen, add the missing steps or conditions and generate a new report.', '');
  } else out.push('There is no verified failure to fix yet. Resolve the step that could not be performed (see “Evidence”), then generate a new report.', '');

  out.push('## Test files', '');
  for (const file of data.test.files) out.push(`### ${inline(file.path)}`, '', fileBlock(file), '');

  out.push('## Evidence', '');
  out.push('### Observed facts', '');
  out.push(data.app.start?.kind === 'external' && !data.app.start.command ? 'Every row is an actual run from a fresh browser profile against the app that was already running; Repro did not restart it between runs.' : 'Every row is an actual run from a fresh browser profile and a freshly started app.', '');
  out.push('| Run | Result | Observed | Time |', '|---|---|---|---|');
  for (const run of data.runs) out.push(`| ${escapeCell(run.label)} | ${escapeCell(run.outcome)}${run.note ? ` — ${escapeCell(run.note)}` : ''} | ${run.values ? escapeCell(run.values.map(value => shown(value, 60)).join(', ')) : '—'} | ${(run.durationMs / 1000).toFixed(1)} s |`);
  if (data.trials.length) {
    const executions = data.trials.reduce((sum, trial) => sum + trial.runs, 0);
    out.push('', `<details><summary>Step-removal trials (${data.trials.length} trials, ${executions} runs)</summary>`, '', 'Each trial removed steps (numbered as originally reported) and ran the rest twice from a fresh start; a trial was kept only if both runs showed the same failure.', '',
      '| Trial | Steps removed | Result | Kept? |', '|---|---|---|---|');
    data.trials.forEach((trial, index) => out.push(`| ${index} | ${trial.removed.length ? escapeCell(trial.removed.join('; ')) : '(none: baseline)'} | ${escapeCell(trial.outcome)} | ${trial.accepted ? 'yes' : 'no'} |`));
    out.push('', '</details>');
  }
  out.push('', `**Fresh checkout:** ${data.fresh.summary}`);
  if (data.fresh.commands.length) out.push('', '<details><summary>Fresh-checkout commands and output</summary>', '', output([...data.fresh.commands.map(command => `$ ${command}`), ...data.fresh.output]), '', '</details>');
  out.push('', '### Logs recorded during the runs (sanitized)', '');
  const logGroups: [string, string[]][] = [['Uncaught page errors', data.logs.pageErrors], ['Console errors and warnings', data.logs.console], ['Failed local requests', data.logs.failedRequests],
    ['Blocked non-local hosts', data.logs.blockedHosts], ['Dialogs and downloads', data.logs.dialogs]];
  for (const [name, entries] of logGroups) out.push(`- **${name}:** ${entries.length ? '' : 'none'}`, ...entries.slice(0, 20).map(entry => `  - ${inline(entry)}`));
  if (data.logs.server.length) out.push('', '<details><summary>App server output (last ' + data.logs.server.length + ' lines, sanitized)</summary>', '', output(data.logs.server), '', '</details>');
  out.push('', '### Suspected causes (not verified)', '');
  out.push(list(data.suspected, 'None recorded.'), '');
  out.push('### Verified causes', '');
  out.push(list(data.verified, 'None. Repro shows that the failure happens and with which steps; it does not determine why.'), '');

  out.push('## Environment and dependencies', '');
  out.push('| | |', '|---|---|');
  out.push(`| Operating system | ${escapeCell(data.environment.os)} |`, `| Node.js | ${data.environment.node}${data.environment.nodeDeclared ? ` (the app declares ${escapeCell(data.environment.nodeDeclared)})` : ''} |`);
  out.push(`| Package manager | ${data.environment.packageManager ? escapeCell(data.environment.packageManager) : '—'} |`, `| Browser | ${escapeCell(data.environment.browser)}, fresh profile, viewport and locale as in the test |`);
  out.push(`| Start | ${data.app.start ? escapeCell(`${data.app.start.command ?? data.app.start.kind} — ${data.app.start.source}`) : 'unknown'} |`);
  out.push(`| Lockfile | ${data.dependencies.lockfile ? `${inline(data.dependencies.lockfile.file)} sha256 ${inline(data.dependencies.lockfile.sha256.slice(0, 16))}…` : 'none'} |`, '');
  const depRows = [...Object.entries(data.dependencies.declared).map(([name, range]) => [name, range, data.dependencies.resolved[name] ?? '—', 'dependency']),
    ...Object.entries(data.dependencies.dev).map(([name, range]) => [name, range, data.dependencies.resolved[name] ?? '—', 'dev'])];
  if (depRows.length) {
    out.push('<details><summary>Declared dependencies (' + depRows.length + ')</summary>', '', '| Package | Declared | Resolved | Kind |', '|---|---|---|---|', ...depRows.slice(0, 200).map(row => `| ${row.map(cell => escapeCell(cell!)).join(' | ')} |`), '', '</details>', '');
  }
  out.push('## Source revision and local changes', '');
  out.push(sourceSection(data), '');

  out.push('## Limits and missing information', '');
  out.push(list([...data.missing.map(item => `**Missing:** ${item}`), ...data.limitations], 'None recorded.'), '');
  const redactionLines = Object.entries(data.redactions).filter(([, count]) => count).map(([kind, count]) => `${count} × ${REDACTION_LABELS[kind as RedactionKind]}`);
  out.push(`Redaction: ${redactionLines.length ? `Repro replaced ${redactionLines.join(', ')} with \`[redacted …]\` markers.` : 'Repro found nothing to redact.'} Redaction is a safeguard, not a guarantee; review this file before sharing it outside your team.`, '');
  out.push('<details><summary>Repro run details</summary>', '', '| | |', '|---|---|', ...Object.entries(data.details).map(([name, value]) => `| ${escapeCell(name)} | ${inline(value)} |`), '', '</details>', '');
  return out.join('\n');
}
