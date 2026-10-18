import { execFile } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedDirectory } from './paths.js';

/**
 * A ready-to-try example: Repro's bundled task-tally fixture copied into a new
 * git repository under .repro-runs, with a matching description. It is a
 * demonstration app shipped with Repro, never the main workflow.
 */
export const EXAMPLE_DESCRIPTION = {
  title: 'Unchecking a task drops the remaining count',
  wentWrong: [
    'Open the app',
    'Type "Write report" into "New task"',
    'Click "Add task"',
    'Type "Send invoice" into "New task"',
    'Press Enter',
    'Check "Done: Send invoice"',
    'Uncheck "Done: Send invoice"',
    'The counter now says "0 tasks remaining".',
  ].join('\n'),
  shouldHappen: 'Unchecking a task should count it as remaining again.\n"#remaining" should show "2 tasks remaining"',
};
const run = (cwd: string, args: string[]) => new Promise<void>((resolve, reject) =>
  execFile('git', ['-c', 'user.name=Repro example', '-c', 'user.email=example@repro.invalid', '-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...args], { cwd, timeout: 15_000 }, error => error ? reject(error) : resolve()));

export async function createExampleApp(root: string): Promise<{ path: string } & typeof EXAMPLE_DESCRIPTION> {
  const directory = ownedDirectory(join(root, 'example-apps', `task-tally-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}`), { exclusive: true });
  await mkdir(directory, { recursive: true });
  await cp(fileURLToPath(new URL('../fixtures/local-apps/task-tally/', import.meta.url)), directory, { recursive: true });
  await rm(join(directory, 'fix.patch'), { force: true });
  await run(directory, ['init', '-q']);
  await run(directory, ['add', '.']);
  await run(directory, ['commit', '-q', '-m', 'Task tally example app']);
  return { path: directory, ...EXAMPLE_DESCRIPTION };
}
