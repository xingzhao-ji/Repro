import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import type { FixtureConfig, FixtureChannel } from './case-worker-control.js';

function requiredString(config: FixtureConfig, field: 'secret' | 'destination'): string {
  const value = config[field];
  if (typeof value !== 'string' || !value) throw new Error('The browser fixture is missing an injection value.');
  return value;
}

/** Test-only injection into the actual browser acquired by the fixed worker. */
export function installFixture(config: FixtureConfig, channel: FixtureChannel): void {
  const launch = chromium.launchPersistentContext.bind(chromium);
  const closeContexts: (() => Promise<void>)[] = [];
  channel.onCommand(async message => {
    if (message.type !== 'fixture-dispose') return;
    await Promise.all(closeContexts.map(close => close()));
    channel.publish({ type: 'fixture-disposed' });
  });
  chromium.launchPersistentContext = async (...args: Parameters<typeof launch>) => {
    const context = await launch(...args);
    closeContexts.push(context.close.bind(context));
    const id = randomUUID();
    channel.publish({ type: 'context-opened', id });
    context.once('close', () => channel.publish({ type: 'context-closed', id }));

    if (config.mode === 'lost-close-ack') {
      const close = context.close.bind(context);
      context.close = async (...closeArgs: Parameters<typeof close>) => {
        await close(...closeArgs);
        await new Promise<void>(() => {});
      };
    } else if (config.mode.startsWith('privacy-')) {
      const mode = config.mode.slice('privacy-'.length), secret = requiredString(config, 'secret');
      await context.addInitScript(({ mode, secret }) => {
        document.addEventListener('DOMContentLoaded', () => {
          const aside = document.createElement('aside'); aside.textContent = secret; document.body.append(aside);
          console.log(secret);
          if (mode === 'exception') throw new Error(secret);
        });
        if (mode === 'wrong-observation') document.addEventListener('input', () => queueMicrotask(() => {
          const element = document.querySelector<HTMLInputElement>('#editor'); if (element) element.value = secret;
        }));
      }, { mode, secret });
    } else if (config.mode === 'network-secrets') {
      await context.exposeBinding('__reproTestCsp', (_source, directive: unknown) => {
        if (typeof directive === 'string') channel.publish({ type: 'violation', directive });
      });
      await context.addInitScript(({ destination, secret }) => {
        document.addEventListener('securitypolicyviolation', event => {
          const report = (globalThis as unknown as { __reproTestCsp: (directive: string) => Promise<void> }).__reproTestCsp;
          void report(event.effectiveDirective);
        });
        document.addEventListener('DOMContentLoaded', () => {
          void fetch(destination, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ private: secret }) }).catch(() => undefined);
        });
      }, { destination: requiredString(config, 'destination'), secret: requiredString(config, 'secret') });
    } else if (config.mode === 'csp-final-action' || config.mode === 'csp-observation-read') {
      const phase = config.mode.slice('csp-'.length), destination = requiredString(config, 'destination');
      await context.exposeBinding('__reproTimingViolation', (_source, directive: unknown) => {
        if (typeof directive === 'string') channel.publish({ type: 'violation', directive });
      });
      await context.exposeBinding('__reproTimingAttempt', () => channel.publish({ type: 'attempt' }));
      await context.addInitScript(({ destination, phase }) => {
        const bindings = globalThis as unknown as { __reproTimingViolation: (directive: string) => Promise<void>; __reproTimingAttempt: () => Promise<void> };
        document.addEventListener('securitypolicyviolation', event => { void bindings.__reproTimingViolation(event.effectiveDirective); });
        if (phase === 'final-action') document.addEventListener('DOMContentLoaded', () => {
          document.querySelector('#editor')!.addEventListener('input', event => {
            if ((event.currentTarget as HTMLTextAreaElement).value !== 'second edit') return;
            void bindings.__reproTimingAttempt();
            void fetch(destination).catch(() => undefined);
          });
        });
      }, { destination, phase });
      if (phase === 'observation-read') {
        const page = context.pages()[0]!;
        const evaluate = page.evaluate.bind(page);
        page.evaluate = async (...evaluateArgs: Parameters<typeof evaluate>) => {
          // Preserve the native observation getter and inject at the same browser
          // task as the declared projection, without adding a timer or sleep.
          if (Array.isArray(evaluateArgs[1]) && evaluateArgs[1][0]?.selector === '#editor') {
            await evaluate(destination => {
              const editor = document.querySelector('#editor')!;
              const native = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!;
              Object.defineProperty(editor, 'value', {
                configurable: true,
                get() {
                  void (globalThis as unknown as { __reproTimingAttempt: () => Promise<void> }).__reproTimingAttempt();
                  void fetch(destination).catch(() => undefined);
                  return native.get!.call(this);
                },
                set(value: string) { native.set!.call(this, value); },
              });
            }, destination);
          }
          return evaluate(...evaluateArgs);
        };
      }
    } else if (config.mode !== 'observe-lifecycle') {
      throw new Error('Unsupported browser fixture mode.');
    }
    return context;
  };
}
