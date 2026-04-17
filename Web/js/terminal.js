/**
 * Neon Architect — Terminal Emulator Module
 * Provides a simulated terminal with a small command set for
 * interacting with the virtual file system.
 */

import { $, escapeHtml, bus } from './utils.js';
import { fileSystem, getNode, fileContents } from './filesystem.js';

const termOutput = $('termOutput');
const termInput = $('termInput');
const termPanel = $('terminalPanel');

let cwd = '';
const history = [];
let historyIdx = -1;

/** Resolve a relative path against cwd */
function resolvePath(input) {
  if (!input || input === '.') return cwd;
  if (input === '/') return '';
  if (input === '..') {
    return cwd.substring(0, cwd.lastIndexOf('/'));
  }
  if (input.startsWith('/')) return input.slice(1);
  return cwd ? `${cwd}/${input}` : input;
}

/** Commands map: name → handler(args) */
const commands = {
  help: () => [
    'Available commands:',
    '  help            Show this help message',
    '  ls [path]       List files and directories',
    '  cat <file>      Print file contents',
    '  pwd             Show current directory',
    '  cd <path>       Change directory',
    '  clear           Clear terminal',
    '  echo <text>     Print text',
    '  date            Show current date and time',
    '  whoami          Print current user',
    '  tree            Show file tree',
    '  open <file>     Open a file in the editor',
    '  grep <term>     Search in file contents',
    '  version         Show Neon Architect version',
  ].join('\n'),

  ls: (args) => {
    const target = resolvePath(args[0]);
    const node = target ? getNode(target) : fileSystem;
    if (!node) return `ls: cannot access '${args[0]}': No such file or directory`;
    if (node._type === 'file') return args[0];
    const entries = Object.keys(node)
      .filter(k => !k.startsWith('_'))
      .map(k => {
        const isDir = node[k]._type === 'dir';
        return isDir ? `\x1b[34m${k}/\x1b[0m` : k;
      });
    return entries.join('  ') || '(empty)';
  },

  cat: (args) => {
    if (!args[0]) return 'cat: missing operand';
    const path = resolvePath(args[0]);
    const node = getNode(path);
    if (!node) return `cat: ${args[0]}: No such file or directory`;
    if (node._type === 'dir') return `cat: ${args[0]}: Is a directory`;
    return fileContents[path] ?? node._content ?? '';
  },

  pwd: () => '/' + cwd,

  cd: (args) => {
    if (!args[0] || args[0] === '/') { cwd = ''; return ''; }
    const target = resolvePath(args[0]);
    const node = getNode(target);
    if (!node) return `cd: no such directory: ${args[0]}`;
    if (node._type !== 'dir') return `cd: not a directory: ${args[0]}`;
    cwd = target;
    return '';
  },

  clear: () => { termOutput.innerHTML = ''; return null; },

  echo: (args) => args.join(' '),

  date: () => new Date().toString(),

  whoami: () => 'architect',

  tree: () => {
    const lines = [];
    function walk(node, prefix, depth) {
      const entries = Object.entries(node).filter(([k]) => !k.startsWith('_'));
      entries.forEach(([name, child], i) => {
        const isLast = i === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        lines.push(prefix + connector + name);
        if (child._type === 'dir') {
          walk(child, prefix + (isLast ? '    ' : '│   '), depth + 1);
        }
      });
    }
    lines.push('.');
    walk(fileSystem, '', 0);
    return lines.join('\n');
  },

  open: (args) => {
    if (!args[0]) return 'open: missing file';
    const path = resolvePath(args[0]);
    const node = getNode(path);
    if (!node) return `open: ${args[0]}: No such file`;
    if (node._type !== 'file') return `open: ${args[0]}: Not a file`;
    const name = path.split('/').pop();
    bus.emit('terminal:open', { path, name, lang: node._lang });
    return `Opened ${args[0]}`;
  },

  grep: (args) => {
    if (!args[0]) return 'grep: missing pattern';
    const pattern = args.join(' ');
    const results = [];
    for (const [path, content] of Object.entries(fileContents)) {
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (line.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(`${path}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    return results.length ? results.join('\n') : `No matches for "${pattern}"`;
  },

  version: () => 'Neon Architect v1.12.0',
};

/** Write a line to the terminal output */
function writeLine(text, className = 'text-on-surface-variant') {
  if (text === null || text === undefined) return;
  const div = document.createElement('div');
  div.className = className;
  // Basic ANSI color translation: \x1b[34m..\x1b[0m → blue
  const html = escapeHtml(String(text))
    .replace(/\\x1b\[34m/g, '<span class="text-primary">')
    .replace(/\\x1b\[31m/g, '<span class="text-error">')
    .replace(/\\x1b\[32m/g, '<span class="text-tertiary-dim">')
    .replace(/\\x1b\[0m/g, '</span>');
  div.innerHTML = html.replace(/\n/g, '<br>');
  termOutput.appendChild(div);
  termOutput.scrollTop = termOutput.scrollHeight;
}

/** Process a command string */
export function processCommand(input) {
  const trimmed = input.trim();
  if (!trimmed) return;

  history.push(trimmed);
  historyIdx = history.length;

  // Echo the prompt + command
  writeLine(`architect@neon:/${cwd}$ ${trimmed}`, 'text-tertiary-dim');

  const [cmd, ...args] = trimmed.split(/\s+/);
  const handler = commands[cmd];
  if (!handler) {
    writeLine(`command not found: ${cmd}. Type 'help' for a list of commands.`, 'text-error');
    return;
  }
  const output = handler(args);
  if (output !== null) writeLine(output);
}

/** Toggle the terminal panel visibility */
export function toggleTerminal() {
  termPanel.classList.toggle('hidden');
  if (!termPanel.classList.contains('hidden')) {
    termInput?.focus();
  }
}

// ── Event Wiring ─────────────────────────────────────────────────────────
termInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    processCommand(termInput.value);
    termInput.value = '';
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (historyIdx > 0) {
      historyIdx--;
      termInput.value = history[historyIdx] || '';
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIdx < history.length - 1) {
      historyIdx++;
      termInput.value = history[historyIdx] || '';
    } else {
      historyIdx = history.length;
      termInput.value = '';
    }
  } else if (e.key === 'l' && e.ctrlKey) {
    e.preventDefault();
    commands.clear();
  }
});

$('terminalClose')?.addEventListener('click', () => termPanel.classList.add('hidden'));

// Initial greeting
bus.on('terminal:init', () => {
  writeLine('Neon Architect Terminal v1.12.0', 'text-primary');
  writeLine("Type 'help' for available commands.", 'text-on-surface-variant');
});
