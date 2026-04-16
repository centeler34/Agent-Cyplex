/**
 * Moonshot AI adapter — implements ModelClient for the Kimi / Moonshot API.
 *
 * Moonshot AI's API is fully OpenAI-compatible. The moonshot-v1-auto model
 * automatically selects context window size (8k/32k/128k) based on input length.
 *
 * Models: moonshot-v1-auto, kimi-k2.5, moonshot-v1-128k, moonshot-v1-32k, moonshot-v1-8k
 * Docs:   https://platform.moonshot.cn/
 */

import OpenAI from 'openai';
import type { ModelClient } from './model_client.js';
import type {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  ProviderConfig,
} from '../types/provider_config.js';

const DEFAULT_BASE_URL = 'https://api.moonshot.cn/v1';

export class MoonshotAdapter implements ModelClient {
  readonly provider = 'moonshot';
  private client: OpenAI;
  private model: string;

  constructor(config: ProviderConfig) {
    this.model = config.model;
    this.client = new OpenAI({
      apiKey: config.key_ref ?? process.env.MOONSHOT_API_KEY,
      baseURL: config.base_url ?? DEFAULT_BASE_URL,
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
