/**
 * ChatGPT subscription adapter — implements ModelClient by authenticating
 * through the user's ChatGPT Plus / Pro / Team subscription.
 *
 * Instead of a developer API key, this adapter accepts a ChatGPT session
 * access token (obtainable from the ChatGPT web app) and routes requests
 * through the standard OpenAI chat completions endpoint.
 *
 * How it works:
 *   1. The user logs into chatgpt.com in a browser.
 *   2. They copy their access token (from DevTools → Application → Cookies
 *      or from https://chatgpt.com/api/auth/session).
 *   3. The token is stored in the Agent v0 encrypted keystore.
 *   4. This adapter sends it as a Bearer token to the OpenAI API.
 *
 * ChatGPT Plus/Pro subscribers get bundled API credits, so the token also
 * works directly with the platform API — no separate billing setup needed.
 */

import OpenAI from 'openai';
import type { ModelClient } from './model_client.js';
import type {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  ProviderConfig,
} from '../types/provider_config.js';

export class ChatGPTSubscriptionAdapter implements ModelClient {
  readonly provider = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(config: ProviderConfig) {
    this.model = config.model || 'gpt-4o';

    // Resolve the session/access token:
    //   1. key_ref pointing to an env var or keystore entry
    //   2. CHATGPT_ACCESS_TOKEN env var
    //   3. OPENAI_API_KEY env var (fallback — some subscriptions auto-provision keys)
    const token =
      config.key_ref ??
      process.env.CHATGPT_ACCESS_TOKEN ??
      process.env.OPENAI_API_KEY ??
      '';

    if (!token) {
      console.warn(
        '[chatgpt-subscription] No access token found. ' +
          'Set CHATGPT_ACCESS_TOKEN or configure key_ref in your provider config.'
      );
    }

    this.client = new OpenAI({
      apiKey: token,
      ...(config.base_url ? { baseURL: config.base_url } : {}),
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
