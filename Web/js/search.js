/**
 * Neon Architect — Search Module
 * Full-text search across the virtual file system with
 * clickable navigation to file:line.
 */

import { $, escapeHtml, getLangFromName, bus } from './utils.js';
import { searchFiles } from './filesystem.js';
import { openFile } from './tabs.js';

const searchInput = $('searchInput');
const searchResults = $('searchResults');
const searchPanel = $('searchPanel');

/** Run a search and render results */
export function runSearch(query) {
  if (!query || query.length < 2) {
    searchResults.innerHTML = `
      <div class="text-xs text-on-surface-variant p-4 text-center">
        Enter 2+ characters to search
      </div>
    `;
    return;
  }

  const results = searchFiles(query);
  if (results.length === 0) {
    searchResults.innerHTML = `
      <div class="text-xs text-on-surface-variant p-4 text-center">
        No results for "${escapeHtml(query)}"
      </div>
    `;
    return;
  }

  // Group results by file path
  const byFile = {};
  for (const r of results) {
    (byFile[r.path] ??= []).push(r);
  }

  const total = results.length;
  const fileCount = Object.keys(byFile).length;

  let html = `
    <div class="text-xs text-on-surface-variant px-3 py-2 border-b border-outline-variant">
      ${total} results in ${fileCount} files
    </div>
  `;

  for (const [path, matches] of Object.entries(byFile)) {
    const name = path.split('/').pop();
    html += `
      <div class="search-file-group">
        <div class="search-file-header px-3 py-2 bg-surface-container-low flex items-center gap-2 cursor-pointer hover:bg-surface-container">
          <span class="material-symbols-outlined text-sm text-primary">description</span>
          <span class="text-xs font-medium text-on-surface">${escapeHtml(name)}</span>
          <span class="text-xs text-on-surface-variant ml-auto">${matches.length}</span>
        </div>
        <div class="search-matches">
    `;
    for (const m of matches) {
      const highlighted = escapeHtml(m.line).replace(
        new RegExp(escapeRegex(query), 'gi'),
        match => `<mark class="bg-primary/30 text-on-surface">${match}</mark>`
      );
      html += `
        <div class="search-result px-3 py-1.5 pl-9 text-xs cursor-pointer hover:bg-surface-container-high flex gap-2"
             data-path="${escapeHtml(path)}" data-name="${escapeHtml(name)}" data-line="${m.lineNumber}">
          <span class="text-on-surface-variant w-8 text-right shrink-0">${m.lineNumber}</span>
          <span class="text-on-surface truncate">${highlighted}</span>
        </div>
      `;
    }
    html += '</div></div>';
  }

  searchResults.innerHTML = html;

  // Wire click handlers
  searchResults.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => {
      const path = el.dataset.path;
      const name = el.dataset.name;
      openFile(path, name, getLangFromName(name));
      bus.emit('editor:goto-line', parseInt(el.dataset.line));
    });
  });

  // Collapse/expand file groups
  searchResults.querySelectorAll('.search-file-header').forEach(el => {
    el.addEventListener('click', () => {
      const matches = el.nextElementSibling;
      matches.classList.toggle('hidden');
    });
  });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Toggle the search panel */
export function toggleSearchPanel() {
  searchPanel?.classList.toggle('hidden');
  if (!searchPanel?.classList.contains('hidden')) {
    searchInput?.focus();
  }
}

// ── Event Wiring ─────────────────────────────────────────────────────────
let searchTimer = null;
searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(searchInput.value), 200);
});

searchInput?.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    searchInput.value = '';
    runSearch('');
  }
});

// External trigger
bus.on('search:open', (query = '') => {
  searchPanel?.classList.remove('hidden');
  if (query) {
    searchInput.value = query;
    runSearch(query);
  }
  searchInput?.focus();
});
