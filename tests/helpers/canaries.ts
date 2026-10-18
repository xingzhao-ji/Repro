/**
 * Fake credentials in real provider formats, assembled at runtime so that the
 * source itself never contains a token-shaped literal that scanners would flag.
 * None of these values is, or was ever, a real credential.
 */
const join = (...parts: string[]) => parts.join('');
export const CANARY = {
  stripeLive: join('sk', '_live_', '51ReproCanaryKey9d8f7a6b5c4e3d2f1a0b9c8d'),
  stripeTest: join('sk', '_test_', '1234567890abcdefXYZ'),
  github: join('gh', 'p_', 'ReproCanaryToken0123456789abcdefABCDEF01'),
  aws: join('AK', 'IA', 'IOSFODNN7EXAMPLE'),
} as const;
