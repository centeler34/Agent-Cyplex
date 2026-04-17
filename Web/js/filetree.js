/**
 * Neon Architect — File Tree Module
 * Renders the file explorer sidebar with expand/collapse,
 * file open, context menus, and new file/folder creation.
 */

import { $, getLangFromName, getFileIcon, showToast, bus } from './utils.js';
import { fileSystem, getNode, setNode, deleteNode, fileContents, dirty } from './filesystem.js';
import { openFile, closeTab, getOpenTabs } from './tabs.js';
import { getActiveTab, setActiveTab } from './editor.js';
import { showContextMenu } from './menus.js';

const fileTree = $('fileTree');

/** Render the entire file tree */
export function renderFileTree() {
  fileTree.innerHTML = '';
  renderDir(fileSystem, '', 0);
}

function renderDir(node, parentPath, depth) {
  const entries = Object.entries(node)
    .filter(([k]) => !k.startsWith('_'))
    .sort(([, a], [, b]) => {
      if (a._type === 'dir' && b._type !== 'dir') return -1;
      if (a._type !== 'dir' && b._type === 'dir') return 1;
      return 0;
    });

  for (const [name, child] of entries) {
    const fullPath = parentPath ? `${parentPath}/${name}` : name;
    const el = document.createElement('div');

    if (child._type === 'dir') {
      el.className = 'file-tree-item text-on-surface-variant select-none';
      el.style.paddingLeft = `${depth * 16 + 16}px`;
      el.innerHTML = `
        <span class="material-symbols-outlined text-sm">${child._expanded ? 'expand_more' : 'chevron_right'}</span>
        <span class="material-symbols-outlined text-sm">${child._expanded ? 'folder_open' : 'folder'}</span>
        <span class="flex-1">${name}</span>
      `;
      el.addEventListener('click', () => {
        child._expanded = !child._expanded;
        renderFileTree();
      });
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        showContextMenu(e, 'dir', fullPath);
      });
      fileTree.appendChild(el);

      if (child._expanded) {
        renderDir(child, fullPath, depth + 1);
      }
    } else {
      const isActive = getActiveTab() === fullPath;
      const isDirty = dirty.has(fullPath);
      const { icon, color } = getFileIcon(name, child._lang);

      el.className = `file-tree-item select-none ${
        isActive ? 'bg-surface-container-highest/50 text-on-surface' : 'text-on-surface-variant'
      }`;
      el.style.paddingLeft = `${depth * 16 + 32}px`;
      el.innerHTML = `
        <span class="material-symbols-outlined text-sm ${color}">${icon}</span>
        <span class="flex-1">${name}</span>
        ${isDirty ? '<div class="w-2 h-2 rounded-full bg-primary animate-pulse"></div>' : ''}
      `;
      el.addEventListener('click', () => {
        openFile(fullPath, name, child._lang || getLangFromName(name));
      });
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        showContextMenu(e, 'file', fullPath);
      });
      fileTree.appendChild(el);
    }
  }
}

// ── File Operations ──────────────────────────────────────────────────────
export function promptNewFile(basePath = '') {
  const name = prompt('Enter file name:');
  if (!name) return;
  const path = basePath ? `${basePath}/${name}` : name;
  setNode(path, { _type: 'file', _lang: getLangFromName(name), _content: '' });
  fileContents[path] = '';
  renderFileTree();
  openFile(path, name, getLangFromName(name));
  showToast(`Created ${name}`);
}

export function promptNewFolder(basePath = '') {
  const name = prompt('Enter folder name:');
  if (!name) return;
  const path = basePath ? `${basePath}/${name}` : name;
  setNode(path, { _type: 'dir', _expanded: true });
  renderFileTree();
  showToast(`Created folder ${name}`);
}

export function renameFile(path) {
  const oldName = path.split('/').pop();
  const newName = prompt('Rename to:', oldName);
  if (!newName || newName === oldName) return;

  const node = getNode(path);
  const parentPath = path.substring(0, path.lastIndexOf('/'));
  const newPath = parentPath ? `${parentPath}/${newName}` : newName;

  setNode(newPath, { ...node, _lang: getLangFromName(newName) });
  deleteNode(path);

  if (fileContents[path] !== undefined) {
    fileContents[newPath] = fileContents[path];
    delete fileContents[path];
  }

  // Update tabs
  const tabs = getOpenTabs();
  const tabIdx = tabs.findIndex(t => t.path === path);
  if (tabIdx >= 0) {
    tabs[tabIdx] = { path: newPath, name: newName, lang: getLangFromName(newName) };
    if (getActiveTab() === path) setActiveTab(newPath);
  }

  renderFileTree();
  bus.emit('tab:change', getActiveTab());
  showToast(`Renamed to ${newName}`);
}

export function deleteFileNode(path) {
  const name = path.split('/').pop();
  if (!confirm(`Delete "${name}"?`)) return;

  deleteNode(path);
  delete fileContents[path];
  dirty.delete(path);
  closeTab(path);
  renderFileTree();
  showToast(`Deleted ${name}`, 'delete');
}

// Listen for refresh events
bus.on('filetree:refresh', renderFileTree);
bus.on('dirty:change', renderFileTree);

// Button handlers
$('btnNewFile')?.addEventListener('click', () => promptNewFile());
$('btnNewFolder')?.addEventListener('click', () => promptNewFolder());
