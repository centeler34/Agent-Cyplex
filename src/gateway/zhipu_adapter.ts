/**
 * Zhipu AI adapter — implements ModelClient for the Zhipu/CodeGeeX API.
 *
 * Zhipu AI (makers of GLM and CodeGeeX) provides an OpenAI-compatible API.
 * API keys are in {id}.{secret} format (e.g., "abc123.xyz789").
 *
 * Models: glm-4.5-flash (free), glm-4.7-flash (free), glm-4.7, codegeex-4, glm-z1-flash (free)
 * Docs:   https://open.bigmodel.cn/
 */

import OpenAI from 'openai';
import type { ModelClient } from './model_client.js';
import type {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  ProviderConfig,
} from '../types/provider_config.js';

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4/';

export class ZhipuAdapter implements ModelClient {
  readonly provider = 'zhipu';
  private client: OpenAI;
  private model: string;

  constructor(config: ProviderConfig) {
    this.model = config.model;
    const apiKey = config.key_ref ?? process.env.ZHIPU_API_KEY ?? '';

    if (apiKey && !apiKey.includes('.')) {
      console.warn('[zhipu] API key should be in {id}.{secret} format (e.g., "abc123.xyz789")');
    }

    this.client = new OpenAI({
      apiKey,
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
