/**
 * Google Gemini adapter — implements ModelClient for the Gemini API.
 *
 * Models: gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash
 * Docs:   https://ai.google.dev/gemini-api/docs/models
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import type { ModelClient } from './model_client.js';
import type {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  ProviderConfig,
} from '../types/provider_config.js';

export class GeminiAdapter implements ModelClient {
  readonly provider = 'gemini';
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(config: ProviderConfig) {
    this.model = config.model;
    const apiKey = config.key_ref ?? process.env.GOOGLE_API_KEY ?? '';
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  private buildModel(modelName: string, systemInstruction?: string): GenerativeModel {
    return this.genAI.getGenerativeModel({
      model: modelName,
      ...(systemInstruction ? { systemInstruction } : {}),
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const modelName = request.model ?? this.model;

    const systemText =
      request.system ??
      (request.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n') ||
      undefined);

    const model = this.buildModel(modelName, systemText);

    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');
    const history = nonSystemMessages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];

    const chat = model.startChat({
      history,
      generationConfig: {
        maxOutputTokens: request.max_tokens,
        temperature: request.temperature,
      },
    });

    const result = await chat.sendMessage(lastMessage?.content ?? '');
    const response = result.response;
    const text = response.text();

    const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      id: `gemini-${Date.now()}`,
      content: text,
      model: modelName,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      finish_reason: response.candidates?.[0]?.finishReason ?? 'stop',
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    const modelName = request.model ?? this.model;

    const systemText =
      request.system ??
      (request.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n') ||
      undefined);

    const model = this.buildModel(modelName, systemText);

    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');
    const history = nonSystemMessages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];

    const chat = model.startChat({
      history,
      generationConfig: {
        maxOutputTokens: request.max_tokens,
        temperature: request.temperature,
      },
    });

    const result = await chat.sendMessageStream(lastMessage?.content ?? '');
    const id = `gemini-${Date.now()}`;

    for await (const chunk of result.stream) {
      const text = chunk.text();
      const finishReason = chunk.candidates?.[0]?.finishReason;

      yield {
        id,
        delta: text,
        ...(finishReason ? { finish_reason: finishReason } : {}),
      };
    }
  }

  countTokens(text: string): number {
    // Approximate token count: ~4 characters per token for English text.
    return Math.ceil(text.length / 4);
  }
}
