/**
 * Local model adapter — for Ollama and LM Studio local AI backends.
 *
 * Ollama API (http://localhost:11434):
 *   GET  /api/tags           — List downloaded models
 *   GET  /api/ps             — List running/loaded models
 *   POST /api/chat           — Chat completion (native format)
 *   POST /api/pull           — Download a model
 *   Streaming: raw JSON lines, no SSE prefix. Termination: {"done": true}
 *   Token fields: prompt_eval_count, eval_count
 *   Sampling params go inside options: {}
 *
 * LM Studio API (http://127.0.0.1:1234):
 *   GET  /v1/models                         — List loaded models (OpenAI format)
 *   POST /v1/chat/completions               — Chat completion (OpenAI format)
 *   POST /api/v1/models/load                — Load model into memory
 *   POST /api/v1/models/unload              — Unload model from memory
 *   POST /api/v1/models/download            — Download a model
 *   GET  /api/v1/models/download-status     — Check download progress
 *   Streaming: SSE format with "data: " prefix. Termination: data: [DONE]
 *   Token fields: usage.prompt_tokens, usage.completion_tokens
 *   Sampling params are top-level request fields
 */

import type { ModelClient } from './model_client.js';
import type {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  ProviderConfig,
} from '../types/provider_config.js';

const DEFAULT_TIMEOUT_MS = 30000;
const CONNECT_TIMEOUT_MS = 5000;

export class LocalModelAdapter implements ModelClient {
  readonly provider: string;
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;

  constructor(config: ProviderConfig) {
    this.provider = config.type; // 'ollama' or 'lmstudio'
    this.model = config.model;
    this.baseUrl = (config.base_url ?? this.defaultUrl()).replace(/\/+$/, '');
    this.timeoutMs = config.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  }

  private defaultUrl(): string {
    return this.provider === 'lmstudio'
      ? 'http://127.0.0.1:1234'
      : 'http://localhost:11434';
  }

  // ── Connection Testing ──────────────────────────────────────────────────

  async testConnection(): Promise<{ ok: boolean; message: string; models?: string[] }> {
    try {
      const models = await this.listModels();
      return {
        ok: true,
        message: `Connected to ${this.provider} at ${this.baseUrl}`,
        models: models.length > 0 ? models : undefined,
      };
    } catch (err: any) {
      return { ok: false, message: this.diagnoseError(err) };
    }
  }

  // ── Model Management ───────────────────────────────────────────────────

  /**
   * List available models.
   * Ollama:    GET /api/tags → { models: [{ name, ... }] }
   * LM Studio: GET /v1/models → { data: [{ id, ... }] }
   */
  async listModels(): Promise<string[]> {
    const url = this.provider === 'ollama'
      ? `${this.baseUrl}/api/tags`
      : `${this.baseUrl}/v1/models`;

    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Failed to list models: HTTP ${res.status}`);

    const data: any = await res.json();
    const models: string[] = [];

    if (this.provider === 'ollama' && data.models) {
      for (const m of data.models) models.push(m.name || m.model);
    } else if (data.data) {
      for (const m of data.data) models.push(m.id || m.model);
    }

    return models;
  }

  /**
   * List currently running/loaded models.
   * Ollama:    GET /api/ps → { models: [...] }
   * LM Studio: GET /v1/models (same as list — loaded models are shown)
   */
  async listRunningModels(): Promise<string[]> {
    if (this.provider === 'ollama') {
      const res = await fetch(`${this.baseUrl}/api/ps`, {
        method: 'GET',
        signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      return (data.models || []).map((m: any) => m.name || m.model);
    }
    return this.listModels();
  }

  /**
   * Load a model into memory.
   * LM Studio: POST /api/v1/models/load { model }
   * Ollama:    POST /api/chat with empty messages (triggers model load)
   */
  async loadModel(modelName?: string): Promise<{ ok: boolean; message: string }> {
    const name = modelName ?? this.model;

    if (this.provider === 'lmstudio') {
      const res = await fetch(`${this.baseUrl}/api/v1/models/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        const body = await res.text();
        return { ok: false, message: `Failed to load model: HTTP ${res.status} — ${body}` };
      }
      return { ok: true, message: `Model "${name}" loaded` };
    }

    // Ollama: pull ensures available, then a chat request triggers load
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name, messages: [], stream: false, keep_alive: '10m' }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, message: `Failed to load model: HTTP ${res.status} — ${body}` };
    }
    return { ok: true, message: `Model "${name}" loaded` };
  }

  /**
   * Unload a model from memory.
   * LM Studio: POST /api/v1/models/unload { instance_id }
   * Ollama:    POST /api/chat with keep_alive: 0 (immediately unloads)
   */
  async unloadModel(modelName?: string): Promise<{ ok: boolean; message: string }> {
    const name = modelName ?? this.model;

    if (this.provider === 'lmstudio') {
      const res = await fetch(`${this.baseUrl}/api/v1/models/unload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_id: name }),
        signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = await res.text();
        return { ok: false, message: `Failed to unload: HTTP ${res.status} — ${body}` };
      }
      return { ok: true, message: `Model "${name}" unloaded` };
    }

    // Ollama: set keep_alive to 0 to immediately unload
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name, messages: [], stream: false, keep_alive: 0 }),
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, message: `Failed to unload: HTTP ${res.status} — ${body}` };
    }
    return { ok: true, message: `Model "${name}" unloaded` };
  }

  /**
   * Download a model.
   * LM Studio: POST /api/v1/models/download → { job_id, status }
   * Ollama:    POST /api/pull (streaming status updates)
   */
  async downloadModel(modelName: string): Promise<{ jobId?: string; message: string }> {
    if (this.provider === 'lmstudio') {
      const res = await fetch(`${this.baseUrl}/api/v1/models/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
        signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Download failed: HTTP ${res.status} — ${body}`);
      }

      const data: any = await res.json();
      return { jobId: data.job_id || data.id, message: `Download started for "${modelName}"` };
    }

    return { message: `Use 'agent-cyplex model download ${modelName}' for Ollama downloads` };
  }

  /**
   * Check download progress.
   * LM Studio: GET /api/v1/models/download-status
   */
  async downloadStatus(jobId: string): Promise<{ status: string; progress?: number; message: string }> {
    const res = await fetch(`${this.baseUrl}/api/v1/models/download-status`, {
      method: 'GET',
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`Status check failed: HTTP ${res.status}`);
    }

    const data: any = await res.json();
    return {
      status: data.status || 'unknown',
      progress: data.progress,
      message: data.message || data.status || 'unknown',
    };
  }

  // ── Chat Completion ─────────────────────────────────────────────────────

  /**
   * Ollama:    POST /api/chat   { model, messages, stream: false, options: { temperature, num_predict } }
   * LM Studio: POST /v1/chat/completions { model, messages, stream: false, temperature, max_tokens }
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model ?? this.model;
    const messages = this.buildMessages(request);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let url: string;
      let body: string;

      if (this.provider === 'lmstudio') {
        // LM Studio: OpenAI-compatible endpoint
        url = `${this.baseUrl}/v1/chat/completions`;
        body = JSON.stringify({
          model,
          messages,
          max_tokens: request.max_tokens,
          temperature: request.temperature,
          stream: false,
        });
      } else {
        // Ollama: native endpoint, sampling params inside options
        url = `${this.baseUrl}/api/chat`;
        body = JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature: request.temperature,
            num_predict: request.max_tokens,
          },
        });
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`${this.provider} API error (${res.status}): ${errBody}`);
      }

      const data: any = await res.json();

      if (this.provider === 'ollama') {
        // Ollama native response format
        return {
          id: `ollama-${Date.now()}`,
          content: data.message?.content ?? '',
          model: data.model ?? model,
          usage: {
            prompt_tokens: data.prompt_eval_count ?? 0,
            completion_tokens: data.eval_count ?? 0,
            total_tokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
          },
          finish_reason: data.done ? 'stop' : 'length',
        };
      }

      // LM Studio: OpenAI-compatible response format
      const choice = data.choices?.[0];
      return {
        id: data.id ?? `lmstudio-${Date.now()}`,
        content: choice?.message?.content ?? '',
        model: data.model ?? model,
        usage: {
          prompt_tokens: data.usage?.prompt_tokens ?? 0,
          completion_tokens: data.usage?.completion_tokens ?? 0,
          total_tokens: data.usage?.total_tokens ?? 0,
        },
        finish_reason: choice?.finish_reason ?? 'stop',
      };
    } catch (err: any) {
      throw new Error(this.diagnoseError(err));
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Streaming ───────────────────────────────────────────────────────────

  /**
   * Ollama:    POST /api/chat with stream: true → raw JSON lines
   * LM Studio: POST /v1/chat/completions with stream: true → SSE "data: " lines
   */
  async *stream(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    const model = request.model ?? this.model;
    const messages = this.buildMessages(request);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let url: string;
      let body: string;

      if (this.provider === 'lmstudio') {
        url = `${this.baseUrl}/v1/chat/completions`;
        body = JSON.stringify({
          model,
          messages,
          max_tokens: request.max_tokens,
          temperature: request.temperature,
          stream: true,
        });
      } else {
        url = `${this.baseUrl}/api/chat`;
        body = JSON.stringify({
          model,
          messages,
          stream: true,
          options: {
            temperature: request.temperature,
            num_predict: request.max_tokens,
          },
        });
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`${this.provider} API error (${res.status}): ${errBody}`);
      }

      if (!res.body) {
        throw new Error('Response body is null — streaming not supported');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (this.provider === 'ollama') {
            // Ollama: raw JSON lines, no prefix
            try {
              const data = JSON.parse(trimmed);
              if (data.done) return;
              yield {
                id: `ollama-${Date.now()}`,
                delta: data.message?.content ?? '',
              };
            } catch { /* skip malformed */ }
          } else {
            // LM Studio: SSE format with "data: " prefix
            if (!trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice(6);
            if (payload === '[DONE]') return;

            try {
              const data = JSON.parse(payload);
              const choice = data.choices?.[0];
              if (!choice) continue;
              yield {
                id: data.id ?? `lmstudio-${Date.now()}`,
                delta: choice.delta?.content ?? '',
                ...(choice.finish_reason ? { finish_reason: choice.finish_reason } : {}),
              };
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (err: any) {
      throw new Error(this.diagnoseError(err));
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Utilities ───────────────────────────────────────────────────────────

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private buildMessages(
    request: CompletionRequest
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];
    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }
    for (const msg of request.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }
    return messages;
  }

  private diagnoseError(err: any): string {
    if (err.name === 'AbortError' || err.code === 'ABORT_ERR') {
      return `${this.provider} request timed out after ${this.timeoutMs}ms. The model may be loading — try again.`;
    }
    if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
      return `Connection refused at ${this.baseUrl}. Make sure ${this.provider} is running` +
        (this.provider === 'ollama' ? ': ollama serve' : ': Open LM Studio → Start Server');
    }
    if (err.cause?.code === 'ENOTFOUND' || err.message?.includes('ENOTFOUND')) {
      return `Host not found: ${this.baseUrl}. Check the URL is correct.`;
    }
    return err.message || String(err);
  }
}
