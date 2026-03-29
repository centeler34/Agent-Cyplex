/**
 * Anthropic Claude adapter — implements ModelClient for the Claude API.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ModelClient } from './model_client.js';
import type {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  ProviderConfig,
} from '../types/provider_config.js';

export class AnthropicAdapter implements ModelClient {
  readonly provider = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(config: ProviderConfig) {
    this.model = config.model;
    this.client = new Anthropic({
      apiKey: config.key_ref ?? process.env.ANTHROPIC_API_KEY,
      ...(config.base_url ? { baseURL: config.base_url } : {}),
      timeout: config.timeout_ms,
      maxRetries: config.max_retries,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model ?? this.model;
    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

    const systemText =
      request.system ??
      (systemMessages.length > 0
        ? systemMessages.map((m) => m.content).join('\n')
        : undefined);

    const response = await this.client.messages.create({
      model,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      ...(systemText ? { system: systemText } : {}),
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      id: response.id,
      content: textContent,
      model: response.model,
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finish_reason: response.stop_reason ?? 'stop',
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    const model = request.model ?? this.model;
    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

    const systemText =
      request.system ??
      (systemMessages.length > 0
        ? systemMessages.map((m) => m.content).join('\n')
        : undefined);

    const stream = this.client.messages.stream({
      model,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      ...(systemText ? { system: systemText } : {}),
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    let id = '';

    for await (const event of stream) {
      if (event.type === 'message_start') {
        id = event.message.id;
      } else if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield {
          id,
          delta: event.delta.text,
        };
      } else if (event.type === 'message_delta') {
        yield {
          id,
          delta: '',
          finish_reason: event.delta.stop_reason ?? 'stop',
        };
      }
    }
  }

  countTokens(text: string): number {
    // Approximate token count: ~4 characters per token for English text.
    return Math.ceil(text.length / 4);
  }
}
