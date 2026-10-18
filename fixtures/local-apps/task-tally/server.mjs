// Repro test fixture. Deliberately logs a fake credential and a personal email so
// redaction can be tested; neither value is real.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const tasks = [];
const port = Number(process.env.PORT || 4100);
const host = process.env.HOST || '127.0.0.1';
console.log('Task tally starting with api_key=tt_live_0f1e2d3c4b5a69788796a5b4 for owner maria.gonzalez@gmail.com');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
createServer(async (request, response) => {
  const url = new URL(request.url, 'http://local');
  console.log(`${request.method} ${url.pathname} cookie=${request.headers.cookie ?? '-'}`);
  if (url.pathname === '/api/tasks' && request.method === 'GET') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(tasks)); return; }
  if (url.pathname === '/api/tasks' && request.method === 'POST') {
    let body = ''; for await (const chunk of request) body += chunk;
    const { title } = JSON.parse(body || '{}');
    if (!title) { response.statusCode = 400; response.end('title required'); return; }
    const task = { id: tasks.length + 1, title, done: false }; tasks.push(task);
    response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(task)); return;
  }
  const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (path.includes('..')) { response.statusCode = 404; response.end(); return; }
  try {
    const body = await readFile(join(root, path));
    response.setHeader('content-type', types[extname(path)] ?? 'application/octet-stream');
    response.setHeader('set-cookie', 'tally_session=7c1d55aa93b04e12; HttpOnly');
    response.end(body);
  } catch { response.statusCode = 404; response.end('not found'); }
}).listen(port, host, () => console.log(`Task tally listening on http://${host}:${port}`));
