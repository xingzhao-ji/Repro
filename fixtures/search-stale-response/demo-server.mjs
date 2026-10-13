import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const routes = new Map([
  ['/', ['demo.html', 'text/html; charset=utf-8']],
  ['/model.mjs', ['model.mjs', 'text/javascript; charset=utf-8']],
  ['/manifest.json', ['manifest.json', 'application/json; charset=utf-8']]
]);
export function createDemoServer() {
  return createServer(async (request, response) => {
    if (request.method !== 'GET') { response.writeHead(405); response.end('GET only'); return; }
    const route = routes.get(request.url);
    if (!route) { response.writeHead(404); response.end('Not found'); return; }
    try {
      const content = await readFile(new URL(route[0], import.meta.url));
      response.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'" });
      response.end(content);
    } catch { response.writeHead(500); response.end('Local fixture unavailable'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be 0–65535.');
  const server = createDemoServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Synthetic search fixture: http://127.0.0.1:${server.address().port}`));
}
