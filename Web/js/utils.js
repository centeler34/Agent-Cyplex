/**
 * Neon Architect — Utility Functions
 * Common helpers used across all modules.
 */

/** Shorthand for document.getElementById */
export const $ = id => document.getElementById(id);

/** Escape HTML entities to prevent XSS */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Get current time as HH:MM AM/PM */
export function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Debounce a function call */
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(null, args), ms);
  };
}

/** Generate a short unique ID */
export function uid() {
  return Math.random().toString(36).substring(2, 9);
}

/** Detect file language from extension */
export function getLangFromName(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    css: 'css', scss: 'scss', less: 'less',
    json: 'json',
    md: 'markdown',
    html: 'html', htm: 'html',
    svg: 'xml', xml: 'xml',
    py: 'python',
    rs: 'rust',
    go: 'go',
    yaml: 'yaml', yml: 'yaml',
    sh: 'shell', bash: 'shell',
    sql: 'sql',
    rb: 'ruby',
    java: 'java',
    c: 'c', cpp: 'cpp', h: 'c',
    php: 'php',
    toml: 'toml',
    env: 'dotenv',
    txt: 'plaintext'
  };
  return map[ext] || 'plaintext';
}

/** Get display name for a language */
export function getLangDisplay(lang) {
  const map = {
    javascript: 'JavaScript',
    typescript: 'TypeScript JSX',
    css: 'CSS', scss: 'SCSS',
    json: 'JSON',
    markdown: 'Markdown',
    html: 'HTML',
    xml: 'XML',
    python: 'Python',
    rust: 'Rust',
    go: 'Go',
    yaml: 'YAML',
    shell: 'Shell Script',
    sql: 'SQL',
    ruby: 'Ruby',
    java: 'Java',
    c: 'C', cpp: 'C++',
    php: 'PHP',
    toml: 'TOML',
    dotenv: 'Environment',
    plaintext: 'Plain Text'
  };
  return map[lang] || lang;
}

/** Get Material icon and color for a file */
export function getFileIcon(name, lang) {
  if (name.endsWith('.tsx') || name.endsWith('.ts')) return { icon: 'data_object', color: 'text-primary' };
  if (name.endsWith('.jsx') || name.endsWith('.js')) return { icon: 'javascript', color: 'text-tertiary' };
  if (name.endsWith('.css') || name.endsWith('.scss')) return { icon: 'css', color: 'text-secondary-dim' };
  if (name.endsWith('.json')) return { icon: 'data_object', color: 'text-tertiary-dim' };
  if (name.endsWith('.md')) return { icon: 'description', color: 'text-outline' };
  if (name.endsWith('.svg') || name.endsWith('.png') || name.endsWith('.jpg')) return { icon: 'image', color: 'text-tertiary' };
  if (name.endsWith('.py')) return { icon: 'code', color: 'text-secondary' };
  if (name.endsWith('.html')) return { icon: 'html', color: 'text-error' };
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return { icon: 'settings', color: 'text-outline' };
  if (name.endsWith('.sh')) return { icon: 'terminal', color: 'text-on-surface-variant' };
  return { icon: 'description', color: 'text-outline' };
}

/** Show a toast notification */
export function showToast(msg, icon = 'check_circle') {
  const toast = $('toast');
  $('toastMsg').textContent = msg;
  $('toastIcon').textContent = icon;
  toast.classList.remove('hidden');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.add('hidden'), 2500);
}

/** Create an EventBus for inter-module communication */
export class EventBus {
  constructor() {
    this._listeners = {};
  }
  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
  }
  off(event, fn) {
    const list = this._listeners[event];
    if (list) this._listeners[event] = list.filter(f => f !== fn);
  }
  emit(event, ...args) {
    (this._listeners[event] || []).forEach(fn => fn(...args));
  }
}

/** Global event bus instance */
export const bus = new EventBus();
