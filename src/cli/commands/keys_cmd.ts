/**
 * `cyplex keys` subcommands.
 */

import type { Command } from 'commander';
import path from 'node:path';
import { KeystoreBridge } from '../../security/keystore_bridge.js';

const KEYSTORE_PATH = path.join(process.env.HOME || '~', '.cyplex', 'keystore.enc');

export function registerKeysCommands(program: Command): void {
  const keys = program.command('keys').description('API key management');

  keys.command('set')
    .description('Set a key in the encrypted keystore')
    .requiredOption('--name <name>', 'Key name')
    .option('--value <value>', 'Key value (will prompt if omitted)')
    .option('--file <path>', 'Read key from file')
    .action(async (opts) => {
      const readline = await import('node:readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      const password = await new Promise<string>((resolve) => {
        rl.question('Master password: ', (answer) => { rl.close(); resolve(answer); });
      });

      const keystore = new KeystoreBridge();
      await keystore.open(KEYSTORE_PATH, password);

      let value = opts.value;
      if (opts.file) {
        const fs = await import('node:fs');
        value = fs.readFileSync(opts.file, 'utf-8').trim();
      }

      keystore.set(opts.name, value);
      keystore.save(KEYSTORE_PATH);
      console.log(`Key "${opts.name}" saved`);
    });

  keys.command('list').description('List stored keys').action(async () => {
    const readline = await import('node:readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const password = await new Promise<string>((resolve) => {
      rl.question('Master password: ', (answer) => { rl.close(); resolve(answer); });
    });

    const keystore = new KeystoreBridge();
    await keystore.open(KEYSTORE_PATH, password);
    const names = keystore.list();
    console.log('Stored keys:', names.join(', '));
  });

  keys.command('rotate')
    .description('Rotate a key')
    .requiredOption('--provider <name>', 'Key name to rotate')
    .action(async (opts) => {
      console.log(`Rotating key: ${opts.provider}`);
    });

  keys.command('delete <name>').description('Delete a key').action(async (name) => {
    console.log(`Deleting key: ${name}`);
  });
}
