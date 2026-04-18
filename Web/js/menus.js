/**
 * Neon Architect — Menu System
 * Top menu bar (File/Edit/Selection/Terminal) and right-click context menus.
 */

import { $, getLangFromName, bus } from './utils.js';
import { openFile } from './tabs.js';
import { renameFile, deleteFileNode, promptNewFile, promptNewFolder } from './filetree.js';

let openMenu = null;

// ── Top Menu Bar ─────────────────────────────────────────────────────────
document.querySelectorAll('.menu-trigger').forEach(trigger => {
  trigger.addEventListener('click', e => {
    e.stopPropagation();
    const menuEl = trigger.parentElement;
    const dropdown = menuEl.querySelector('.menu-dropdown');
    if (openMenu === dropdown) {
      dropdown.classList.remove('active');
      openMenu = null;
      return;
    }
    if (openMenu) openMenu.classList.remove('active');
    dropdown.classList.add('active');
    openMenu = dropdown;
  });
});

document.addEventListener('click', () => {
  if (openMenu) { openMenu.classList.remove('active'); openMenu = null; }
  $('contextMenu')?.classList.remove('active');
});

// Menu item handlers dispatch through the event bus
document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (openMenu) { openMenu.classList.remove('active'); openMenu = null; }
    bus.emit('action:' + btn.dataset.action);
  });
});

// ── Context Menu ─────────────────────────────────────────────────────────
export function showContextMenu(e, type, path) {
  e.preventDefault();
  e.stopPropagation();
  const menu = $('contextMenu');
  const items = [];

  if (type === 'file') {
    items.push({
      label: 'Open',
      icon: 'open_in_new',
      action: () => {
        const name = path.split('/').pop();
        openFile(path, name, getLangFromName(name));
      },
    });
    items.push({ label: 'Rename', icon: 'edit', action: () => renameFile(path) });
    items.push({ label: 'Delete', icon: 'delete', action: () => deleteFileNode(path), danger: true });
  } else {
    items.push({ label: 'New File', icon: 'note_add', action: () => promptNewFile(path) });
    items.push({ label: 'New Folder', icon: 'create_new_folder', action: () => promptNewFolder(path) });
    items.push(null);
    items.push({ label: 'Rename', icon: 'edit', action: () => renameFile(path) });
    items.push({ label: 'Delete', icon: 'delete', action: () => deleteFileNode(path), danger: true });
  }

  menu.innerHTML = items
    .map(item => {
      if (!item) return '<div class="menu-separator"></div>';
      return `<button class="menu-item ${item.danger ? 'text-error' : ''}" data-ctx-action>
        <span class="flex items-center gap-2"><span class="material-symbols-outlined text-sm">${item.icon}</span>${item.label}</span>
      </button>`;
    })
    .join('');

  const buttons = menu.querySelectorAll('[data-ctx-action]');
  let btnIdx = 0;
  for (const item of items) {
    if (!item) continue;
    buttons[btnIdx].addEventListener('click', () => {
      menu.classList.remove('active');
      item.action();
    });
    btnIdx++;
  }

  // Position menu, keeping it in viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  menu.style.left = `${Math.min(e.clientX, vw - 200)}px`;
  menu.style.top = `${Math.min(e.clientY, vh - 200)}px`;
  menu.classList.add('active');
}
