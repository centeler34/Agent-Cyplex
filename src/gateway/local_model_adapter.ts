/**
 * Local model adapter — shared adapter for Ollama and LM Studio.
 *
 * Both Ollama and LM Studio expose an OpenAI-compatible REST API at
 * /v1/chat/completions, so a single adapter handles both backends.
 */

import type { ModelClient } from './model_client.js';
import type {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  ProviderConfig,
} from '../types/provider_config.js';

export class LocalModelAdapter implements ModelClient {
  readonly provider: string;
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;

  constructor(config: ProviderConfig) {
    this.provider = config.type; // 'ollama' or 'lmstudio'
    this.model = config.model;
    this.baseUrl = (config.base_url ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.timeoutMs = config.timeout_ms;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model ?? this.model;

    const messages = this.buildMessages(request);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: request.max_tokens,
          temperature: request.temperature,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Local model API error (${res.status}): ${body}`
        );
      }

      const data: any = await res.json();
      const choice = data.choices?.[0];

      return {
        id: data.id ?? `local-${Date.now()}`,
        content: choice?.message?.content ?? '',
        model: data.model ?? model,
        usage: {
          prompt_tokens: data.usage?.prompt_tokens ?? 0,
          completion_tokens: data.usage?.completion_tokens ?? 0,
          total_tokens: data.usage?.total_tokens ?? 0,
        },
        finish_reason: choice?.finish_reason ?? 'stop',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async *stream(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    const model = request.model ?? this.model;
    const messages = this.buildMessages(request);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: request.max_tokens,
          temperature: request.temperature,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Local model API error (${res.status}): ${body}`
        );
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
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') return;

          try {
            const data = JSON.parse(payload);
            const choice = data.choices?.[0];
            if (!choice) continue;

            yield {
              id: data.id ?? `local-${Date.now()}`,
              delta: choice.delta?.content ?? '',
              ...(choice.finish_reason
                ? { finish_reason: choice.finish_reason }
                : {}),
            };
          } catch {
            // Skip malformed JSON lines.
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  countTokens(text: string): number {
    // Approximate token count: ~4 characters per token for English text.
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
}
