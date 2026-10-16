import { opendir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ReproError } from './contracts.js';

const recovery = 'Install the pinned Chromium with PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers npx --no-install playwright install chromium --only-shell, then retry.';

function playwrightEnvironment(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  // Playwright 1.64 resolves these in order, including an explicitly empty value.
  return environment[name] ?? environment[`npm_config_${name.toLowerCase()}`] ?? environment[`npm_package_config_${name.toLowerCase()}`];
}

/** A narrow prerequisite check, never evidence that an attempted browser has stopped. */
export async function assertExplicitBrowserCacheAvailable(channel?: string, environment: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): Promise<void> {
  if (channel === 'chrome') return;
  const configured = playwrightEnvironment(environment, 'PLAYWRIGHT_BROWSERS_PATH');
  // Let Playwright resolve default and package-local installations itself.
  if (!configured || configured === '0') return;
  const cache = resolve(playwrightEnvironment(environment, 'INIT_CWD') || cwd, configured);
  let empty: boolean;
  try {
    const directory = await opendir(cache);
    try { empty = await directory.read() === null; }
    finally { await directory.close(); }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ReproError('environment', 'BROWSER_UNAVAILABLE', recovery, { cause });
    }
    throw new ReproError('environment', 'BROWSER_CACHE_UNREADABLE', 'The configured browser cache could not be read. Check PLAYWRIGHT_BROWSERS_PATH points to a readable directory, then retry.', { cause });
  }
  if (empty) throw new ReproError('environment', 'BROWSER_UNAVAILABLE', recovery);
  // A nonempty cache may still lack the selected executable. Launch performs
  // normal executable selection and host validation without a guessed path.
}
