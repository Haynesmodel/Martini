#!/usr/bin/env node
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'dist');
const prefix = '/Martini/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.avif': 'image/avif', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.map': 'application/json' };
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (!url.pathname.startsWith(prefix)) { response.writeHead(404); response.end('Not Found'); return; }
  let relative = decodeURIComponent(url.pathname.slice(prefix.length));
  if (!relative || relative.endsWith('/')) relative += 'index.html';
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404); response.end('Not Found'); return; }
  response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' }); fs.createReadStream(target).pipe(response);
});
server.listen(4173, '127.0.0.1', () => console.log('Martini production preview: http://127.0.0.1:4173/Martini/'));
