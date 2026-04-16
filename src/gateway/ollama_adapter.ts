/**
 * Ollama adapter — implements ModelClient for local Ollama instances.
 *
 * Ollama exposes an OpenAI-compatible API at /v1, so this adapter
 * uses the OpenAI SDK with a custom base URL pointing to localhost.
 *
 * Default port: 11434
 * Env var:      OLLAMA_HOST (e.g. http://192.168.1.10:11434)
 * Models:       llama3.2, codellama, mistral, gemma2, phi3, etc.
 * Docs:         https://github.com/ollama/ollama/blob/main/docs/openai.md
 */

import OpenAI from 'openai';
import type { ModelClient } from './model_client.js';
import type {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  ProviderConfig,
} from '../types/provider_config.js';

const DEFAULT_BASE_URL = 'http://localhost:11434/v1';

function resolveBaseUrl(config: ProviderConfig): string {
  if (config.base_url) return config.base_url;

  // Support the standard OLLAMA_HOST env var (doesn't include /v1)
  const host = process.env.OLLAMA_HOST;
  if (host) {
    const normalized = host.replace(/\/+$/, '');
    return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
  }

  return DEFAULT_BASE_URL;
}

export class OllamaAdapter implements ModelClient {
  readonly provider = 'ollama';
  private client: OpenAI;
  private model: string;

  constructor(config: ProviderConfig) {
    this.model = config.model || 'llama3.2';
    this.client = new OpenAI({
      apiKey: config.key_ref ?? 'ollama',
      baseURL: resolveBaseUrl(config),
      timeout: config.timeout_ms,
      maxRetries: config.max_retries,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model ?? this.model;

    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }
    for (const msg of request.messages) {
      messages.push({
        role: msg.role,
        content: msg.content,
      } as OpenAI.ChatCompletionMessageParam);
    }

    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_completion_tokens: request.max_tokens,
      temperature: request.temperature,
      stream: false,
    });

    const choice = response.choices[0];

    return {
      id: response.id,
      content: choice.message.content ?? '',
      model: response.model,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens ?? 0,
        completion_tokens: response.usage?.completion_tokens ?? 0,
        total_tokens: response.usage?.total_tokens ?? 0,
      },
      finish_reason: choice.finish_reason ?? 'stop',
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    const model = request.model ?? this.model;

    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }
    for (const msg of request.messages) {
      messages.push({
        role: msg.role,
        content: msg.content,
      } as OpenAI.ChatCompletionMessageParam);
    }

    const stream = await this.client.chat.completions.create({
      model,
      messages,
      max_completion_tokens: request.max_tokens,
      temperature: request.temperature,
      stream: true,
    });

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      yield {
        id: chunk.id,
        delta: choice.delta?.content ?? '',
        ...(choice.finish_reason ? { finish_reason: choice.finish_reason } : {}),
      };
    }
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
