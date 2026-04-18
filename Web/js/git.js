/**
 * Neon Architect — Git Panel Module
 * Simulates a source control view: branch, staged/unstaged
 * changes, commit history, and a mock commit action.
 */

import { $, escapeHtml, showToast, bus } from './utils.js';
import { dirty, fileContents } from './filesystem.js';

const gitPanel = $('gitPanel');
const gitBranch = $('gitBranch');
const gitChanges = $('gitChanges');
const gitCommitBtn = $('gitCommitBtn');
const gitMessage = $('gitCommitMessage');
const gitLog = $('gitLog');
const gitStaged = $('gitStaged');

const state = {
  branch: 'main',
  staged: new Set(),
  commits: [
    {
      hash: 'f9f7aba',
      author: 'centeler34',
      date: '2 days ago',
      message: 'Add 6 local LLM providers (Ollama, LM Studio, LocalAI, llama.cpp, vLLM, Jan)',
    },
    {
      hash: '38cba85',
      author: 'centeler34',
      date: '3 days ago',
      message: 'Update model docs, add Chinese providers to web UI, change license to MIT',
    },
    {
      hash: '73a80d7',
      author: 'centeler34',
      date: '3 days ago',
      message: 'Add 5 Chinese AI coding tool providers',
    },
  ],
};

/** Render the git panel contents */
export function renderGit() {
  if (!gitPanel) return;

  if (gitBranch) gitBranch.textContent = state.branch;

  // Render changed files
  const changed = [...dirty];
  if (gitChanges) {
    if (changed.length === 0) {
      gitChanges.innerHTML = `
        <div class="text-xs text-on-surface-variant p-4 text-center">
          Nothing to commit. Working tree clean.
        </div>
      `;
    } else {
      gitChanges.innerHTML = changed.map(path => {
        const isStaged = state.staged.has(path);
        return `
          <div class="git-change flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-container-high cursor-pointer"
               data-path="${escapeHtml(path)}">
            <span class="material-symbols-outlined text-sm ${isStaged ? 'text-tertiary-dim' : 'text-primary'}">
              ${isStaged ? 'add_circle' : 'edit'}
            </span>
            <span class="flex-1 truncate ${isStaged ? 'text-on-surface' : 'text-on-surface-variant'}">${escapeHtml(path)}</span>
            <span class="text-xs text-on-surface-variant">${isStaged ? 'staged' : 'M'}</span>
          </div>
        `;
      }).join('');

      gitChanges.querySelectorAll('.git-change').forEach(el => {
        el.addEventListener('click', () => toggleStage(el.dataset.path));
      });
    }
  }

  // Render staged count
  if (gitStaged) {
    gitStaged.textContent = `${state.staged.size} staged`;
  }

  // Render commit log
  if (gitLog) {
    gitLog.innerHTML = state.commits.slice(0, 10).map(c => `
      <div class="px-3 py-2 border-b border-outline-variant text-xs">
        <div class="flex items-center gap-2">
          <span class="font-mono text-primary">${c.hash}</span>
          <span class="text-on-surface-variant">${c.author}</span>
          <span class="ml-auto text-on-surface-variant">${c.date}</span>
        </div>
        <div class="text-on-surface mt-0.5 truncate">${escapeHtml(c.message)}</div>
      </div>
    `).join('');
  }
}

/** Toggle stage/unstage for a path */
export function toggleStage(path) {
  if (state.staged.has(path)) state.staged.delete(path);
  else state.staged.add(path);
  renderGit();
}

/** Stage all changes */
export function stageAll() {
  for (const path of dirty) state.staged.add(path);
  renderGit();
}

/** Simulate a commit */
export function commit() {
  const message = gitMessage?.value?.trim();
  if (!message) { showToast('Enter a commit message', 'warning'); return; }
  if (state.staged.size === 0) { showToast('No staged changes', 'warning'); return; }

  const hash = Math.random().toString(16).slice(2, 9);
  const count = state.staged.size;

  state.commits.unshift({
    hash,
    author: 'architect',
    date: 'just now',
    message,
  });

  // "Committing" clears dirty flags for staged files
  for (const path of state.staged) dirty.delete(path);
  state.staged.clear();
  if (gitMessage) gitMessage.value = '';

  renderGit();
  bus.emit('dirty:change');
  showToast(`Committed ${count} file${count > 1 ? 's' : ''}: ${hash}`, 'check');
}

/** Toggle git panel visibility */
export function toggleGitPanel() {
  gitPanel?.classList.toggle('hidden');
  if (!gitPanel?.classList.contains('hidden')) renderGit();
}

// ── Event Wiring ─────────────────────────────────────────────────────────
gitCommitBtn?.addEventListener('click', commit);
$('gitStageAll')?.addEventListener('click', stageAll);

bus.on('dirty:change', renderGit);
bus.on('git:refresh', renderGit);
bus.on('action:git', toggleGitPanel);
