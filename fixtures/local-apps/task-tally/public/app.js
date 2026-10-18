// Remaining count is kept incrementally; see toggle().
const list = document.getElementById('tasks');
const remaining = document.getElementById('remaining');
const tasks = [];
let completedToggles = 0;
function render() {
  list.replaceChildren(...tasks.map(task => {
    const item = document.createElement('li');
    const box = document.createElement('input'); box.type = 'checkbox'; box.checked = task.done; box.setAttribute('aria-label', `Done: ${task.title}`);
    box.addEventListener('change', () => toggle(task));
    const label = document.createElement('span'); label.textContent = task.title;
    const remove = document.createElement('button'); remove.textContent = `Remove ${task.title}`;
    remove.addEventListener('click', () => { tasks.splice(tasks.indexOf(task), 1); if (task.done) completedToggles--; render(); });
    item.append(box, label, remove); return item;
  }));
  const left = tasks.length - completedToggles;
  remaining.textContent = `${left} ${left === 1 ? 'task' : 'tasks'} remaining`;
}
function toggle(task) {
  task.done = !task.done;
  // BUG: unchecking a task counts as another completion.
  completedToggles++;
  render();
}
document.getElementById('add-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.getElementById('title');
  const response = await fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: input.value }) });
  if (!response.ok) return;
  tasks.push(await response.json()); input.value = '';
  document.getElementById('saved').hidden = false;
  render();
});
console.log('session token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0YWxseSJ9.dGFsbHktY2FuYXJ5LXNpZw');
render();
