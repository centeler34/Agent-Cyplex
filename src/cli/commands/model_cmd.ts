/**
 * `cyplex model` subcommands — local AI backend management.
 */

import type { Command } from 'commander';

export function registerModelCommands(program: Command): void {
  const model = program.command('model').description('Local AI model management');

  model.command('list').description('List available models')
    .option('--provider <name>', 'Filter by provider')
    .action(async (opts) => {
      if (opts.provider) {
        console.log(`Models for ${opts.provider}:`);
      } else {
        console.log('All configured model providers:');
      }
    });

  model.command('test').description('Test model connectivity')
    .option('--provider <name>', 'Provider to test')
    .action(async (opts) => {
      console.log(`Testing connectivity to ${opts.provider || 'all providers'}...`);
    });

  model.command('pull <provider> <model>').description('Pull a model (Ollama only)').action(async (provider, modelName) => {
    console.log(`Pulling ${modelName} via ${provider}...`);
  });

  // Tunnel management
  const tunnels = model.command('tunnels').description('SSH tunnel management');

  tunnels.command('list').description('Show all SSH tunnels').action(async () => {
    console.log('Configured SSH tunnels:');
  });

  tunnels.command('test <name>').description('Test tunnel connectivity').action(async (name) => {
    console.log(`Testing tunnel: ${name}`);
  });

  tunnels.command('reconnect').description('Force reconnect all tunnels').action(async () => {
    console.log('Reconnecting all SSH tunnels...');
  });
}
