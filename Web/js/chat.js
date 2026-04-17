/**
 * Neon Architect — AI Chat Module
 * Handles the conversation panel: user input, AI responses,
 * typing indicator, and model selection.
 */

import { $, escapeHtml, timeNow, bus } from './utils.js';
import { getEditorContent } from './editor.js';
import { getActiveTab } from './editor.js';

const chatMessages = $('chatMessages');
const chatInput = $('chatInput');
const chatSend = $('chatSend');
const modelSelect = $('modelSelect');

let isThinking = false;

const RESPONSES = [
  "I've analyzed your code. Here's what I found: The implementation looks solid, but you could consider adding error boundaries around the async operations to catch potential runtime failures.",
  "Great question! Looking at your architecture, I recommend extracting that logic into a custom hook. It would make the component more testable and reusable.",
  "I see the issue. The state update is happening in a callback that captures the initial value. You'll want to use a functional update to access the latest state: `setCount(prev => prev + 1)`.",
  "For this use case, I'd suggest using `useMemo` to cache the expensive computation. It will prevent unnecessary recalculations on every render.",
  "Your TypeScript types look correct. If you're seeing errors, try running `tsc --noEmit` to get a clearer picture of what's wrong. Often stale build caches cause phantom errors.",
  "That's an interesting design choice. One tradeoff to consider: the approach you're using optimizes for developer ergonomics but could impact bundle size. Worth profiling both.",
  "I've reviewed the file. The pattern is valid, but you might want to add JSDoc comments to the public API — it'll improve the IntelliSense experience for other developers.",
  "The best practice here is to separate your concerns: keep business logic in pure functions, side effects in hooks, and presentation in components. Your code is mostly there already.",
];

/** Add a user message bubble to the chat */
export function addUserMessage(text) {
  const el = document.createElement('div');
  el.className = 'flex items-start gap-3 justify-end';
  el.innerHTML = `
    <div class="flex-1 max-w-md">
      <div class="bg-primary text-on-primary px-4 py-3 rounded-xl ml-auto">
        <p class="text-sm">${escapeHtml(text)}</p>
      </div>
      <span class="text-xs text-on-surface-variant mt-1 block text-right">${timeNow()}</span>
    </div>
    <div class="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
      <span class="material-symbols-outlined text-sm text-on-surface-variant">person</span>
    </div>
  `;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/** Add an AI message bubble to the chat */
export function addAIMessage(text) {
  const el = document.createElement('div');
  el.className = 'flex items-start gap-3';
  el.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
      <span class="material-symbols-outlined text-sm text-on-primary">auto_awesome</span>
    </div>
    <div class="flex-1 max-w-md">
      <div class="bg-surface-container-high px-4 py-3 rounded-xl">
        <p class="text-sm text-on-surface">${escapeHtml(text)}</p>
      </div>
      <span class="text-xs text-on-surface-variant mt-1 block">Neon Architect · ${timeNow()}</span>
    </div>
  `;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/** Show typing indicator while AI is "thinking" */
function showTypingIndicator() {
  const el = document.createElement('div');
  el.id = 'typingIndicator';
  el.className = 'flex items-start gap-3';
  el.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
      <span class="material-symbols-outlined text-sm text-on-primary">auto_awesome</span>
    </div>
    <div class="flex-1">
      <div class="bg-surface-container-high px-4 py-3 rounded-xl inline-block">
        <div class="flex gap-1">
          <span class="w-2 h-2 bg-on-surface-variant rounded-full typing-dot"></span>
          <span class="w-2 h-2 bg-on-surface-variant rounded-full typing-dot"></span>
          <span class="w-2 h-2 bg-on-surface-variant rounded-full typing-dot"></span>
        </div>
      </div>
    </div>
  `;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
  $('typingIndicator')?.remove();
}

/** Generate a context-aware mock AI response */
function generateAIResponse(userText) {
  const t = userText.toLowerCase();
  const activeTab = getActiveTab();
  const model = modelSelect?.value || 'gpt-4';

  if (t.includes('hello') || t.includes('hi ') || t === 'hi') {
    return `Hello! I'm running on ${model}. What would you like to work on today? I can help debug, refactor, explain code, or design new features.`;
  }
  if (t.includes('help') || t.includes('what can you')) {
    return "I can: 1) Analyze and explain code in the editor, 2) Suggest refactors and improvements, 3) Debug errors and find root causes, 4) Generate new code from a description, 5) Review architecture and propose changes. Just ask!";
  }
  if (t.includes('explain') && activeTab) {
    const content = getEditorContent();
    const lines = content.split('\n').length;
    return `You have "${activeTab}" open (${lines} lines). At a glance, this file appears to be well-structured. Would you like me to walk through it section by section, or focus on a specific area?`;
  }
  if (t.includes('error') || t.includes('bug') || t.includes('broken')) {
    return "Let's debug this together. Can you share the exact error message? I'll look at the stack trace to identify the root cause, then we can work through the fix.";
  }
  if (t.includes('refactor') || t.includes('clean')) {
    return "Refactoring is about reducing complexity without changing behavior. Before we start, let me ask: what's the pain point? Long functions, unclear naming, duplicated logic, or tight coupling? The approach differs for each.";
  }
  if (t.includes('test')) {
    return "For testing, I recommend: 1) Unit tests for pure logic, 2) Integration tests for module boundaries, 3) E2E tests for critical user flows. Don't chase 100% coverage — chase meaningful coverage.";
  }
  return RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
}

/** Send the user's chat message and trigger an AI response */
export function sendChat() {
  const text = chatInput.value.trim();
  if (!text || isThinking) return;

  addUserMessage(text);
  chatInput.value = '';
  isThinking = true;
  showTypingIndicator();

  // Simulate thinking delay
  const delay = 800 + Math.random() * 1200;
  setTimeout(() => {
    removeTypingIndicator();
    addAIMessage(generateAIResponse(text));
    isThinking = false;
    bus.emit('chat:response');
  }, delay);
}

// ── Event Wiring ─────────────────────────────────────────────────────────
chatSend?.addEventListener('click', sendChat);

chatInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
});

// Listen for external chat actions
bus.on('chat:send', text => {
  if (text) {
    chatInput.value = text;
    sendChat();
  }
});

bus.on('chat:clear', () => {
  chatMessages.innerHTML = '';
  addAIMessage('Conversation cleared. What would you like to work on?');
});
