/**
 * Neon Architect — Local Filesystem Bridge
 * Loads real files/folders from the user's computer into the virtual file tree
 * via the File System Access API (Chromium) with a <input type="file"> fallback
 * (Firefox / Safari / older browsers). Everything stays client-side — nothing
 * is uploaded anywhere.
 */

import { $, getLangFromName, showToast, bus } from './utils.js';
import { setNode, fileContents } from './filesystem.js';
import { openFile } from './tabs.js';

// Binary-ish extensions we refuse to load into the textarea editor. Listing
// them explicitly keeps the decision boundary obvious and avoids a heuristic
// sniff of every file the user picks.
const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'tif', 'tiff',
  'mp3', 'mp4', 'mov', 'avi', 'mkv', 'webm', 'wav', 'ogg', 'flac',
  'zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt',
  'exe', 'dll', 'so', 'dylib', 'bin', 'class', 'wasm',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'db', 'sqlite', 'sqlite3',
]);

const MAX_FILE_BYTES = 2 * 1024 * 1024;   // 2 MiB — refuse larger files
const MAX_ENTRIES    = 2000;              // refuse folders with more than this many entries

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

function isLikelyBinary(name) {
  return BINARY_EXT.has(extOf(name));
}

function sanitizeSegment(seg) {
  // Drop path separators and '..' so a hostile file name can't escape the
  // in-memory tree. The tree is pure JS state, but we still don't want to
  // hand anything hinky to the path-splitting helpers.
  return seg.replace(/[\\/]/g, '_').replace(/^\.+$/, '_');
}

function sanitizeRelPath(rel) {
  return rel
    .split('/')
    .filter(Boolean)
    .map(sanitizeSegment)
    .filter(seg => seg !== '..' && seg !== '.')
    .join('/');
}

async function readFileAsText(file) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MiB — above the ${(MAX_FILE_BYTES / 1024 / 1024)} MiB editor limit`);
  }
  if (isLikelyBinary(file.name)) {
    throw new Error(`${file.name}: binary file (preview not supported)`);
  }
  return await file.text();
}

function registerFile(relPath, content, name) {
  const safe = sanitizeRelPath(relPath);
  if (!safe) return null;
  const lang = getLangFromName(name);
  setNode(safe, { _type: 'file', _lang: lang, _content: content });
  fileContents[safe] = content;
  return safe;
}

// ── File System Access API (Chromium) ────────────────────────────────────

function hasFsApi() {
  return typeof window.showOpenFilePicker === 'function'
      && typeof window.showDirectoryPicker === 'function';
}

async function pickFilesFsApi() {
  const handles = await window.showOpenFilePicker({ multiple: true });
  const loaded = [];
  for (const h of handles) {
    const f = await h.getFile();
    try {
      const text = await readFileAsText(f);
      const rel = registerFile(f.name, text, f.name);
      if (rel) loaded.push({ rel, name: f.name });
    } catch (err) {
      showToast(err.message, 'warning');
    }
  }
  return loaded;
}

async function walkDirFsApi(dirHandle, prefix, loaded, counters) {
  for await (const entry of dirHandle.values()) {
    if (counters.count >= MAX_ENTRIES) {
      counters.truncated = true;
      return;
    }
    const name = sanitizeSegment(entry.name);
    if (!name) continue;
    // Skip the usual suspects — VCS internals, dep caches, build output.
    if (['.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build', '.cache', '.next'].includes(name)) {
      continue;
    }
    const rel = prefix ? `${prefix}/${name}` : name;
    if (entry.kind === 'directory') {
      // Ensure the dir node exists and is collapsed by default (except root children).
      setNode(rel, { _type: 'dir', _expanded: prefix === '' });
      await walkDirFsApi(entry, rel, loaded, counters);
    } else {
      counters.count++;
      try {
        const f = await entry.getFile();
        const text = await readFileAsText(f);
        const saved = registerFile(rel, text, name);
        if (saved) loaded.push({ rel: saved, name });
      } catch {
        // swallow per-file errors; a toast spam would be worse than a missing entry
      }
    }
  }
}

async function pickFolderFsApi() {
  const dirHandle = await window.showDirectoryPicker();
  const rootName = sanitizeSegment(dirHandle.name || 'folder');
  setNode(rootName, { _type: 'dir', _expanded: true });
  const counters = { count: 0, truncated: false };
  const loaded = [];
  await walkDirFsApi(dirHandle, rootName, loaded, counters);
  if (counters.truncated) {
    showToast(`Folder truncated at ${MAX_ENTRIES} entries`, 'warning');
  }
  return loaded;
}

// ── <input type="file"> Fallback ────────────────────────────────────────

function pickFilesFallback() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.addEventListener('change', async () => {
      const loaded = [];
      for (const f of input.files) {
        try {
          const text = await readFileAsText(f);
          const rel = registerFile(f.name, text, f.name);
          if (rel) loaded.push({ rel, name: f.name });
        } catch (err) {
          showToast(err.message, 'warning');
        }
      }
      resolve(loaded);
    }, { once: true });
    input.click();
  });
}

function pickFolderFallback() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    // Non-standard but widely supported; Firefox honours it too.
    input.webkitdirectory = true;
    input.directory = true;
    input.addEventListener('change', async () => {
      const files = Array.from(input.files);
      if (!files.length) return resolve([]);
      if (files.length > MAX_ENTRIES) {
        showToast(`Folder truncated at ${MAX_ENTRIES} entries`, 'warning');
        files.length = MAX_ENTRIES;
      }
      const loaded = [];
      for (const f of files) {
        // webkitRelativePath looks like "myfolder/src/foo.js"
        const rel = f.webkitRelativePath || f.name;
        const parts = rel.split('/').filter(Boolean);
        // Skip the usual suspects at any depth.
        if (parts.some(p => ['.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build', '.cache', '.next'].includes(p))) {
          continue;
        }
        try {
          const text = await readFileAsText(f);
          const saved = registerFile(rel, text, f.name);
          if (saved) loaded.push({ rel: saved, name: f.name });
        } catch (err) {
          // Don't toast per file during a folder load — would spam on e.g. image-heavy dirs.
        }
      }
      resolve(loaded);
    }, { once: true });
    input.click();
  });
}

// ── Public API ───────────────────────────────────────────────────────────

export async function openLocalFiles() {
  try {
    const loaded = hasFsApi() ? await pickFilesFsApi() : await pickFilesFallback();
    if (!loaded.length) return;
    bus.emit('filetree:refresh');
    // Open the first file loaded so the user gets immediate feedback.
    const first = loaded[0];
    openFile(first.rel, first.name, getLangFromName(first.name));
    showToast(`Loaded ${loaded.length} file${loaded.length === 1 ? '' : 's'}`, 'check');
  } catch (err) {
    if (err && err.name === 'AbortError') return; // user dismissed the picker
    showToast(`Open failed: ${err.message || err}`, 'error');
  }
}

export async function openLocalFolder() {
  try {
    const loaded = hasFsApi() ? await pickFolderFsApi() : await pickFolderFallback();
    bus.emit('filetree:refresh');
    showToast(
      loaded.length
        ? `Loaded folder (${loaded.length} file${loaded.length === 1 ? '' : 's'})`
        : 'Folder loaded (no readable text files)',
      'check',
    );
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    showToast(`Open folder failed: ${err.message || err}`, 'error');
  }
}

// ── Wire Buttons ─────────────────────────────────────────────────────────

$('btnOpenFiles')?.addEventListener('click', openLocalFiles);
$('btnOpenFolder')?.addEventListener('click', openLocalFolder);
