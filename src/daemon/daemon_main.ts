#!/usr/bin/env node
/**
 * Daemon background entry point.
 * This file is spawned as a detached child process by `agent-cyplex daemon start`.
 * It runs silently — all output goes to the log file.
 */

import { CyplexDaemon } from './daemon.js';

const args = process.argv.slice(2);
let socketPath = '/tmp/cyplex.sock';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--socket' && args[i + 1]) {
    socketPath = args[i + 1];
  }
}

const daemon = new CyplexDaemon({
  socketPath,
  pidFile: '/tmp/cyplex.pid',
  heartbeatIntervalMs: 5000,
  logLevel: process.env.CYPLEX_LOG_LEVEL || 'info',
  agents: {},
});

daemon.start().catch((err) => {
  console.error('Daemon failed to start:', err);
  process.exit(1);
});
