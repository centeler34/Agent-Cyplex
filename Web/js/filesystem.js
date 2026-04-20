/**
 * Neon Architect — Virtual File System
 * In-memory file tree with directory operations.
 * Provides a virtual project structure for the editor.
 */

import { getLangFromName, bus } from './utils.js';

/** The virtual file system tree — starts empty; parent dirs are added on demand when a file is opened. */
export const fileSystem = {};

/** Cached modified file contents (path -> content) */
export const fileContents = {};

/** Set of dirty (unsaved) file paths */
export const dirty = new Set();

// Proxy dirty set to emit events on change
const _origAdd = dirty.add.bind(dirty);
const _origDel = dirty.delete.bind(dirty);
const _origClr = dirty.clear.bind(dirty);
dirty.add = function(v) { _origAdd(v); bus.emit('dirty:change'); return dirty; };
dirty.delete = function(v) { const r = _origDel(v); bus.emit('dirty:change'); return r; };
dirty.clear = function() { _origClr(); bus.emit('dirty:change'); };

/** Navigate the tree to get a node by path */
export function getNode(path) {
  const parts = path.split('/').filter(Boolean);
  let node = fileSystem;
  for (const p of parts) {
    if (!node || !node[p]) return null;
    node = node[p];
  }
  return node;
}

/** Set a node at the given path, creating parents as needed */
export function setNode(path, value) {
  const parts = path.split('/').filter(Boolean);
  let node = fileSystem;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!node[parts[i]]) node[parts[i]] = { _type: 'dir', _expanded: true };
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

/** Delete a node at the given path */
export function deleteNode(path) {
  const parts = path.split('/').filter(Boolean);
  let node = fileSystem;
  for (let i = 0; i < parts.length - 1; i++) {
    node = node[parts[i]];
  }
  delete node[parts[parts.length - 1]];
}

/** Get file content, preferring cached version */
export function getFileContent(path) {
  if (fileContents[path] !== undefined) return fileContents[path];
  const node = getNode(path);
  return node ? node._content || '' : '';
}

/** Save content to a file, updating dirty state */
export function saveFileContent(path) {
  const node = getNode(path);
  if (node && fileContents[path] !== undefined) {
    node._content = fileContents[path];
    dirty.delete(path);
  }
}

/** Save all dirty files. Returns the number of files persisted so callers can
 *  surface a count in their toast/status message. */
export function saveAllFiles() {
  const count = dirty.size;
  for (const path of dirty) {
    const node = getNode(path);
    if (node) node._content = fileContents[path] || '';
  }
  dirty.clear();
  return count;
}

/** Search all files for a query string */
export function searchFiles(query) {
  const matches = [];
  const lowerQuery = query.toLowerCase();

  function walk(node, path) {
    for (const [name, child] of Object.entries(node)) {
      if (name.startsWith('_')) continue;
      const fullPath = path ? `${path}/${name}` : name;
      if (child._type === 'dir') {
        walk(child, fullPath);
      } else if (child._content) {
        const lines = child._content.split('\n');
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(lowerQuery)) {
            matches.push({
              path: fullPath,
              name,
              line: idx + 1,
              text: line.trim(),
              lang: child._lang || getLangFromName(name),
            });
          }
        });
      }
    }
  }

  walk(fileSystem, '');
  return matches;
}

/** Export the project as a JSON blob */
export function exportProject() {
  const content = JSON.stringify(fileSystem, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'neon-architect-project.json';
  a.click();
  URL.revokeObjectURL(url);
}
