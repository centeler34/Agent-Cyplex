/**
 * Neon Architect — Settings Module
 * Persists user preferences to localStorage and applies them
 * to the editor on load.
 */

import { $, bus } from './utils.js';

const STORAGE_KEY = 'neonArchitect:settings';

const defaults = {
  fontSize: 13,
  tabSize: 2,
  wordWrap: false,
  model: 'gpt-4',
  theme: 'dark',
  autoSave: false,
};

/** Load settings from localStorage */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

/** Save settings to localStorage */
export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to persist settings:', e);
  }
}

/** Apply settings to the DOM */
export function applySettings(settings) {
  const fontEl = $('settingFontSize');
  const tabEl = $('settingTabSize');
  const wrapEl = $('settingWordWrap');
  const modelEl = $('modelSelect');
  const codeEl = $('codeEditor');
  const gutterEl = $('lineNumbers');
  const fontLabel = $('fontSizeLabel');

  if (fontEl) fontEl.value = settings.fontSize;
  if (tabEl) tabEl.value = settings.tabSize;
  if (wrapEl) wrapEl.checked = settings.wordWrap;
  if (modelEl && settings.model) modelEl.value = settings.model;
  if (fontLabel) fontLabel.textContent = `${settings.fontSize}px`;

  const lh = `${Math.round(settings.fontSize * 1.6)}px`;
  if (codeEl) {
    codeEl.style.fontSize = `${settings.fontSize}px`;
    codeEl.style.lineHeight = lh;
    codeEl.style.whiteSpace = settings.wordWrap ? 'pre-wrap' : 'pre';
    codeEl.style.overflowWrap = settings.wordWrap ? 'break-word' : 'normal';
  }
  // Keep the gutter in lock-step so line-number row N aligns with text row N.
  if (gutterEl) {
    gutterEl.style.fontSize = `${settings.fontSize}px`;
    gutterEl.style.lineHeight = lh;
  }
}

/** Update a single setting and persist */
export function updateSetting(key, value) {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
  applySettings(settings);
  bus.emit('settings:change', { key, value, settings });
}

/** Toggle the settings modal */
export function toggleSettings() {
  $('settingsModal')?.classList.toggle('hidden');
}

// ── Initialisation ───────────────────────────────────────────────────────
const current = loadSettings();
applySettings(current);

// ── Event Wiring ─────────────────────────────────────────────────────────
$('settingFontSize')?.addEventListener('input', e => updateSetting('fontSize', parseInt(e.target.value)));
$('settingTabSize')?.addEventListener('change', e => updateSetting('tabSize', parseInt(e.target.value)));
$('settingWordWrap')?.addEventListener('change', e => updateSetting('wordWrap', e.target.checked));
$('modelSelect')?.addEventListener('change', e => updateSetting('model', e.target.value));

$('settingsClose')?.addEventListener('click', toggleSettings);
$('settingsOverlay')?.addEventListener('click', toggleSettings);
$('btnSettings')?.addEventListener('click', toggleSettings);

bus.on('action:settings', toggleSettings);
