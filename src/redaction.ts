import { homedir, hostname, userInfo } from 'node:os';

/**
 * Report redaction for user-application evidence. It is a safeguard for logs,
 * diffs, remote URLs and free text that leave the machine inside REPRO.md, not
 * a guarantee that arbitrary private data is recognized. Every replacement is
 * counted by kind so the report can disclose what was removed.
 */
export type RedactionKind = 'private-key' | 'known-secret' | 'url-credentials' | 'jwt' | 'token' | 'authorization'
  | 'cookie' | 'assignment' | 'email' | 'card' | 'phone' | 'ip-address' | 'home-path' | 'hostname' | 'username';
export const REDACTION_LABELS: Record<RedactionKind, string> = {
  'private-key': 'private key block', 'known-secret': 'withheld input value', 'url-credentials': 'URL credentials',
  jwt: 'JSON web token', token: 'access token or API key', authorization: 'authorization header value', cookie: 'cookie value',
  assignment: 'secret-named value', email: 'email address', card: 'payment card number', phone: 'phone number',
  'ip-address': 'public IP address', 'home-path': 'home directory path', hostname: 'machine hostname', username: 'local username',
};
export interface Redactor {
  redact(text: string): string;
  counts(): Partial<Record<RedactionKind, number>>;
  total(): number;
}
/**
 * broad: logs and free text. code: source diffs and generated files, where
 * only high-confidence credentials, personal emails and paths are replaced so
 * ordinary identifiers such as tokenCount = 5 keep a patch applicable.
 */
export interface RedactorOptions { knownSecrets?: string[]; home?: string; username?: string; hostname?: string; mode?: 'broad' | 'code' }

const RESERVED_EMAIL_DOMAIN = /(?:^|\.)(?:example\.(?:com|net|org)|example|invalid|test|localhost)$/i;
const TOKEN_PATTERNS: RegExp[] = [
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g,
  /\bnpm_[A-Za-z0-9]{36}\b/g,
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
];
const SECRET_KEY = String.raw`[A-Za-z0-9_.-]*(?:passw(?:or)?d|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|session(?:[_-]?id)?|credential|auth(?:orization)?)[A-Za-z0-9_.-]*|sid|jsessionid|phpsessid|csrf[A-Za-z0-9_-]*`;
const ASSIGNMENT = new RegExp(String.raw`(["']?\b(?:${SECRET_KEY})\b["']?)(\s*[:=]\s*)(["']?)([^\s"',;&}\]]+)`, 'gi');
const CODE_SECRET_KEY = String.raw`[A-Za-z0-9_]*(?:passw(?:or)?d|secret|api[_-]?key|access[_-]?key|private[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|client[_-]?secret)[A-Za-z0-9_]*`;
const CODE_ASSIGNMENT = new RegExp(String.raw`(["']?\b(?:${CODE_SECRET_KEY})\b["']?\s*[:=]\s*)(["'\x60])([^"'\x60\s]{8,})\2`, 'gi');
const HARMLESS_VALUE = /^(?:true|false|null|undefined|none|\[redacted[^\]]*\]|\*+|\.\.\.)$/i;

function luhn(digits: string): boolean {
  let sum = 0, double = false;
  for (let index = digits.length - 1; index >= 0; index--) {
    let value = Number(digits[index]);
    if (double) { value *= 2; if (value > 9) value -= 9; }
    sum += value; double = !double;
  }
  return sum % 10 === 0;
}
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function privateIPv4(octets: number[]): boolean {
  const [a = 0, b = 0] = octets;
  return a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || a >= 224;
}

export function createRedactor(options: RedactorOptions = {}): Redactor {
  const counts: Partial<Record<RedactionKind, number>> = {};
  const count = (kind: RedactionKind) => { counts[kind] = (counts[kind] ?? 0) + 1; return `[redacted ${kind}]`; };
  const secrets = [...new Set((options.knownSecrets ?? []).filter(value => value.length >= 4))].sort((a, b) => b.length - a.length);
  const home = options.home ?? homedir();
  const user = options.username ?? userInfo().username;
  const host = options.hostname ?? hostname();
  const hostPattern = host.length >= 4 ? new RegExp(`\\b${escapeRegExp(host.replace(/\.local$/i, ''))}(?:\\.local)?\\b`, 'gi') : null;
  const broad = (options.mode ?? 'broad') === 'broad';
  function redact(input: string): string {
    let text = input;
    text = text.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g, () => count('private-key'));
    // A private-use marker keeps a replaced value from matching later patterns.
    for (const secret of secrets) text = text.split(secret).join('\uE000known\uE000');
    text = text.replace(/\uE000known\uE000/g, () => count('known-secret'));
    text = text.replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@'"]+)(?::[^/\s@'"]*)?@/gi, (_match, scheme: string) => `${scheme}${count('url-credentials')}@`);
    text = text.replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, () => count('jwt'));
    for (const pattern of TOKEN_PATTERNS) text = text.replace(pattern, () => count('token'));
    if (broad) {
      text = text.replace(/\b((?:proxy-)?authorization)(\s*[:=]\s*["']?)(?:(bearer|basic|token|digest|negotiate)\s+)?[^\s"',;]+/gi,
        (_match, name: string, separator: string, scheme?: string) => `${name}${separator}${scheme ? `${scheme} ` : ''}${count('authorization')}`);
      text = text.replace(/\b(set-cookie|cookie)(\s*[:=]\s*)[^\r\n]*/gi, (_match, name: string, separator: string) => `${name}${separator}${count('cookie')}`);
    }
    text = text.replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{16,}/gi, (_match, scheme: string) => `${scheme} ${count('authorization')}`);
    if (broad) text = text.replace(ASSIGNMENT, (match, key: string, separator: string, quote: string, value: string) =>
      HARMLESS_VALUE.test(value) ? match : `${key}${separator}${quote}${count('assignment')}`);
    else text = text.replace(CODE_ASSIGNMENT, (_match, prefix: string, quote: string) => `${prefix}${quote}${count('assignment')}${quote}`);
    text = text.replace(/\b[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})\b/g, (match, domain: string) => RESERVED_EMAIL_DOMAIN.test(domain) ? match : count('email'));
    if (broad) {
      text = text.replace(/\b(?:\d{4}[ -]){3}\d{1,7}\b|\b[3-6]\d{14,15}\b/g, match => {
        const digits = match.replace(/\D/g, '');
        return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? count('card') : match;
      });
      text = text.replace(/(?<![\w.-])(?:\+\d{1,3}[ .-]?)?(?:\(\d{3}\)\s?|\b\d{3}[.-])\d{3}[.-]\d{4}\b/g, () => count('phone'));
      text = text.replace(/\+\d{1,3}(?:[ .-]?\d{2,4}){3,5}\b/g, () => count('phone'));
      text = text.replace(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g, (match, ...parts: string[]) => {
        const octets = parts.slice(0, 4).map(Number);
        return octets.every(octet => octet <= 255) && !privateIPv4(octets) ? count('ip-address') : match;
      });
    }
    if (home && home.length > 1) text = text.split(home).join('~');
    text = text.replace(/\/(Users|home)\/([^/\s'"]+)/g, (match, root: string, name: string) => name === '~' || name === 'Shared' ? match : `/${root}/${count('home-path')}`);
    if (hostPattern) text = text.replace(hostPattern, () => count('hostname'));
    if (user && user.length >= 3) text = text.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(user)}(?![A-Za-z0-9])`, 'g'), () => count('username'));
    return text;
  }
  return { redact, counts: () => ({ ...counts }), total: () => Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0) };
}

/** Files whose content never enters a report patch; only their names are listed. */
export function isSensitiveFileName(path: string): boolean {
  const name = path.split('/').pop() ?? path;
  if (/^\.env\.(?:example|sample|template|defaults)$/i.test(name)) return false;
  return /^\.env(?:\..*)?$/i.test(name) || /\.(?:pem|key|p12|pfx|keystore|jks|kdbx|der|crt|cer|ovpn|ppk)$/i.test(name)
    || /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i.test(name) || /credential/i.test(name) || /secret/i.test(name)
    || /^(?:\.npmrc|\.yarnrc\.yml|\.pypirc|\.netrc|\.git-credentials|\.htpasswd|\.pgpass)$/i.test(name);
}

export type InputSensitivity = 'plain' | 'secret' | 'personal';
export interface FieldDescription { type?: string; autocomplete?: string; label?: string; name?: string }
/** Typed values that must be withheld from the report and supplied through an environment variable. */
export function classifyInput(value: string, field: FieldDescription = {}): InputSensitivity {
  const descriptor = `${field.label ?? ''} ${field.name ?? ''}`;
  if (field.type?.toLowerCase() === 'password' || /(?:^|\s)(?:current-password|new-password|one-time-code|cc-number|cc-csc|cc-exp)/i.test(field.autocomplete ?? '')
    || /passw(?:or)?d|passcode|\bpin\b|secret|token|api[ _-]?key|card number|\bcvc\b|\bcvv\b|security code|\bssn\b/i.test(descriptor)) return 'secret';
  const probe = createRedactor({ home: '/nonexistent-home', username: '', hostname: '' });
  const redacted = probe.redact(value);
  if (redacted === value) return 'plain';
  const kinds = Object.keys(probe.counts());
  return kinds.every(kind => kind === 'email' || kind === 'phone' || kind === 'ip-address') ? 'personal' : 'secret';
}

/** A URL suitable for a report line: no credentials, query or fragment. */
export function reportUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}${url.pathname}${url.search ? '?…' : ''}`;
  } catch { return '(unparseable URL)'; }
}
