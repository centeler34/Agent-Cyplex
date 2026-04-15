/**
 * Agent v0 — Neon Architect Client
 * Handles auth, Socket.IO events, terminal, tasks, memory, audit, and AI chat.
 */

const socket = io();

// ── DOM refs ────────────────────────────────────────────────────────────────

const $ = (sel) => document.getElementById(sel);
const output       = $('output');
const cmdInput     = $('cmdInput');
const sendBtn      = $('sendBtn');
const authOverlay  = $('auth');
const authError    = $('auth-error');
const workspace    = $('workspace');
const connStatus   = $('connection-status');
const connText     = $('conn-text');
const chatMessages = $('chatMessages');
const chatInput    = $('chatInput');
const chatSendBtn  = $('chatSendBtn');

let authenticated = false;
let heartbeatTimer = null;
let startTime = Date.now();
let terminalLines = 0;
const MAX_TERMINAL_LINES = 500;

// ── Command History ─────────────────────────────────────────────────────────

const cmdHistory = [];
let historyIndex = -1;
const MAX_HISTORY = 100;

function pushHistory(cmd) {
  if (!cmd || (cmdHistory.length > 0 && cmdHistory[cmdHistory.length - 1] === cmd)) return;
  cmdHistory.push(cmd);
  if (cmdHistory.length > MAX_HISTORY) cmdHistory.shift();
  historyIndex = cmdHistory.length;
}

function historyUp() {
  if (cmdHistory.length === 0) return;
  if (historyIndex > 0) historyIndex--;
  cmdInput.value = cmdHistory[historyIndex] || '';
}

function historyDown() {
  if (historyIndex < cmdHistory.length - 1) {
    historyIndex++;
    cmdInput.value = cmdHistory[historyIndex];
  } else {
    historyIndex = cmdHistory.length;
    cmdInput.value = '';
  }
}

// ── Toast Notifications ─────────────────────────────────────────────────────

const TOAST_ICONS = { success: '\u2713', error: '\u2717', info: '\u2139', warning: '\u26A0' };

function toast(message, type = 'info', duration = 3500) {
  const container = $('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type] || ''}</span><span>${esc(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('removing'); setTimeout(() => el.remove(), 250); }, duration);
}

// ── Utilities ───────────────────────────────────────────────────────────────

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function formatUptime() {
  const ms = Date.now() - startTime;
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000);
  return `${h}h ${m}m ${s}s`;
}

// ── Auth ────────────────────────────────────────────────────────────────────

function login() {
  const password = $('passInput').value;
  if (!password) return;
  socket.emit('auth', { password });
}

$('authBtn').addEventListener('click', login);
$('passInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

socket.on('auth_success', (data) => {
  authenticated = true;
  authOverlay.style.display = 'none';
  workspace.style.display = 'flex';
  cmdInput.disabled = false;
  sendBtn.disabled = false;
  cmdInput.focus();
  termLog('Fleet unlocked. Command center ready.', 'success');
  termLog('Press Ctrl+K for keyboard shortcuts.', 'sys');
  toast('Authentication successful', 'success');
  updateStats(data.stats);
  updateAgentList(data.agents);
  startHeartbeat();
  startUptimeCounter();
  $('ai-status').textContent = 'AI Connected';
});

socket.on('auth_error', (data) => {
  authError.textContent = data.message;
  authError.style.display = 'block';
  $('passInput').value = '';
  $('passInput').focus();
  toast(data.message, 'error');
});

// ── Heartbeat ───────────────────────────────────────────────────────────────

function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (socket.connected) socket.emit('get_status');
  }, 5000);
}

function startUptimeCounter() {
  startTime = Date.now();
  setInterval(() => {
    const el = $('sys-uptime');
    if (el) el.textContent = formatUptime();
  }, 1000);
}

socket.on('status_update', (data) => {
  updateStats(data.stats);
  updateAgentList(data.agents);
});

// ── Connection ──────────────────────────────────────────────────────────────

socket.on('connect', () => {
  connStatus.className = 'conn-badge connected';
  connText.textContent = 'Connected';
  if (authenticated) {
    termLog('Reconnected to daemon.', 'success');
    toast('Daemon reconnected', 'success');
  }
});

socket.on('disconnect', () => {
  connStatus.className = 'conn-badge disconnected';
  connText.textContent = 'Disconnected';
  if (authenticated) {
    termLog('Connection lost. Attempting reconnect...', 'err');
    toast('Connection lost', 'error');
  }
});

// ── Tab Navigation ──────────────────────────────────────────────────────────

const TAB_MAP = {
  'terminal': 'terminal-tab',
  'tasks':    'tasks-tab',
  'memory':   'memory-tab',
  'audit':    'audit-tab',
};

function showTab(section) {
  // Update tab panels
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = $(TAB_MAP[section]);
  if (panel) panel.classList.add('active');

  // Update nav links
  document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active'));
  const link = document.querySelector(`.nav-link[data-section="${section}"]`);
  if (link) link.classList.add('active');

  // Load data for tab
  if (section === 'terminal') cmdInput.focus();
  if (section === 'memory') socket.emit('get_memories');
  if (section === 'audit') socket.emit('get_audit_logs');
}

// Nav link clicks
$('topbar-nav').addEventListener('click', (e) => {
  const link = e.target.closest('.nav-link');
  if (link) showTab(link.dataset.section);
});

// ── Icon Rail (Side Panel Switching) ────────────────────────────────────────

const SIDE_PANELS = ['fleet', 'search', 'tools', 'extensions', 'settings', 'account'];
let activeSidePanel = 'fleet';

function showSidePanel(panelName) {
  // Hide all side panels
  SIDE_PANELS.forEach(name => {
    const el = $(`${name}-panel`);
    if (el) el.style.display = 'none';
  });

  // Special case: "chat" toggles the right-side chat panel
  if (panelName === 'chat') {
    const chatPanel = $('chat-panel');
    chatPanel.style.display = chatPanel.style.display === 'none' ? 'flex' : 'none';
    // Re-show the previously active side panel
    const activeEl = $(`${activeSidePanel}-panel`);
    if (activeEl) activeEl.style.display = 'flex';
    return;
  }

  // Show the selected panel
  const panel = $(`${panelName}-panel`);
  if (panel) {
    panel.style.display = 'flex';
    activeSidePanel = panelName;
  }

  // Update rail button active states
  document.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.rail-btn[data-panel="${panelName}"]`);
  if (activeBtn) activeBtn.classList.add('active');
}

document.querySelectorAll('.rail-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    showSidePanel(btn.dataset.panel);
  });
});

// ── Keyboard Shortcuts ──────────────────────────────────────────────────────

function toggleShortcutHelp() {
  $('shortcut-help').classList.toggle('visible');
}

$('closeShortcutsBtn').addEventListener('click', toggleShortcutHelp);

document.addEventListener('keydown', (e) => {
  const inputFocused = document.activeElement === cmdInput ||
                       document.activeElement === chatInput ||
                       document.activeElement?.tagName === 'INPUT' ||
                       document.activeElement?.tagName === 'TEXTAREA';

  if (e.ctrlKey && e.key === 'k') { e.preventDefault(); toggleShortcutHelp(); return; }

  if (e.ctrlKey && e.key === 'l') {
    e.preventDefault();
    output.innerHTML = '';
    terminalLines = 0;
    termLog('Terminal cleared.', 'sys');
    return;
  }

  if (e.key === 'Escape') {
    const shortcuts = $('shortcut-help');
    const memModal  = $('memory-modal');
    if (shortcuts.classList.contains('visible')) { shortcuts.classList.remove('visible'); }
    else if (memModal.style.display === 'flex') { closeMemoryModal(); }
    else if (inputFocused) { document.activeElement.blur(); }
    return;
  }

  if (e.key === '/' && !inputFocused && authenticated) { e.preventDefault(); cmdInput.focus(); return; }

  const sections = ['terminal', 'tasks', 'memory', 'audit'];
  if (!inputFocused && authenticated && e.key >= '1' && e.key <= '4') {
    showTab(sections[parseInt(e.key) - 1]);
    return;
  }

  if (document.activeElement === cmdInput) {
    if (e.key === 'ArrowUp')   { e.preventDefault(); historyUp(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); historyDown(); }
  }
});

// ── Terminal ────────────────────────────────────────────────────────────────

function termLog(msg, cls = 'out') {
  const div = document.createElement('div');
  div.className = `term-line ${cls}`;

  const time = document.createElement('span');
  time.style.cssText = 'color: var(--text-3); margin-right: 10px; font-size: 0.65rem;';
  time.textContent = formatTime(new Date());

  const content = document.createElement('span');
  content.textContent = msg;

  div.appendChild(time);
  div.appendChild(content);
  output.appendChild(div);

  terminalLines++;
  if (terminalLines > MAX_TERMINAL_LINES) {
    output.removeChild(output.firstChild);
    terminalLines--;
  }
  output.scrollTo({ top: output.scrollHeight, behavior: 'smooth' });
}

// ── Commands ────────────────────────────────────────────────────────────────

function sendCmd() {
  const val = cmdInput.value.trim();
  if (!val) return;
  pushHistory(val);
  termLog(val, 'cmd');
  socket.emit('submit_task', { task_type: 'intent', raw_input: val });
  cmdInput.value = '';
}

function sendQuick(cmd) {
  if (!authenticated) { toast('Authenticate first', 'warning'); return; }
  cmdInput.value = cmd;
  sendCmd();
}

cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendCmd(); });
sendBtn.addEventListener('click', sendCmd);

// Quick action chips
document.querySelectorAll('.qa-chip[data-cmd]').forEach(chip => {
  chip.addEventListener('click', () => sendQuick(chip.dataset.cmd));
});

$('refreshTasksBtn').addEventListener('click', () => sendQuick('task list'));
$('refreshFleetBtn').addEventListener('click', () => {
  if (authenticated) socket.emit('get_status');
});

// ── Task Updates ────────────────────────────────────────────────────────────

socket.on('task_update', (data) => {
  if (data.type === 'task_accepted') {
    termLog(`Task ${data.payload.task_id} accepted`, 'agent');
    addTaskCard(data.payload.task_id, data.payload.description || 'Processing...', 'running');
    toast('Task accepted', 'info');
  } else if (data.type === 'task_output') {
    termLog(`[${data.payload.agent_id}] ${data.payload.text}`, 'out');
    // Also show in chat if it came from a chat task
    if (data.payload._chat) {
      appendChatChunk(data.payload.text);
    }
  } else if (data.type === 'task_complete') {
    termLog('Task complete.', 'success');
    updateTaskStatus(data.payload?.task_id, 'done');
    toast('Task completed', 'success');
    if (data.payload?._chat) finalizeChatResponse();
  } else if (data.type === 'task_error') {
    termLog(`Error: ${data.payload.error}`, 'err');
    updateTaskStatus(data.payload?.task_id, 'failed');
    toast('Task failed', 'error');
  }
});

socket.on('task_error', (data) => {
  termLog(`IPC Error: ${data.message}`, 'err');
  toast(data.message, 'error');
});

// ── Agent List ──────────────────────────────────────────────────────────────

const DEFAULT_AGENTS = [
  { id: 'agentic',          role: 'Orchestrator',     state: 'idle' },
  { id: 'recon',            role: 'Reconnaissance',   state: 'idle' },
  { id: 'code',             role: 'Code Analysis',    state: 'idle' },
  { id: 'exploit-research', role: 'CVE Research',     state: 'idle' },
  { id: 'forensics',        role: 'Forensics',        state: 'idle' },
  { id: 'osint',            role: 'Intelligence',     state: 'idle' },
  { id: 'threat-intel',     role: 'Threat Intel',     state: 'idle' },
  { id: 'report',           role: 'Reports',          state: 'idle' },
  { id: 'monitor',          role: 'Monitoring',       state: 'idle' },
  { id: 'scribe',           role: 'Documentation',    state: 'idle' },
];

function updateAgentList(agents) {
  const list = $('agent-list');
  const pillText = $('pill-agents-text');
  const pillDot  = document.querySelector('#pill-agents .pill-dot');

  const agentData = agents && agents.length > 0 ? agents : DEFAULT_AGENTS;
  list.innerHTML = '';
  pillText.textContent = `${agentData.length} agents`;

  const anyBusy = agentData.some(a => a.state === 'busy');
  pillDot.className = `pill-dot ${anyBusy ? 'dot-busy' : 'dot-active'}`;

  agentData.forEach(agent => {
    const div = document.createElement('div');
    div.className = 'agent-item';
    const dotClass = agent.state === 'busy' ? 'busy' : agent.state === 'idle' ? 'idle' : 'active';
    div.innerHTML = `
      <span class="agent-dot ${dotClass}"></span>
      <span class="agent-name">${esc(agent.id)}</span>
      <span class="agent-role">${esc(agent.role || agent.state)}</span>
    `;
    list.appendChild(div);
  });
}

// ── Stats ───────────────────────────────────────────────────────────────────

function updateStats(stats) {
  if (!stats) return;
  const pillTasks = $('pill-agents-text');
  if (stats.cost !== undefined) {
    $('pill-cost-text').textContent = `$${stats.cost.toFixed(4)}`;
  }
}

// ── Task Cards ──────────────────────────────────────────────────────────────

function addTaskCard(taskId, description, status) {
  const grid = $('active-tasks');
  const empty = grid.querySelector('.empty-state');
  if (empty) empty.remove();

  const card = document.createElement('div');
  card.className = 'task-card';
  card.id = `task-${taskId}`;
  card.innerHTML = `
    <div class="task-card-header">
      <span class="task-card-id">${esc(taskId.substring(0, 8))}</span>
      <span class="task-card-status ${status}">${status}</span>
    </div>
    <div class="task-card-body">${esc(description)}</div>
  `;
  grid.prepend(card);
}

function updateTaskStatus(taskId, status) {
  if (!taskId) return;
  const card = $(`task-${taskId}`);
  if (card) {
    const el = card.querySelector('.task-card-status');
    el.className = `task-card-status ${status}`;
    el.textContent = status;
  }
}

// ── Memory ──────────────────────────────────────────────────────────────────

function openMemoryModal() {
  if (!authenticated) { toast('Authenticate first', 'warning'); return; }
  $('memory-modal').style.display = 'flex';
  $('memFact').focus();
}

function closeMemoryModal() {
  $('memory-modal').style.display = 'none';
  $('memory-form').reset();
}

function submitMemory() {
  const fact = $('memFact').value.trim();
  const type = $('memType').value;
  const why = $('memWhy').value.trim();
  const howToApply = $('memHow').value.trim();
  if (!fact) { toast('Fact/rule is required', 'warning'); return; }
  socket.emit('save_memory', { type, fact, why, howToApply });
}

$('newMemoryChip').addEventListener('click', openMemoryModal);
$('createMemoryBtn').addEventListener('click', openMemoryModal);
$('closeMemoryBtn').addEventListener('click', closeMemoryModal);
$('cancelMemoryBtn').addEventListener('click', closeMemoryModal);
$('submitMemoryBtn').addEventListener('click', submitMemory);

socket.on('memory_saved', () => {
  closeMemoryModal();
  toast('Memory saved', 'success');
  socket.emit('get_memories');
});

socket.on('memory_error', (data) => {
  toast(data.message || 'Memory operation failed', 'error');
});

socket.on('memories_cleared', () => {
  toast('All memories cleared', 'success');
  socket.emit('get_memories');
});

socket.on('memories_list', (memories) => renderMemories(memories));
socket.on('memories_search_results', (memories) => renderMemories(memories));

function deleteMemory(memoryId) {
  if (!memoryId) return;
  socket.emit('delete_memory', { id: memoryId });
  toast('Deleting memory...', 'info', 1500);
  // Refresh after a short delay (server doesn't emit a dedicated delete confirmation)
  setTimeout(() => socket.emit('get_memories'), 500);
}

function clearAllMemories() {
  if (!confirm('Clear ALL memories? This cannot be undone.')) return;
  socket.emit('clear_all_memories');
}

$('clearAllMemoriesBtn').addEventListener('click', clearAllMemories);

function renderMemories(memories) {
  const list = $('memory-list');
  list.innerHTML = '';
  if (!memories || memories.length === 0) {
    list.innerHTML = '<div class="empty-state">No memories stored. Create one to persist agent context.</div>';
    return;
  }
  memories.forEach(m => {
    const card = document.createElement('div');
    card.className = 'memory-card';
    const content = m.content || m.fact || '';
    const why = m.why || '';
    const how = m.howToApply || m.how_to_apply || '';
    const memId = m.id || m._id || '';
    card.innerHTML = `
      <div class="memory-card-header">
        <span class="memory-type type-${esc(m.type)}">${esc(m.type)}</span>
        <button class="memory-delete-btn" title="Delete memory" data-memory-id="${esc(memId)}">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
      <div class="memory-fact">${esc(content)}</div>
      ${why ? `<div class="memory-detail"><strong>Why:</strong> ${esc(why)}</div>` : ''}
      ${how ? `<div class="memory-detail"><strong>Apply:</strong> ${esc(how)}</div>` : ''}
    `;
    // Wire delete button
    const delBtn = card.querySelector('.memory-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteMemory(delBtn.dataset.memoryId);
      });
    }
    list.appendChild(card);
  });
}

$('memorySearchInput').addEventListener('keyup', () => {
  socket.emit('search_memories', { query: $('memorySearchInput').value.trim() });
});

// ── Audit Trail ─────────────────────────────────────────────────────────────

socket.on('audit_logs', (logs) => renderAuditLogs(logs));

function renderAuditLogs(logs) {
  const list = $('audit-list');
  const countEl = $('audit-count');
  list.innerHTML = '';
  if (!logs || logs.length === 0) {
    list.innerHTML = '<div class="empty-state">No audit entries yet.</div>';
    countEl.textContent = '0 entries';
    return;
  }
  countEl.textContent = `${logs.length} entries`;
  logs.forEach(log => list.appendChild(createAuditEntry(log)));
}

function createAuditEntry(log) {
  const div = document.createElement('div');
  div.className = 'audit-entry';
  const color = log.outcome === 'success' ? 'var(--success)' : 'var(--error)';
  div.innerHTML = `
    <div class="audit-time">${formatTime(log.timestamp)}</div>
    <div class="audit-content">
      <div class="audit-action" style="color: ${color}">${esc(log.action_type || 'unknown')} &mdash; ${esc(log.outcome || 'unknown')}</div>
      <div class="audit-agent">${esc(log.agent_id || 'system')}</div>
      <div class="audit-hash">${esc((log.entry_hash || '').substring(0, 48))}...</div>
    </div>
  `;
  return div;
}

$('auditSearchInput').addEventListener('keyup', () => {
  const query = $('auditSearchInput').value.trim().toLowerCase();
  document.querySelectorAll('.audit-entry').forEach(entry => {
    entry.style.display = entry.textContent.toLowerCase().includes(query) ? 'flex' : 'none';
  });
});

// ── AI Chat Panel ───────────────────────────────────────────────────────────

let chatResponseBuffer = '';
let currentChatBubble = null;

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text || !authenticated) return;

  // Add user bubble
  addChatMessage('user', text);
  chatInput.value = '';

  // Show thinking indicator
  showChatThinking();

  // Send as a chat task via Socket.IO
  const model = $('modelSelector').value;
  socket.emit('chat_send', { message: text, model });
}

/**
 * Render basic markdown: fenced code blocks, inline code, bold, italic.
 * Input is assumed to be untrusted — we escape first, then apply formatting.
 */
function renderMarkdown(raw) {
  let text = esc(raw);

  // Fenced code blocks: ```lang\n...\n```
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<div class="code-block" data-lang="${lang}">${code.trimEnd()}</div>`;
  });

  // Inline code: `...`
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold: **...**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic: *...*
  text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Line breaks
  text = text.replace(/\n/g, '<br>');

  return text;
}

function addChatMessage(role, text) {
  // Remove welcome message if present
  const welcome = chatMessages.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  const wrapper = document.createElement('div');
  const timestamp = formatTime(new Date());

  if (role === 'user') {
    wrapper.className = 'chat-msg-user';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;

    const ts = document.createElement('span');
    ts.className = 'chat-timestamp';
    ts.textContent = timestamp;

    wrapper.appendChild(bubble);
    wrapper.appendChild(ts);
  } else {
    wrapper.className = 'chat-msg-ai';
    wrapper.innerHTML = `
      <div class="chat-msg-ai-header">
        <div class="chat-ai-icon"><span class="material-symbols-outlined">auto_awesome</span></div>
        <span class="chat-ai-label">Agent v0</span>
      </div>
      <div class="chat-bubble">${renderMarkdown(text)}</div>
      <span class="chat-timestamp">${timestamp}</span>
    `;
  }

  chatMessages.appendChild(wrapper);
  chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
  return wrapper;
}

function showChatThinking() {
  const div = document.createElement('div');
  div.className = 'chat-thinking';
  div.id = 'chat-thinking';
  div.innerHTML = `
    <div class="thinking-dots"><span></span><span></span><span></span></div>
    <span class="thinking-label">Thinking...</span>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

function removeChatThinking() {
  const el = $('chat-thinking');
  if (el) el.remove();
}

function appendChatChunk(text) {
  removeChatThinking();

  if (!currentChatBubble) {
    const wrapper = addChatMessage('ai', '');
    currentChatBubble = wrapper.querySelector('.chat-bubble');
    chatResponseBuffer = '';
  }

  chatResponseBuffer += text;
  currentChatBubble.textContent = chatResponseBuffer;
  chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

function finalizeChatResponse() {
  removeChatThinking();

  if (currentChatBubble && chatResponseBuffer) {
    // Re-render with markdown now that we have the full text
    currentChatBubble.innerHTML = renderMarkdown(chatResponseBuffer);

    // Add action chips
    const wrapper = currentChatBubble.closest('.chat-msg-ai');
    if (wrapper && !wrapper.querySelector('.chat-actions')) {
      const actions = document.createElement('div');
      actions.className = 'chat-actions';
      actions.innerHTML = `
        <button class="chat-action-chip" onclick="navigator.clipboard.writeText(this.closest('.chat-msg-ai').querySelector('.chat-bubble').textContent); toast('Copied', 'success')">
          <span class="material-symbols-outlined">content_copy</span> Copy
        </button>
      `;
      wrapper.appendChild(actions);
    }
  }

  currentChatBubble = null;
  chatResponseBuffer = '';
}

// Chat response events from server
socket.on('chat_response', (data) => {
  removeChatThinking();
  const text = data.content || data.text || '';
  addChatMessage('ai', text);
  // Non-streamed response — add copy action right away
  const lastAi = chatMessages.querySelector('.chat-msg-ai:last-child');
  if (lastAi && !lastAi.querySelector('.chat-actions')) {
    const actions = document.createElement('div');
    actions.className = 'chat-actions';
    actions.innerHTML = `
      <button class="chat-action-chip" onclick="navigator.clipboard.writeText(this.closest('.chat-msg-ai').querySelector('.chat-bubble').textContent); toast('Copied', 'success')">
        <span class="material-symbols-outlined">content_copy</span> Copy
      </button>
    `;
    lastAi.appendChild(actions);
  }
  currentChatBubble = null;
  chatResponseBuffer = '';
});

socket.on('chat_chunk', (data) => {
  appendChatChunk(data.delta || data.text || '');
});

socket.on('chat_complete', () => {
  finalizeChatResponse();
});

socket.on('chat_error', (data) => {
  removeChatThinking();
  currentChatBubble = null;
  chatResponseBuffer = '';
  addChatMessage('ai', `Error: ${data.message || 'Something went wrong'}`);
  toast(data.message || 'Chat error', 'error');
});

// Chat send handlers
chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// AI Sync button toggles chat panel visibility
$('aiSyncBtn').addEventListener('click', () => {
  showSidePanel('chat');
});

// ── Side Panel Search ──────────────────────────────────────────────────────

const sideSearchInput = $('sideSearchInput');
if (sideSearchInput) {
  sideSearchInput.addEventListener('keyup', () => {
    const query = sideSearchInput.value.trim().toLowerCase();
    const results = $('search-results');
    if (!query) {
      results.innerHTML = '<div class="empty-state" style="padding:24px 8px">Type a query to search across agents, tasks, memories, and audit logs.</div>';
      return;
    }

    // Search agents
    const matchedAgents = DEFAULT_AGENTS.filter(a =>
      a.id.toLowerCase().includes(query) || a.role.toLowerCase().includes(query)
    );

    results.innerHTML = '';
    if (matchedAgents.length > 0) {
      const heading = document.createElement('div');
      heading.style.cssText = 'font-size:0.6rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-3);padding:4px 0;font-weight:700';
      heading.textContent = 'Agents';
      results.appendChild(heading);
      matchedAgents.forEach(a => {
        const item = document.createElement('div');
        item.className = 'agent-item';
        item.innerHTML = `<span class="agent-dot idle"></span><span class="agent-name">${esc(a.id)}</span><span class="agent-role">${esc(a.role)}</span>`;
        results.appendChild(item);
      });
    }

    if (results.children.length === 0) {
      results.innerHTML = '<div class="empty-state" style="padding:24px 8px">No results found.</div>';
    }

    // Also trigger memory search
    socket.emit('search_memories', { query });
  });
}
