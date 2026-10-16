import { EventEmitter } from 'node:events';
import { chromium } from 'playwright';
import type { FixtureChannel, FixtureConfig } from './case-worker-control.js';

/** Controlled context behavior inside the fixed worker; never launches a browser. */
export function installFixture(config: FixtureConfig, channel: FixtureChannel): void {
  const mode = config.mode;
  if (!['resolve', 'reject', 'late-resolve', 'late-reject', 'timer-registration'].includes(mode)) {
    throw new Error('Unsupported diagnostics fixture mode.');
  }
  let connected = true;
  const browser = Object.assign(new EventEmitter(), { version: () => '0.0.0.0', isConnected: () => connected });
  if (mode.startsWith('late-')) channel.ref();
  let finish!: () => void;
  let released = false;
  const lifecycle = () => { connected = false; context.emit('close'); browser.emit('disconnected'); };
  const lateWork = new Promise<void>((resolve, reject) => {
    finish = () => {
      if (released) return;
      released = true;
      lifecycle();
      if (mode === 'late-reject') reject(new Error('fake-private-rejection-secret')); else resolve();
      channel.publish({ type: 'fixture-close-settled' });
      channel.unref();
    };
  });
  channel.onCommand(message => {
    if (message.type === 'fixture-finish-close' || (mode.startsWith('late-') && message.type === 'fixture-dispose')) finish();
  });

  let cleanupTimerRegistered = false;
  if (mode === 'timer-registration') {
    const originalTimer = globalThis.setTimeout;
    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      if (args[1] === 2000) cleanupTimerRegistered = true;
      return originalTimer(...args);
    }) as typeof setTimeout;
    const send = process.send;
    if (!send) throw new Error('The diagnostics fixture requires the actual worker IPC channel.');
    process.send = ((...args: Parameters<typeof send>) => {
      const frame = args[0] as { type?: string; event?: { phase?: string; event?: string } };
      if (frame?.type === 'teardown' && frame.event?.phase === 'context-close' && frame.event.event === 'wait-start') {
        channel.publish({ type: 'timer-before-observation', registered: cleanupTimerRegistered });
      }
      return Reflect.apply(send, process, args);
    }) as typeof send;
  }
  const context = Object.assign(new EventEmitter(), {
    browser: () => browser,
    isClosed: () => !connected,
    // Preserve real server/profile acquisition and the production teardown state
    // machine while stopping before page execution or any browser creation.
    route: async () => { throw new Error('fake-private-setup-secret'); },
    close: () => {
      cleanupTimerRegistered = false;
      channel.publish({ type: 'fixture-close-start' });
      if (mode.startsWith('late-')) return lateWork;
      lifecycle();
      return mode === 'reject' ? Promise.reject(new Error('fake-private-rejection-secret')) : Promise.resolve();
    },
  });
  chromium.launchPersistentContext = async () => context as unknown as Awaited<ReturnType<typeof chromium.launchPersistentContext>>;
}
