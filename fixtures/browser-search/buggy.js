// Registered synthetic frontend. The stale response defect is intentional.
const form = document.querySelector('#search');
const input = document.querySelector('#query');
const state = document.querySelector('#search-state');
const completed = [];
let latestRequestId = 0;
form.addEventListener('submit', async event => {
  event.preventDefault();
  const requestId = ++latestRequestId;
  const query = input.value;
  state.dataset.latestRequestId = String(requestId);
  document.querySelector('#latest-query').textContent = query;
  try {
    const response = await fetch(`/api/search?requestId=${requestId}&query=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Search service failed.');
    const payload = await response.json();
    const items = payload.results.map(value => {
      const item = document.createElement('li'); item.textContent = value; return item;
    });
    document.querySelector('#results').replaceChildren(...items);
    completed.push(requestId);
    state.dataset.completed = JSON.stringify(completed);
  } catch {
    document.querySelector('#error').textContent = 'The controlled search request failed.';
  }
});
