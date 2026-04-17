/**
 * Neon Architect — Side Panel Manager
 * Switches between sidebar views (explorer, search, git, chat).
 */

import { $, bus } from './utils.js';

const PANELS = ['explorer', 'search', 'git', 'chat'];

let activePanel = 'explorer';

/** Show the given panel; hide the others */
export function showPanel(name) {
  if (!PANELS.includes(name)) return;
  activePanel = name;

  for (const panel of PANELS) {
    const el = $(`${panel}Panel`);
    const btn = $(`btn${capitalize(panel)}`);
    if (el) el.classList.toggle('hidden', panel !== name);
    if (btn) btn.classList.toggle('panel-active', panel === name);
  }

  bus.emit('panel:change', name);
}

export function getActivePanel() { return activePanel; }

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── Event Wiring ─────────────────────────────────────────────────────────
for (const panel of PANELS) {
  $(`btn${capitalize(panel)}`)?.addEventListener('click', () => showPanel(panel));
}

bus.on('action:open-explorer', () => showPanel('explorer'));
bus.on('action:open-search', () => showPanel('search'));
bus.on('action:open-git', () => showPanel('git'));
bus.on('action:open-chat', () => showPanel('chat'));

// Initialise
showPanel('explorer');
