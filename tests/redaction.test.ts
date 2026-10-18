import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyInput, createRedactor, isSensitiveFileName, reportUrl } from '../src/redaction.js';
import { CANARY } from './helpers/canaries.js';

const fixed = { home: '/Users/alex', username: 'alex', hostname: 'alex-laptop.local' };

test('broad redaction removes credentials, personal data and machine identity from log text', () => {
  const canaries = {
    stripe: CANARY.stripeLive,
    github: CANARY.github,
    aws: CANARY.aws,
    jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJyZXByby1jYW5hcnkifQ.c2lnbmF0dXJlLWNhbmFyeQ',
    session: 'repro-canary-session-secret-7f3a91',
    cookie: 'sid=8f3a9b1c2d4e5f60718293a4b5c6d7e8',
    email: 'maria.gonzalez@gmail.com',
    card: '4242 4242 4242 4242',
    phone: '(415) 555-0134',
    ip: '203.0.113.77',
  };
  const log = [
    `Payment provider key: ${canaries.stripe}`,
    `git remote https://repro-canary-user:${canaries.github}@git.example.invalid/cafe/cafe-orders.git`,
    `aws_access_key_id=${canaries.aws}`,
    `auth token ${canaries.jwt}`,
    `SESSION_SECRET=${canaries.session}`,
    `GET /orders Cookie: ${canaries.cookie}`,
    `Authorization: Bearer abcdefghijklmnop123456`,
    `signed in ${canaries.email} from ${canaries.ip}`,
    `card ${canaries.card} phone ${canaries.phone}`,
    `-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----`,
    'cwd /Users/alex/projects/cafe on alex-laptop.local',
  ].join('\n');
  const redactor = createRedactor(fixed);
  const output = redactor.redact(log);
  for (const [name, value] of Object.entries(canaries)) assert.equal(output.includes(value), false, `${name} canary survived: ${output}`);
  assert.equal(output.includes('abcdefghijklmnop123456'), false);
  assert.equal(output.includes('MIIEow'), false);
  assert.equal(output.includes('alex'), false, output);
  assert.match(output, /cwd ~\/projects\/cafe/);
  const counts = redactor.counts();
  for (const kind of ['token', 'url-credentials', 'jwt', 'assignment', 'cookie', 'authorization', 'email', 'ip-address', 'card', 'phone', 'private-key', 'hostname'] as const) {
    assert.ok((counts[kind] ?? 0) > 0, `expected a ${kind} redaction`);
  }
  assert.ok(redactor.total() >= 12);
});

test('redaction keeps ordinary diagnostics, loopback addresses, versions and reserved example emails', () => {
  const text = 'GET http://127.0.0.1:5173/api/items 404 Not Found; Chromium 156.0.8078.4; 2026-10-18T01:02:03Z; demo barista@example.com; 3 items left; token: true; listening on 10.0.0.4';
  const redactor = createRedactor(fixed);
  assert.equal(redactor.redact(text), text);
  assert.equal(redactor.total(), 0);
});

test('code mode keeps applicable source edits but still removes high-confidence secrets', () => {
  const diff = [
    '+const tokenCount = items.length;',
    '+const passwordField = document.querySelector("#password");',
    '+const API_KEY = "a1b2c3d4e5f6a7b8c9d0";',
    '+fetch(url, { headers: { Authorization: `Bearer ${token}` } });',
    '+// contact jane.doe@corp-mail.com',
    `+const stripe = "${CANARY.stripeTest}";`,
  ].join('\n');
  const output = createRedactor({ ...fixed, mode: 'code' }).redact(diff);
  assert.match(output, /const tokenCount = items\.length;/);
  assert.match(output, /const passwordField = document\.querySelector\("#password"\);/);
  assert.match(output, /Authorization: `Bearer \$\{token\}`/);
  assert.equal(output.includes('a1b2c3d4e5f6a7b8c9d0'), false);
  assert.equal(output.includes('jane.doe@corp-mail.com'), false);
  assert.equal(output.includes(CANARY.stripeTest), false);
});

test('known withheld input values are removed wherever they appear, longest first', () => {
  const redactor = createRedactor({ ...fixed, knownSecrets: ['correct-horse-battery-staple', 'horse'] });
  const output = redactor.redact('typed correct-horse-battery-staple then horse');
  assert.equal(output, 'typed [redacted known-secret] then [redacted known-secret]');
});

test('sensitive file names are excluded from patches, examples are not', () => {
  for (const name of ['.env', '.env.local', 'config/.env.production', 'certs/server.pem', 'id_ed25519', 'aws-credentials.json', 'secrets.yaml', '.npmrc', 'deploy.key'])
    assert.equal(isSensitiveFileName(name), true, name);
  for (const name of ['.env.example', 'src/App.jsx', 'README.md', 'package.json', 'src/tokens.css'])
    assert.equal(isSensitiveFileName(name), false, name);
});

test('typed inputs are classified as secret, personal or plain', () => {
  assert.equal(classifyInput('correct-horse-battery-staple', { type: 'password' }), 'secret');
  assert.equal(classifyInput('hunter2', { label: 'Password' }), 'secret');
  assert.equal(classifyInput('123456', { autocomplete: 'one-time-code' }), 'secret');
  assert.equal(classifyInput(CANARY.github), 'secret');
  assert.equal(classifyInput('maria.gonzalez@gmail.com', { label: 'Email' }), 'personal');
  assert.equal(classifyInput('barista@example.com', { label: 'Email' }), 'plain');
  assert.equal(classifyInput('Milk', { label: 'Add an item' }), 'plain');
  assert.equal(classifyInput('WELCOME10', { label: 'Discount code' }), 'plain');
});

test('report URLs drop credentials, query strings and fragments', () => {
  assert.equal(reportUrl('https://user:pass@api.example.com/v1/items?token=abc#x'), 'https://api.example.com/v1/items?…');
  assert.equal(reportUrl('http://127.0.0.1:3000/orders'), 'http://127.0.0.1:3000/orders');
  assert.equal(reportUrl('not a url'), '(unparseable URL)');
});
