/**
 * Neon Architect — Main Entry Point
 * Imports all modules, wires up cross-cutting actions,
 * and initialises the default UI state on load.
 */

import { $, bus, showToast } from './utils.js';
import { saveAllFiles, exportProject } from './filesystem.js';
import { renderFileTree, promptNewFile, promptNewFolder } from './filetree.js';
import { renderTabs, openFile, getOpenTabs, closeTab } from './tabs.js';
import { loadEditor, getActiveTab, showWelcome, toggleFindBar, selectCurrentLine } from './editor.js';
import { addAIMessage, sendChat } from './chat.js';
import { processCommand, toggleTerminal } from './terminal.js';
import { toggleSearchPanel, runSearch } from './search.js';
import { toggleSettings } from './settings.js';
import { renderGit, toggleGitPanel } from './git.js';
import { getShortcuts } from './shortcuts.js';
import { openLocalFiles, openLocalFolder } from './localfs.js';
import { toggleTheme } from './theme.js';
import './panels.js';
import './menus.js';

// ── Boot Sequence ────────────────────────────────────────────────────────
function boot() {
  renderFileTree();
  renderTabs();
  renderGit();
  showWelcome();

  bus.emit('terminal:init');
  addAIMessage('Welcome to Neon Architect. I\'m your AI pair programmer — ask me anything about the project, and I can help you design, debug, or refactor.');

  wireGlobalActions();
  wireWelcomeButtons();
  wireTerminalOpen();
  showToast('Neon Architect ready', 'check');
}

// ── Cross-cutting Actions ────────────────────────────────────────────────
function wireGlobalActions() {
  // File menu actions
  bus.on('action:new-file', () => promptNewFile());
  bus.on('action:new-folder', () => promptNewFolder());
  bus.on('action:open-file', () => openLocalFiles());
  bus.on('action:open-folder', () => openLocalFolder());
  bus.on('action:save', () => {
    const path = getActiveTab();
    if (!path) return showToast('No file open', 'warning');
    bus.emit('file:save', path);
    showToast(`Saved ${path.split('/').pop()}`, 'check');
  });
  bus.on('action:save-all', () => {
    const n = saveAllFiles();
    showToast(`Saved ${n} files`, 'check');
  });
  bus.on('action:export', () => {
    exportProject();
    showToast('Exported project', 'download');
  });
  bus.on('action:close-tab', () => {
    const path = getActiveTab();
    if (path) closeTab(path);
  });
  bus.on('action:close-all', () => {
    const tabs = [...getOpenTabs()];
    for (const t of tabs) closeTab(t.path);
  });

  // Edit menu
  bus.on('action:find', toggleFindBar);
  bus.on('action:search', toggleSearchPanel);
  bus.on('action:undo', () => document.execCommand('undo'));
  bus.on('action:redo', () => document.execCommand('redo'));
  bus.on('action:select-line', selectCurrentLine);
  bus.on('action:select-all', () => {
    const e = $('codeEditor');
    if (e) { e.focus(); e.select(); }
  });

  // View menu
  bus.on('action:toggle-terminal', toggleTerminal);
  bus.on('action:toggle-git', toggleGitPanel);
  bus.on('action:toggle-theme', toggleTheme);
  bus.on('action:settings', toggleSettings);

  // Terminal opens file → route through tabs
  bus.on('terminal:open', ({ path, name, lang }) => {
    openFile(path, name, lang);
  });

  // Editor goto line (from search)
  bus.on('editor:goto-line', line => {
    const editor = $('codeEditor');
    if (!editor) return;
    const lines = editor.value.split('\n');
    let pos = 0;
    for (let i = 0; i < Math.min(line - 1, lines.length); i++) {
      pos += lines[i].length + 1;
    }
    editor.focus();
    editor.setSelectionRange(pos, pos);
    editor.scrollTop = Math.max(0, (line - 5) * 24);
  });
}

function wireWelcomeButtons() {
  $('welcomeNewFile')?.addEventListener('click', () => promptNewFile());
  $('welcomeOpenFile')?.addEventListener('click', () => openLocalFiles());
  $('welcomeOpenFolder')?.addEventListener('click', () => openLocalFolder());
  $('welcomeAskAI')?.addEventListener('click', () => $('chatInput')?.focus());
}

function wireTerminalOpen() {
  $('btnTerminal')?.addEventListener('click', toggleTerminal);
}

// ── Error Surface ────────────────────────────────────────────────────────
window.addEventListener('error', e => {
  console.error('[Neon Architect]', e.error || e.message);
  showToast('Something went wrong — see console', 'error');
});

window.addEventListener('unhandledrejection', e => {
  console.error('[Neon Architect] promise rejection:', e.reason);
});

// ── Expose Public API for Debug ──────────────────────────────────────────
window.NeonArchitect = {
  bus,
  getActiveTab,
  openFile,
  closeTab,
  getOpenTabs,
  processCommand,
  runSearch,
  getShortcuts,
  version: '1.13.1',
};

// Go!
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
