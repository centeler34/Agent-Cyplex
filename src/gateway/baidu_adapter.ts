/**
 * Baidu adapter — implements ModelClient for Baidu's ERNIE / Qianfan API.
 *
 * Baidu Qianfan provides an OpenAI-compatible v2 endpoint.
 * Uses a Bearer API key (typically starting with "bce-v3/ALTAK-..."),
 * NOT the legacy AK/SK OAuth flow.
 *
 * Models: ernie-4.5, ernie-4.0-turbo, ernie-x1 (reasoning)
 * Docs:   https://cloud.baidu.com/doc/WENXINWORKSHOP/
 */

import OpenAI from 'openai';
import type { ModelClient } from './model_client.js';
import type {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  ProviderConfig,
} from '../types/provider_config.js';

const DEFAULT_BASE_URL = 'https://qianfan.baidubce.com/v2';

export class BaiduAdapter implements ModelClient {
  readonly provider = 'baidu';
  private client: OpenAI;
  private model: string;

  constructor(config: ProviderConfig) {
    this.model = config.model;
    this.client = new OpenAI({
      apiKey: config.key_ref ?? process.env.QIANFAN_API_KEY,
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
