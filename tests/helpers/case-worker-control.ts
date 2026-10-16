import childProcess, { type ChildProcess, type SpawnOptions } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestContext } from 'node:test';
import type { Duplex } from 'node:stream';

export interface FixtureConfig {
  suite: 'lifecycle' | 'startup' | 'diagnostics' | 'browser';
  mode: string;
  directory: string;
  [key: string]: string | number | boolean | undefined;
}
export interface FixtureMessage { type: string; [key: string]: unknown }
export interface FixtureChannel {
  publish(message: FixtureMessage): void;
  onCommand(handler: (message: FixtureMessage) => void | Promise<void>): void;
  waitForCommand(type: string): Promise<FixtureMessage>;
  ref(): void;
  unref(): void;
}
export interface FixtureWorker { child: ChildProcess; closed: Promise<void> }

/** Substitutes only Repro's fixed worker invocation, never a product option. */
export function installCaseWorkerFixture(t: TestContext, config: FixtureConfig) {
  const directory = resolve(config.directory);
  const location = relative(resolve('.repro-runs'), directory);
  if (location.startsWith('..') || location.startsWith('/')) throw new Error('Worker fixture output must stay in the task-owned .repro-runs directory.');
  const serialized = JSON.stringify({ ...config, directory });
  if (serialized.length > 16_384) throw new Error('Worker fixture configuration is too large.');
  const source = fileURLToPath(new URL('../../src/case-worker.ts', import.meta.url));
  const built = fileURLToPath(new URL('../../dist/case-worker.js', import.meta.url));
  const fixture = fileURLToPath(new URL('./case-worker-fixture.ts', import.meta.url));
  const messages: FixtureMessage[] = [];
  const workers: FixtureWorker[] = [];
  const listeners = new Set<() => void>();
  let stream: Duplex | undefined;
  const controls = new Map<ChildProcess, { stream: Duplex; nonce?: string }>();
  const original = childProcess.spawn;
  const replacement = ((command: string, argsOrOptions?: readonly string[] | SpawnOptions, options?: SpawnOptions): ChildProcess => {
    const args = Array.isArray(argsOrOptions) ? [...argsOrOptions] : undefined;
    const fixedSource = args?.length === 3 && args[0] === '--import' && args[1] === import.meta.resolve('tsx') && args[2] === source;
    const fixedBuild = args?.length === 1 && args[0] === built;
    if (command !== process.execPath || !args || (!fixedSource && !fixedBuild)) return Reflect.apply(original, childProcess, [command, argsOrOptions, options]) as ChildProcess;
    const workerOptions = options ?? {};
    if (!Array.isArray(workerOptions.stdio) || workerOptions.stdio[3] !== 'ipc') throw new Error('Unexpected fixed worker IPC layout.');
    // Always use the test source loader, including when a test runs built code.
    const fixtureArgs = ['--import', import.meta.resolve('tsx'), fixture, serialized];
    const child = original(command, fixtureArgs, { ...workerOptions, stdio: [...workerOptions.stdio, 'pipe'] });
    const closed = new Promise<void>(accept => child.once('close', () => accept()));
    workers.push({ child, closed });
    stream = child.stdio[4] as Duplex;
    const control: { stream: Duplex; nonce?: string } = { stream };
    controls.set(child, control);
    const send = child.send;
    child.send = ((message: unknown, ...sendArgs: unknown[]) => {
      if (message && typeof message === 'object' && Reflect.get(message, 'type') === 'start' && typeof Reflect.get(message, 'nonce') === 'string') control.nonce = Reflect.get(message, 'nonce') as string;
      return Reflect.apply(send, child, [message, ...sendArgs]);
    }) as typeof child.send;
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 65_536) throw new Error('Worker fixture telemetry exceeded its bound.');
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!line) continue;
        const message = JSON.parse(line) as FixtureMessage;
        if (!message || typeof message !== 'object' || typeof message.type !== 'string') throw new Error('Invalid worker fixture telemetry.');
        messages.push(message);
        for (const listener of listeners) listener();
      }
    });
    stream.on('error', () => {});
    return child;
  }) as typeof childProcess.spawn;
  const mocked = t.mock.method(childProcess, 'spawn', replacement);
  syncBuiltinESMExports();
  const fixtureControl = {
    messages,
    workers,
    waitFor(type: string, count = 1, timeoutMs = 3000): Promise<FixtureMessage> {
      return new Promise((accept, reject) => {
        const check = () => {
          const found = messages.filter(message => message.type === type)[count - 1];
          if (!found) return;
          clearTimeout(timer); listeners.delete(check); accept(found);
        };
        const timer = setTimeout(() => { listeners.delete(check); reject(new Error(`Worker fixture did not report ${type}.`)); }, timeoutMs);
        listeners.add(check); check();
      });
    },
    command(type: string, fields: Record<string, unknown> = {}): void {
      if (!stream || stream.destroyed) throw new Error('Worker fixture control channel is not available.');
      const message = JSON.stringify({ ...fields, type });
      if (message.length > 16_384) throw new Error('Worker fixture command is too large.');
      stream.write(`${message}\n`);
    },
    async observations() {
      await new Promise<void>(accept => setImmediate(accept));
      return {
        contextsOpened: messages.filter(message => message.type === 'context-opened').map(message => String(message.id)),
        contextsClosed: messages.filter(message => message.type === 'context-closed').map(message => String(message.id)),
        violations: messages.filter(message => message.type === 'violation').map(message => String(message.directive)),
        attempts: messages.filter(message => message.type === 'attempt').length,
      };
    },
    async dispose(timeoutMs = 3500): Promise<void> {
      await Promise.all(workers.map(async ({ child, closed }) => {
        if (child.exitCode !== null || child.signalCode !== null) { await closed; return; }
        const control = controls.get(child)!;
        if (!control.stream.destroyed) control.stream.write(`${JSON.stringify({ type: 'fixture-dispose' })}\n`);
        if (child.connected && control.nonce) child.send({ version: 1, type: 'cancel', nonce: control.nonce }, () => {});
        let timer: NodeJS.Timeout | undefined;
        try {
          await Promise.race([closed, new Promise<never>((_accept, reject) => {
            timer = setTimeout(() => reject(new Error(`Owned worker fixture ${child.pid} did not finish its scoped cleanup.`)), timeoutMs);
          })]);
        } finally { clearTimeout(timer); }
      }));
    },
    restore(): void { mocked.mock.restore(); syncBuiltinESMExports(); },
  };
  t.after(async () => {
    try { await fixtureControl.dispose(); } finally { fixtureControl.restore(); }
  });
  return fixtureControl;
}
