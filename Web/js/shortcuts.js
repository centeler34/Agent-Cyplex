/**
 * Neon Architect — Keyboard Shortcuts Module
 * Centralizes all global keybindings. Each shortcut dispatches
 * through the event bus so handlers remain modular.
 */

import { bus, showToast } from './utils.js';
import { promptNewFile, promptNewFolder } from './filetree.js';
import { closeTab, getOpenTabs } from './tabs.js';
import { getActiveTab, toggleFindBar, selectCurrentLine } from './editor.js';
import { saveFileContent, saveAllFiles } from './filesystem.js';
import { toggleTerminal } from './terminal.js';
import { toggleSearchPanel } from './search.js';
import { toggleSettings } from './settings.js';

const SHORTCUTS = [
  { key: 'n', ctrl: true, description: 'New file', run: () => promptNewFile() },
  { key: 'n', ctrl: true, shift: true, description: 'New folder', run: () => promptNewFolder() },
  { key: 's', ctrl: true, description: 'Save current file', run: () => {
      const path = getActiveTab();
      if (!path) return showToast('No file open', 'warning');
      saveFileContent(path);
      showToast(`Saved ${path.split('/').pop()}`, 'check');
    }
  },
  { key: 's', ctrl: true, shift: true, description: 'Save all files', run: () => {
      const n = saveAllFiles();
      showToast(`Saved ${n} file${n === 1 ? '' : 's'}`, 'check');
    }
  },
  { key: 'w', ctrl: true, description: 'Close current tab', run: () => {
      const path = getActiveTab();
      if (path) closeTab(path);
    }
  },
  { key: 'f', ctrl: true, description: 'Find in file', run: toggleFindBar },
  { key: 'f', ctrl: true, shift: true, description: 'Find in project', run: toggleSearchPanel },
  { key: '`', ctrl: true, description: 'Toggle terminal', run: toggleTerminal },
  { key: 'l', ctrl: true, description: 'Select current line', run: selectCurrentLine },
  { key: ',', ctrl: true, description: 'Open settings', run: toggleSettings },
  { key: 'k', ctrl: true, description: 'Focus chat', run: () => {
      document.getElementById('chatInput')?.focus();
    }
  },
  { key: 'p', ctrl: true, description: 'Quick open (search)', run: toggleSearchPanel },
  { key: '/', ctrl: true, description: 'Show shortcut help', run: () => showHelpToast() },
];

/** Display a toast listing the top shortcuts */
function showHelpToast() {
  bus.emit('shortcuts:help');
  showToast('See the Help menu for all shortcuts', 'info');
}

/** Match a keyboard event against our shortcut list */
function matches(sc, e) {
  if (sc.key.toLowerCase() !== e.key.toLowerCase()) return false;
  if (sc.ctrl && !(e.ctrlKey || e.metaKey)) return false;
  if (!sc.ctrl && (e.ctrlKey || e.metaKey)) return false;
  if (sc.shift && !e.shiftKey) return false;
  if (!sc.shift && e.shiftKey) return false;
  if (sc.alt && !e.altKey) return false;
  return true;
}

/** Global keydown listener */
document.addEventListener('keydown', e => {
  for (const sc of SHORTCUTS) {
    if (matches(sc, e)) {
      e.preventDefault();
      sc.run();
      return;
    }
  }

  // Escape closes open overlays/panels
  if (e.key === 'Escape') {
    document.getElementById('findBar')?.classList.add('hidden');
    document.getElementById('settingsModal')?.classList.add('hidden');
    document.getElementById('contextMenu')?.classList.remove('active');
  }
});

/** Expose shortcut list for help modal */
export function getShortcuts() {
  return SHORTCUTS.map(sc => ({
    combo: [sc.ctrl && 'Ctrl', sc.shift && 'Shift', sc.alt && 'Alt', sc.key.toUpperCase()]
      .filter(Boolean).join('+'),
    description: sc.description,
  }));
}
