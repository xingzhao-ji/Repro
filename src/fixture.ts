import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ReproError } from './contracts.js';

const page = readFileSync(new URL('../fixtures/browser-search/page.html', import.meta.url), 'utf8');
const registered = {
  buggy: readFileSync(new URL('../fixtures/browser-search/buggy.js', import.meta.url), 'utf8'),
  fixed: readFileSync(new URL('../fixtures/browser-search/fixed.js', import.meta.url), 'utf8'),
};
export function fixtureSource(revision: 'buggy' | 'fixed'): string {
  if (revision !== 'buggy' && revision !== 'fixed') throw new ReproError('unsupported', 'UNREGISTERED_REVISION', 'Only the registered buggy and fixed synthetic frontends can execute.');
  return page.replace('/* REGISTERED_APPLICATION */', registered[revision]);
}
export function fixtureDigest(revision: 'buggy' | 'fixed'): string {
  return createHash('sha256').update(fixtureSource(revision)).digest('hex');
}
