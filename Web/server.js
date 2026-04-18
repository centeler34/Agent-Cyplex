#!/usr/bin/env node
/**
 * Neon Architect — Minimal static server for the web GUI.
 * Serves the Web/ directory so ES modules load correctly
 * (file:// breaks import statements).
 *
 * Usage:
 *   node server.js              # default port 7777, loopback only
 *   node server.js 3000         # custom port
 *   PORT=8080 node server.js
 *   HTTPS_KEY=./key.pem HTTPS_CERT=./cert.pem node server.js   # TLS
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const ROOT_REAL = fs.realpathSync(ROOT);

const PORT = parseInt(process.argv[2] || process.env.PORT || '7777', 10);
const HOST = process.env.HOST || '127.0.0.1';

// Loopback guard: cleartext HTTP is only acceptable over loopback. Refuse to
// bind to any non-loopback address unless HTTPS_KEY + HTTPS_CERT are configured.
// This blocks accidental LAN exposure of an unencrypted dev server.
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
if (!LOOPBACK_HOSTS.has(HOST) && !(process.env.HTTPS_KEY && process.env.HTTPS_CERT)) {
  console.error(
    `\x1b[31m[x]\x1b[0m Refusing to bind cleartext HTTP to non-loopback host ${HOST}.\n` +
    `    Either unset HOST, set HOST=127.0.0.1, or provide HTTPS_KEY + HTTPS_CERT to enable TLS.`,
  );
  process.exit(1);
}

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

const ALLOWED_EXT = new Set(Object.keys(MIME));

function safeResolve(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }

  const candidate = path.resolve(ROOT_REAL, '.' + decoded);
  const inRoot = (p) => p === ROOT_REAL || p.startsWith(ROOT_REAL + path.sep);
  if (!inRoot(candidate)) return null;

  try {
    const real = fs.realpathSync.native ? fs.realpathSync.native(candidate) : fs.realpathSync(candidate);
    return inRoot(real) ? real : null;
  } catch (err) {
    if (!err || err.code !== 'ENOENT') return null;
    const parent = path.dirname(candidate);
    try {
      const realParent = fs.realpathSync.native ? fs.realpathSync.native(parent) : fs.realpathSync(parent);
      if (!inRoot(realParent)) return null;
      const rebuilt = path.join(realParent, path.basename(candidate));
      return inRoot(rebuilt) ? rebuilt : null;
    } catch {
      return null;
    }
  }
}

// Token-bucket rate limiter keyed by remote IP. Bound to loopback by default,
// but added anyway so a misconfigured HOST=0.0.0.0 can't be DoS'd into the fs.
const RATE_CAPACITY = parseInt(process.env.RATE_CAPACITY || '60', 10);   // burst
const RATE_REFILL_PER_SEC = parseInt(process.env.RATE_REFILL_PER_SEC || '30', 10);
const buckets = new Map();
function takeToken(ip) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b) { b = { tokens: RATE_CAPACITY, ts: now }; buckets.set(ip, b); }
  const elapsed = (now - b.ts) / 1000;
  b.tokens = Math.min(RATE_CAPACITY, b.tokens + elapsed * RATE_REFILL_PER_SEC);
  b.ts = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [ip, b] of buckets) if (b.ts < cutoff) buckets.delete(ip);
}, 60_000).unref();

function sendStatus(res, code, message) {
  // Never echo client-controlled input into the body — it's a reflected-XSS
  // sink even with text/plain because of browser sniffing. Fixed strings only.
  res.writeHead(code, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  res.end(message);
}

function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendStatus(res, 405, 'Method Not Allowed');
  }

  const ip = req.socket.remoteAddress || 'unknown';
  if (!takeToken(ip)) return sendStatus(res, 429, 'Too Many Requests');

  const urlPath = req.url === '/' ? '/index.html' : req.url;
  let filePath = safeResolve(urlPath);
  if (!filePath) return sendStatus(res, 403, 'Forbidden');

  fs.stat(filePath, (err, stat) => {
    if (err) return sendStatus(res, 404, 'Not Found');

    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return sendStatus(res, 404, 'Not Found');

    fs.realpath(filePath, (err, realFilePath) => {
      if (err) return sendStatus(res, 404, 'Not Found');
      if (realFilePath !== ROOT_REAL && !realFilePath.startsWith(ROOT_REAL + path.sep)) {
        return sendStatus(res, 403, 'Forbidden');
      }

      fs.open(realFilePath, 'r', (err, fd) => {
        if (err) return sendStatus(res, 404, 'Not Found');

        fs.fstat(fd, (err, st) => {
          if (err || !st.isFile()) {
            fs.close(fd, () => {});
            return sendStatus(res, 404, 'Not Found');
          }

          fs.readFile(fd, (err, data) => {
            fs.close(fd, () => {});
            if (err) return sendStatus(res, 500, 'Server error');
            const type = MIME[ext];
            res.writeHead(200, {
              'Content-Type': type,
              'Cache-Control': 'no-cache',
              'X-Content-Type-Options': 'nosniff',
              'Referrer-Policy': 'no-referrer',
            });
            if (req.method === 'HEAD') return res.end();
            res.end(data);
          });
        });
      });
    });
  });
}

const HTTPS_KEY = process.env.HTTPS_KEY;
const HTTPS_CERT = process.env.HTTPS_CERT;

let server;
let scheme = 'http';
if (HTTPS_KEY && HTTPS_CERT) {
  server = https.createServer(
    { key: fs.readFileSync(HTTPS_KEY), cert: fs.readFileSync(HTTPS_CERT) },
    handler,
  );
  scheme = 'https';
} else {
  // deepcode ignore HttpToHttps: loopback-only dev server for serving the static Web/ bundle to the user's own browser (ES modules break over file://). The LOOPBACK_HOSTS guard at startup refuses to bind cleartext HTTP on any non-loopback host. Set HTTPS_KEY/HTTPS_CERT to enable TLS for LAN use.
  server = http.createServer(handler);
}

server.listen(PORT, HOST, () => {
  const url = `${scheme}://${HOST}:${PORT}/`;
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
