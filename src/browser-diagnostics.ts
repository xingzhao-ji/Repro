/** Public browser diagnostics never include raw launch logs or local paths. */
export function browserProbeFailure(error: unknown): { available: false; code: string; reason: string } {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (/No usable sandbox!|Chromium sandboxing failed!/.test(message)) {
    return {
      available: false,
      code: 'BROWSER_SANDBOX_UNAVAILABLE',
      reason: 'The host did not provide a usable Chromium sandbox. Keep the browser sandbox enabled and ask the environment owner to review the effective sandbox policy before retrying.',
    };
  }
  if (/Executable doesn't exist|\bChromium distribution\b[^\n]*\bnot found\b/i.test(message)) {
    return {
      available: false,
      code: 'BROWSER_UNAVAILABLE',
      reason: 'The selected browser executable is missing. Install the pinned browser using the documented setup and use the same browser path when running Repro.',
    };
  }
  if (/Host system is missing dependencies to run browsers|error while loading shared libraries/i.test(message)) {
    return {
      available: false,
      code: 'BROWSER_DEPENDENCIES_UNAVAILABLE',
      reason: 'Required browser system libraries are missing. Check the supported browser dependencies and install them only within the environment permissions.',
    };
  }
  return {
    available: false,
    code: 'BROWSER_PROBE_FAILED',
    reason: 'The sandboxed browser probe did not complete. The cause is not established; inspect the local failure evidence before retrying.',
  };
}
