/**
 * Neon Architect — Theme Toggle
 * Flips the <html> class between `dark` and `light`, persists the choice to
 * localStorage, and keeps the header icon in sync.
 *
 * The initial class is applied inline in index.html's <head> before first
 * paint to avoid a flash of the wrong palette.
 */

import { $, showToast } from './utils.js';

const STORAGE_KEY = 'neon-theme';

function currentTheme() {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

function applyTheme(mode) {
  const html = document.documentElement;
  html.classList.toggle('dark', mode === 'dark');
  html.classList.toggle('light', mode === 'light');
  const icon = $('btnThemeIcon');
  if (icon) icon.textContent = mode === 'dark' ? 'dark_mode' : 'light_mode';
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch { /* localStorage may be blocked — toggle still works in-session */ }
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  showToast(`Switched to ${next} mode`, next === 'dark' ? 'dark_mode' : 'light_mode');
}

// Apply the persisted (or default) theme on boot so the icon matches the
// palette regardless of what the inline <head> script set.
applyTheme(currentTheme());

$('btnTheme')?.addEventListener('click', toggleTheme);
