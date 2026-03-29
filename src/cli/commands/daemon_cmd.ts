/**
 * `cyplex daemon` subcommands — start, stop, restart, status, logs.
 */

import type { Command } from 'commander';
import { sendIpcMessage } from '../ipc_client.js';

export function registerDaemonCommands(program: Command): void {
  const daemon = program.command('daemon').description('Manage the Cyplex daemon');

  daemon
    .command('start')
    .description('Start the Cyplex daemon')
    .option('--socket <path>', 'Unix socket path', '/tmp/cyplex.sock')
    .action(async (opts) => {
      console.log(`Starting daemon (socket: ${opts.socket})...`);
      // In production, this forks the daemon process
      const { CyplexDaemon } = await import('../../daemon/daemon.js');
      const daemon = new CyplexDaemon({
        socketPath: opts.socket,
        pidFile: '/tmp/cyplex.pid',
        heartbeatIntervalMs: 5000,
        logLevel: 'info',
        agents: {},
      });
      await daemon.start();
    });

  daemon
    .command('stop')
    .description('Stop the Cyplex daemon')
    .option('--drain', 'Wait for in-flight tasks before stopping')
    .action(async (opts) => {
      console.log('Stopping daemon...');
      const response = await sendIpcMessage({ id: crypto.randomUUID(), type: 'daemon_stop', payload: { drain: opts.drain } });
      console.log('Daemon stopped:', response?.payload);
    });

  daemon
    .command('restart')
    .description('Restart the Cyplex daemon')
    .action(async () => {
      console.log('Restarting daemon...');
      await sendIpcMessage({ id: crypto.randomUUID(), type: 'daemon_restart', payload: {} });
    });

  daemon
    .command('status')
    .description('Show daemon health and status')
    .action(async () => {
      const response = await sendIpcMessage({ id: crypto.randomUUID(), type: 'daemon_status', payload: {} });
      if (response) {
        console.log(JSON.stringify(response.payload, null, 2));
      } else {
        console.log('Daemon is not running');
      }
    });

  daemon
    .command('logs')
    .description('Tail daemon logs')
    .option('-n <lines>', 'Number of lines', '50')
    .action(async (opts) => {
      console.log(`Tailing last ${opts.n} lines of daemon logs...`);
    });
}
