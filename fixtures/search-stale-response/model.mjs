// SYNTHETIC TRAINING MODEL. No browser or external service is involved.
export function createSearchModel({ mode = 'buggy' } = {}) {
  if (!['buggy', 'fixed'].includes(mode)) throw new Error(`Unknown mode: ${mode}`);
  const state = { latestRequestId: null, query: '', results: [] };
  return {
    issue({ id, query }) {
      state.latestRequestId = id;
      state.query = query;
    },
    receive({ requestId, results }) {
      if (mode === 'fixed' && requestId !== state.latestRequestId) return;
      state.results = [...results];
    },
    snapshot() { return structuredClone(state); }
  };
}
export function replay(inputs, mode) {
  const model = createSearchModel({ mode });
  for (const request of inputs.requests) model.issue(request);
  for (const response of inputs.responses) model.receive(response);
  return model.snapshot();
}
