/**
 * Neon Architect — Code Editor Module
 * Handles the code editing area: textarea, line numbers,
 * cursor tracking, find/replace, and editor settings.
 */

import { $, getLangDisplay, bus } from './utils.js';
import { getFileContent, fileContents, dirty, getNode } from './filesystem.js';

let activeTab = null;

/** Set the currently active tab path */
export function setActiveTab(path) { activeTab = path; }
export function getActiveTab() { return activeTab; }

const codeEditor = $('codeEditor');
const lineNumbers = $('lineNumbers');
const editorWrapper = $('editorWrapper');
const welcomeScreen = $('welcomeScreen');

/** Load a file into the editor */
export function loadEditor(path) {
  activeTab = path;
  welcomeScreen.classList.add('hidden');
  editorWrapper.classList.remove('hidden');
  const content = getFileContent(path);
  codeEditor.value = content;
  updateLineNumbers();
  updateStatusBar();
  bus.emit('editor:loaded', path);
}

/** Show the welcome screen (no file open) */
export function showWelcome() {
  activeTab = null;
  welcomeScreen.classList.remove('hidden');
  editorWrapper.classList.add('hidden');
  $('statusLanguage').textContent = 'Plain Text';
  $('statusCursor').textContent = '';
}

/** Update line number gutter. Each row uses the editor's line-height so the
 *  gutter stays aligned with the textarea's rendered rows at any font size. */
export function updateLineNumbers() {
  const lines = codeEditor.value.split('\n').length;
  let html = '';
  for (let i = 1; i <= lines; i++) {
    html += `<div class="text-right leading-[inherit]">${i}</div>`;
  }
  lineNumbers.innerHTML = html;
}

/** Update status bar with cursor position and language */
export function updateStatusBar() {
  if (!activeTab) return;
  const tab = window.__neonTabs?.find(t => t.path === activeTab);
  if (tab) {
    $('statusLanguage').textContent = getLangDisplay(tab.lang);
  }
  const pos = codeEditor.selectionStart;
  const text = codeEditor.value.substring(0, pos);
  const line = text.split('\n').length;
  const col = pos - text.lastIndexOf('\n');
  $('statusCursor').textContent = `Ln ${line}, Col ${col}`;
  $('statusIndent').textContent = `Spaces: ${$('settingTabSize')?.value || 2}`;
}

/** Get the current editor content */
export function getEditorContent() {
  return codeEditor.value;
}

/** Select the current line the cursor is on */
export function selectCurrentLine() {
  const pos = codeEditor.selectionStart;
  const content = codeEditor.value;
  const lineStart = content.lastIndexOf('\n', pos - 1) + 1;
  let lineEnd = content.indexOf('\n', pos);
  if (lineEnd < 0) lineEnd = content.length;
  codeEditor.setSelectionRange(lineStart, lineEnd);
}

// ── Editor Input Events ──────────────────────────────────────────────────
codeEditor.addEventListener('input', () => {
  if (!activeTab) return;
  fileContents[activeTab] = codeEditor.value;
  const original = getNode(activeTab)?._content ?? '';
  if (codeEditor.value !== original) dirty.add(activeTab);
  else dirty.delete(activeTab);
  updateLineNumbers();
  bus.emit('editor:change', activeTab);
});

codeEditor.addEventListener('keydown', e => {
  // Tab inserts spaces
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = codeEditor.selectionStart;
    const end = codeEditor.selectionEnd;
    const size = parseInt($('settingTabSize')?.value || '2');
    const spaces = ' '.repeat(size);
    codeEditor.value = codeEditor.value.substring(0, start) + spaces + codeEditor.value.substring(end);
    codeEditor.selectionStart = codeEditor.selectionEnd = start + spaces.length;
    codeEditor.dispatchEvent(new Event('input'));
  }

  // Enter: auto-indent
  if (e.key === 'Enter') {
    const pos = codeEditor.selectionStart;
    const content = codeEditor.value;
    const lineStart = content.lastIndexOf('\n', pos - 1) + 1;
    const currentLine = content.substring(lineStart, pos);
    const indent = currentLine.match(/^(\s*)/)[1];

    // Extra indent after { or (
    const lastChar = content.substring(0, pos).trim().slice(-1);
    const extraIndent = (lastChar === '{' || lastChar === '(' || lastChar === ':') ? '  ' : '';

    e.preventDefault();
    const insertion = '\n' + indent + extraIndent;
    codeEditor.value = content.substring(0, pos) + insertion + content.substring(pos);
    codeEditor.selectionStart = codeEditor.selectionEnd = pos + insertion.length;
    codeEditor.dispatchEvent(new Event('input'));
  }
});

codeEditor.addEventListener('click', updateStatusBar);
codeEditor.addEventListener('keyup', updateStatusBar);
codeEditor.addEventListener('scroll', () => {
  lineNumbers.scrollTop = codeEditor.scrollTop;
});

// ── Find Bar ─────────────────────────────────────────────────────────────
export function toggleFindBar() {
  const bar = $('findBar');
  bar.classList.toggle('hidden');
  if (!bar.classList.contains('hidden')) {
    $('findInput').focus();
    const selected = codeEditor.value.substring(codeEditor.selectionStart, codeEditor.selectionEnd);
    if (selected) $('findInput').value = selected;
  }
}

$('findClose')?.addEventListener('click', () => $('findBar').classList.add('hidden'));

$('findInput')?.addEventListener('input', () => {
  const query = $('findInput').value;
  if (!query) { $('findCount').textContent = '0 results'; return; }
  const content = codeEditor.value;
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const matches = content.match(regex);
  $('findCount').textContent = `${matches ? matches.length : 0} results`;
  if (matches) {
    const idx = content.toLowerCase().indexOf(query.toLowerCase());
    if (idx >= 0) {
      codeEditor.focus();
      codeEditor.setSelectionRange(idx, idx + query.length);
    }
  }
});

$('findNext')?.addEventListener('click', () => {
  const query = $('findInput').value;
  if (!query) return;
  const content = codeEditor.value;
  const startFrom = codeEditor.selectionEnd;
  let idx = content.toLowerCase().indexOf(query.toLowerCase(), startFrom);
  if (idx < 0) idx = content.toLowerCase().indexOf(query.toLowerCase()); // wrap
  if (idx >= 0) {
    codeEditor.focus();
    codeEditor.setSelectionRange(idx, idx + query.length);
  }
});

$('findPrev')?.addEventListener('click', () => {
  const query = $('findInput').value;
  if (!query) return;
  const content = codeEditor.value;
  const startFrom = codeEditor.selectionStart - 1;
  const idx = content.toLowerCase().lastIndexOf(query.toLowerCase(), startFrom);
  if (idx >= 0) {
    codeEditor.focus();
    codeEditor.setSelectionRange(idx, idx + query.length);
  }
});

// ── Settings Integration ─────────────────────────────────────────────────
// Font-size / word-wrap / gutter syncing is owned by settings.js so there's
// a single place that writes to codeEditor + lineNumbers. Keeping tab-size
// here because it only updates the status bar display, nothing else.
$('settingTabSize')?.addEventListener('change', updateStatusBar);
