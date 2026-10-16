// Controlled test processes only. No browser, inherited profile, or external network.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const [mode, directory, token] = process.argv.slice(2);
if (mode === 'launcher') {
  const owner = spawn(process.execPath, [__filename, 'owner', directory, token], {
    detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  let transferred = false, stopping = false, ownerClosed = false, force;
  const watchdog = setTimeout(() => stop(), 3000);
  const finish = code => { clearTimeout(watchdog); clearTimeout(force); process.exit(code); };
  const stop = () => {
    if (transferred || stopping) return;
    stopping = true;
    if (ownerClosed) { finish(1); return; }
    owner.kill('SIGTERM');
    force = setTimeout(() => owner.kill('SIGKILL'), 1000);
  };
  process.once('disconnect', stop); process.once('SIGTERM', stop);
  process.on('message', message => { if (message === 'stop') stop(); });
  owner.once('close', () => { ownerClosed = true; if (!transferred) finish(1); });
  owner.once('error', stop);
  owner.on('message', message => {
    if (stopping) return;
    if (message === 'handed-off') {
      transferred = true; owner.disconnect(); owner.unref(); finish(0); return;
    }
    process.send(message, error => {
      if (error) { stop(); return; }
      if (!stopping) owner.send('handoff', error => { if (error) stop(); });
    });
  });
} else if (mode === 'owner') {
  const file = path.join(directory, 'owned-use');
  const handle = fs.openSync(file, 'w');
  let stopping = false, transferred = false;
  const stop = () => {
    if (stopping) return;
    stopping = true; fs.closeSync(handle); server.closeAllConnections();
    server.close(() => process.exit(0));
  };
  process.once('disconnect', () => { if (!transferred) stop(); });
  process.once('SIGTERM', stop);
  process.on('message', message => {
    if (message === 'stop') stop();
    if (message === 'handoff') {
      transferred = true; process.send('handed-off', error => { if (error) stop(); });
    }
  });
  const server = http.createServer((request, response) => {
    response.setHeader('connection', 'close');
    if (request.method !== 'POST' || request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(403); response.end(); return;
    }
    if (request.url === '/probe') {
      try { fs.writeFileSync(file, 'controlled owner can still use this profile'); response.end('used'); }
      catch { response.writeHead(409); response.end('unavailable'); }
    } else if (request.url === '/stop') {
      response.end('stopping', stop);
    } else { response.writeHead(404); response.end(); }
  });
  server.once('error', () => { fs.closeSync(handle); process.exit(1); });
  server.listen(0, '127.0.0.1', () => process.send({ pid: process.pid, port: server.address().port }, error => { if (error) stop(); }));
  // A crashed test runner cannot leave this fixture running indefinitely.
  setTimeout(stop, 20_000).unref();
} else {
  throw new Error('Unknown controlled fixture mode');
}
