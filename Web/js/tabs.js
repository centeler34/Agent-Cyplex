/**
 * Neon Architect — Tab Management Module
 * Handles opening, closing, switching, and rendering editor tabs.
 */

import { $, getFileIcon, bus } from './utils.js';
import { dirty } from './filesystem.js';
import { loadEditor, showWelcome, getActiveTab, setActiveTab } from './editor.js';

/** All currently open tabs */
const openTabs = [];

// Expose tabs globally for cross-module access
window.__neonTabs = openTabs;

const editorTabs = $('editorTabs');

/** Open a file in a new or existing tab */
export function openFile(path, name, lang) {
  if (!openTabs.find(t => t.path === path)) {
    openTabs.push({ path, name, lang });
  }
  setActiveTab(path);
  renderTabs();
  loadEditor(path);
  bus.emit('tab:change', path);
  bus.emit('filetree:refresh');
}

/** Close a tab */
export function closeTab(path, ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  const idx = openTabs.findIndex(t => t.path === path);
  if (idx < 0) return;
  openTabs.splice(idx, 1);
  if (getActiveTab() === path) {
    const newActive = openTabs.length > 0
      ? openTabs[Math.min(idx, openTabs.length - 1)].path
      : null;
    setActiveTab(newActive);
  }
  renderTabs();
  if (getActiveTab()) loadEditor(getActiveTab());
  else showWelcome();
  bus.emit('tab:change', getActiveTab());
  bus.emit('filetree:refresh');
}

/** Get all open tabs */
export function getOpenTabs() { return openTabs; }

/** Render all tabs in the tab bar */
export function renderTabs() {
  editorTabs.innerHTML = '';
  const activeTab = getActiveTab();

  for (const tab of openTabs) {
    const el = document.createElement('div');
    const isActive = tab.path === activeTab;
    const isDirty = dirty.has(tab.path);
    const { icon, color } = getFileIcon(tab.name, tab.lang);

    el.className = `editor-tab flex items-center gap-2 px-3 cursor-pointer text-xs border-t-2 shrink-0 ${
      isActive
        ? 'bg-surface text-on-surface border-primary h-full'
        : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high border-transparent h-[85%]'
    }`;

    const iconEl = document.createElement('span');
    iconEl.className = `material-symbols-outlined text-sm ${color}`;
    iconEl.textContent = icon;

    const nameEl = document.createElement('span');
    nameEl.textContent = `${tab.name}${isDirty ? ' *' : ''}`;

    const closeEl = document.createElement('span');
    closeEl.className = 'material-symbols-outlined text-[10px] tab-close hover:text-error transition-colors';
    closeEl.dataset.close = tab.path;
    closeEl.textContent = 'close';

    el.appendChild(iconEl);
    el.appendChild(nameEl);
    el.appendChild(closeEl);

    el.addEventListener('click', () => {
      setActiveTab(tab.path);
      renderTabs();
      loadEditor(tab.path);
      bus.emit('tab:change', tab.path);
      bus.emit('filetree:refresh');
    });

    closeEl.addEventListener('click', e => closeTab(tab.path, e));
    editorTabs.appendChild(el);
  }
}

// Re-render tabs when dirty state changes
bus.on('dirty:change', renderTabs);
bus.on('editor:change', renderTabs);
