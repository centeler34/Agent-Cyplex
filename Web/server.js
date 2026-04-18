#!/usr/bin/env node
/**
 * Neon Architect — Minimal static server for the web GUI.
 * Serves the Web/ directory so ES modules load correctly
 * (file:// breaks import statements).
 *
 * Usage:
 *   node server.js              # default port 7777
 *   node server.js 3000         # custom port
 *   PORT=8080 node server.js
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

const PORT = parseInt(process.argv[2] || process.env.PORT || '7777', 10);
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.md':   'text/markdown; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const resolved = path.normalize(path.join(ROOT, decoded));
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  let urlPath = req.url === '/' ? '/index.html' : req.url;
  let filePath = safeResolve(urlPath);
  if (!filePath) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.stat(filePath, (err, stat) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${urlPath}`);
      return;
    }
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Server error');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(data);
    });
  });
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log('');
  console.log('  \x1b[36m┌──────────────────────────────────────────┐\x1b[0m');
  console.log('  \x1b[36m│\x1b[0m  \x1b[1mNeon Architect — Web GUI\x1b[0m                \x1b[36m│\x1b[0m');
  console.log('  \x1b[36m│\x1b[0m                                          \x1b[36m│\x1b[0m');
  console.log(`  \x1b[36m│\x1b[0m  ${url.padEnd(40)}\x1b[36m│\x1b[0m`);
  console.log('  \x1b[36m│\x1b[0m                                          \x1b[36m│\x1b[0m');
  console.log('  \x1b[36m│\x1b[0m  Press Ctrl+C to stop                    \x1b[36m│\x1b[0m');
  console.log('  \x1b[36m└──────────────────────────────────────────┘\x1b[0m');
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\x1b[31m[x]\x1b[0m Port ${PORT} is already in use.`);
    console.error(`    Try: node ${path.relative(process.cwd(), __filename)} <different-port>`);
  } else {
    console.error(`\x1b[31m[x]\x1b[0m Server error:`, err.message);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n\x1b[36m[*]\x1b[0m Shutting down web GUI...');
  server.close(() => process.exit(0));
});
