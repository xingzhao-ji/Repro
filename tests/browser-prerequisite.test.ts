import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ReproError } from '../src/contracts.js';
import { assertExplicitBrowserCacheAvailable } from '../src/browser-prerequisite.js';

const recovery = 'Install the pinned Chromium with PLAYWRIGHT_BROWSERS_PATH=.repro-cache/browsers npx --no-install playwright install chromium --only-shell, then retry.';
async function workspace() {
  const root = resolve('.repro-runs/startup-prerequisites/tests', randomUUID());
  await mkdir(root, { recursive: true });
  return root;
}
function missing(error: unknown): boolean {
  assert.ok(error instanceof ReproError);
  assert.equal(error.category, 'environment'); assert.equal(error.code, 'BROWSER_UNAVAILABLE');
  assert.equal(error.message, recovery);
  return true;
}

test('an explicitly missing or empty browser cache reports the pinned installation prerequisite', async () => {
  const root = await workspace();
  const empty = join(root, 'empty'); await mkdir(empty);
  for (const cache of [join(root, 'missing'), empty]) {
    await assert.rejects(assertExplicitBrowserCacheAvailable(undefined, { PLAYWRIGHT_BROWSERS_PATH: cache }), missing);
  }
});

test('a nonempty cache is left to Playwright validation without changing or certifying it', async () => {
  const root = await workspace();
  await writeFile(join(root, 'not-a-browser'), 'preserve unrelated cache bytes');
  await assertExplicitBrowserCacheAvailable(undefined, { PLAYWRIGHT_BROWSERS_PATH: root });
  assert.equal(await readFile(join(root, 'not-a-browser'), 'utf8'), 'preserve unrelated cache bytes');
});

test('unset, empty, package-local and explicit Chrome configurations bypass the cache prerequisite', async () => {
  for (const environment of [
    {}, { PLAYWRIGHT_BROWSERS_PATH: '' }, { PLAYWRIGHT_BROWSERS_PATH: '0' },
    { npm_config_playwright_browsers_path: '0' },
    { npm_package_config_playwright_browsers_path: '0' },
    { PLAYWRIGHT_BROWSERS_PATH: '', npm_config_playwright_browsers_path: 'invalid\0path' },
  ]) await assertExplicitBrowserCacheAvailable(undefined, environment);
  await assertExplicitBrowserCacheAvailable('chrome', { PLAYWRIGHT_BROWSERS_PATH: 'invalid\0path' });
});

test('browser cache environment precedence matches Playwright including empty values', async () => {
  const root = await workspace();
  const empty = join(root, 'empty'); await mkdir(empty);
  const populated = join(root, 'populated'); await mkdir(populated);
  await writeFile(join(populated, 'entry'), 'leave validation to Playwright');
  await assert.rejects(assertExplicitBrowserCacheAvailable(undefined, { npm_config_playwright_browsers_path: empty }), missing);
  await assert.rejects(assertExplicitBrowserCacheAvailable(undefined, { npm_package_config_playwright_browsers_path: empty }), missing);
  await assertExplicitBrowserCacheAvailable(undefined, {
    PLAYWRIGHT_BROWSERS_PATH: populated, npm_config_playwright_browsers_path: empty,
    npm_package_config_playwright_browsers_path: empty,
  });
  await assert.rejects(assertExplicitBrowserCacheAvailable(undefined, {
    npm_config_playwright_browsers_path: empty, npm_package_config_playwright_browsers_path: populated,
  }), missing);
  await assertExplicitBrowserCacheAvailable(undefined, {
    npm_config_playwright_browsers_path: '', npm_package_config_playwright_browsers_path: empty,
  });
});

test('relative cache roots use INIT_CWD with Playwright npm fallbacks before the current directory', async () => {
  const root = await workspace();
  const initial = join(root, 'initial'); await mkdir(initial);
  await mkdir(join(initial, 'cache'));
  const current = join(root, 'current'); await mkdir(current);
  await mkdir(join(current, 'cache')); await writeFile(join(current, 'cache', 'entry'), 'preserve');
  for (const name of ['INIT_CWD', 'npm_config_init_cwd', 'npm_package_config_init_cwd']) {
    await assert.rejects(assertExplicitBrowserCacheAvailable(undefined, { PLAYWRIGHT_BROWSERS_PATH: 'cache', [name]: initial }, current), missing);
  }
  await assertExplicitBrowserCacheAvailable(undefined, { PLAYWRIGHT_BROWSERS_PATH: 'cache' }, current);
  await assertExplicitBrowserCacheAvailable(undefined, { PLAYWRIGHT_BROWSERS_PATH: 'cache', INIT_CWD: '', npm_config_init_cwd: initial }, current);
});

test('an unreadable cache configuration reports an actionable error without exposing its path', async () => {
  const root = await workspace();
  const invalid = join(root, 'private-cache-path'); await writeFile(invalid, 'not a directory');
  await assert.rejects(assertExplicitBrowserCacheAvailable(undefined, { PLAYWRIGHT_BROWSERS_PATH: invalid }), error => {
    assert.ok(error instanceof ReproError);
    assert.equal(error.category, 'environment'); assert.equal(error.code, 'BROWSER_CACHE_UNREADABLE');
    assert.match(error.message, /PLAYWRIGHT_BROWSERS_PATH/); assert.match(error.message, /read|directory/i);
    assert.equal(error.message.includes(invalid), false); assert.ok(error.cause instanceof Error);
    return true;
  });
});
