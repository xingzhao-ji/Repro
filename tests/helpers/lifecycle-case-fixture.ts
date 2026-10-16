import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { Server } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { chromium } from 'playwright';

type Config = { mode: string; directory: string; callerHome?: string };
type Channel = { publish(message: Record<string, unknown>): void };

export function installFixture(config: Config, channel: Channel): void {
  if (config.mode === 'cache-only-rejection') {
    assert.ok(config.callerHome);
    mock.method(chromium, 'launchPersistentContext', async (directory: string, options: Parameters<typeof chromium.launchPersistentContext>[1]) => {
      const environment = options?.env;
      const browserHome = environment?.['HOME'] ?? config.callerHome!;
      const browserCache = environment?.['XDG_CACHE_HOME'] ?? join(browserHome, '.cache');
      assert.ok(browserHome.startsWith(`${config.directory}${sep}`) && browserCache.startsWith(`${config.directory}${sep}`), 'The fake may write only task-owned directories.');
      const fontCache = join(browserCache, 'fontconfig');
      await mkdir(fontCache, { recursive: true });
      const generated = join(fontCache, 'generated-browser-cache');
      await writeFile(generated, 'Browser-created cache.');
      const selected = Object.fromEntries(['HOME', 'XDG_CACHE_HOME', 'PATH', 'TMPDIR', 'PLAYWRIGHT_BROWSERS_PATH']
        .filter(key => environment?.[key] !== undefined).map(key => [key, environment![key]]));
      channel.publish({ type: 'cache-written', profile: directory, environment: selected, generated });
      throw new Error('Simulated startup failure after font cache creation.');
    });
  } else if (config.mode === 'late-server') {
    const nativeListen = Server.prototype.listen;
    mock.method(Server.prototype, 'listen', function(this: Server, ...args: unknown[]) {
      channel.publish({ type: 'server-created', listening: this.listening });
      this.once('close', () => channel.publish({ type: 'server-closed', listening: this.listening }));
      setTimeout(() => channel.publish({ type: 'cancel-server-startup' }), 5);
      setTimeout(() => { Reflect.apply(nativeListen, this, args); }, 35);
      return this;
    });
  } else throw new Error('Unknown lifecycle fixture mode.');
}
