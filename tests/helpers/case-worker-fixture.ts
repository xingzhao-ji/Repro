// Fixed test-only bootstrap. Production never accepts this entry or configuration.
import { Socket } from 'node:net';
import { relative, resolve } from 'node:path';
import { installCreationFence } from '../../src/case-process-fence.js';
import type { FixtureChannel, FixtureConfig, FixtureMessage } from './case-worker-control.js';

installCreationFence();
const config = JSON.parse(process.argv[2] ?? '{}') as FixtureConfig;
const suites = {
  lifecycle: './lifecycle-case-fixture.js', startup: './startup-case-fixture.js',
  diagnostics: './diagnostics-case-fixture.js', browser: './browser-case-fixture.js',
} as const;
if (!Object.hasOwn(suites, config.suite) || typeof config.mode !== 'string' || typeof config.directory !== 'string') throw new Error('Invalid fixed worker fixture configuration.');
const location = relative(resolve('.repro-runs'), resolve(config.directory));
if (location.startsWith('..') || location.startsWith('/')) throw new Error('Worker fixture output must stay task-owned.');
const socket = new Socket({ fd: 4, readable: true, writable: true });
socket.setEncoding('utf8'); socket.unref();
const handlers = new Set<(message: FixtureMessage) => void | Promise<void>>();
const commands: FixtureMessage[] = [];
const pending = new Map<string, ((message: FixtureMessage) => void)[]>();
let buffer = '';
const channel: FixtureChannel = {
  publish(message) {
    const encoded = JSON.stringify(message);
    if (encoded.length > 65_536) throw new Error('Worker fixture telemetry is too large.');
    socket.write(`${encoded}\n`);
  },
  onCommand(handler) { handlers.add(handler); },
  waitForCommand(type) {
    const index = commands.findIndex(command => command.type === type);
    if (index >= 0) return Promise.resolve(commands.splice(index, 1)[0]!);
    return new Promise(accept => { const waiting = pending.get(type) ?? []; waiting.push(accept); pending.set(type, waiting); });
  },
  ref() { socket.ref(); },
  unref() { socket.unref(); },
};
socket.on('data', (chunk: string) => {
  buffer += chunk;
  if (buffer.length > 16_384) throw new Error('Worker fixture command exceeded its bound.');
  let end: number;
  while ((end = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    if (!line) continue;
    const message = JSON.parse(line) as FixtureMessage;
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') throw new Error('Invalid worker fixture command.');
    const waiting = pending.get(message.type)?.shift();
    if (waiting) waiting(message); else commands.push(message);
    for (const handler of handlers) void Promise.resolve(handler(message)).catch(() => channel.publish({ type: 'fixture-command-error' }));
  }
});
socket.on('error', () => {});
const suite = await import(new URL(suites[config.suite], import.meta.url).href) as { installFixture(config: FixtureConfig, channel: FixtureChannel): void | Promise<void> };
await suite.installFixture(config, channel);
await import('../../src/case-worker.js');
