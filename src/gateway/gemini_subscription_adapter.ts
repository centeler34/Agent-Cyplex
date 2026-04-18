/**
 * Gemini subscription adapter — implements ModelClient by authenticating
 * through Google Cloud Application Default Credentials (ADC) instead of
 * a Gemini API key.
 *
 * Users with a Google account (Gemini Advanced / Google One AI Premium)
 * can authenticate once with `gcloud auth application-default login`,
 * and this adapter will use the resulting OAuth token for every request.
 *
 * How it works:
 *   1. User runs: `gcloud auth application-default login`
 *   2. This adapter spawns `gcloud auth print-access-token` to obtain a
 *      fresh bearer token before each batch of requests.
 *   3. Requests hit the Generative Language REST API with the bearer token.
 *
 * No API key, no billing project — just a Google account with Gemini access.
 */

import { execSync } from 'node:child_process';
import type { ModelClient } from './model_client.js';
import type {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  ProviderConfig,
} from '../types/provider_config.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiContent {
  role: string;
  parts: { text: string }[];
}

interface GeminiGenerateRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[] };
  generationConfig: {
    maxOutputTokens: number;
    temperature: number;
  };
}

interface GeminiCandidate {
  content: { parts: { text: string }[]; role: string };
  finishReason?: string;
}

interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export class GeminiSubscriptionAdapter implements ModelClient {
  readonly provider = 'gemini';
  private model: string;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: ProviderConfig) {
    this.model = config.model || 'gemini-pro';
  }

  // ── Token management ──────────────────────────────────────────────────────

  /**
   * Get a fresh OAuth access token from gcloud ADC.
   * Tokens are cached for ~50 minutes (they expire after 60).
   */
  private getAccessToken(): string {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    try {
      const token = execSync('gcloud auth print-access-token', {
        encoding: 'utf-8',
        timeout: 10_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();

      if (!token) {
        throw new Error('gcloud returned an empty token');
      }

      this.cachedToken = token;
      // Cache for 50 minutes (gcloud tokens last ~60 min).
      this.tokenExpiresAt = now + 50 * 60 * 1000;
      return token;
    } catch (err) {
      throw new Error(
        'Failed to obtain Google OAuth token. ' +
          'Run `gcloud auth application-default login` first, then retry.\n' +
          `  Underlying error: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // ── ModelClient.complete() ────────────────────────────────────────────────

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model ?? this.model;
    const token = this.getAccessToken();
    const body = this.buildRequestBody(request);

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as GeminiGenerateResponse;
    const candidate = data.candidates?.[0];
    const text =
      candidate?.content?.parts?.map((p) => p.text).join('') ?? '';

    const promptTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      id: `gemini-sub-${Date.now()}`,
      content: text,
      model,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      finish_reason: candidate?.finishReason ?? 'stop',
    };
  }

  // ── ModelClient.stream() ──────────────────────────────────────────────────

  async *stream(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    const model = request.model ?? this.model;
    const token = this.getAccessToken();
    const body = this.buildRequestBody(request);
    const id = `gemini-sub-${Date.now()}`;

    const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${text}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('No response body from Gemini streaming endpoint');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop()!;

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        let chunk: GeminiGenerateResponse;
        try {
          chunk = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        const candidate = chunk.candidates?.[0];
        const text =
          candidate?.content?.parts?.map((p) => p.text).join('') ?? '';
        const finishReason = candidate?.finishReason;

        yield {
          id,
          delta: text,
          ...(finishReason ? { finish_reason: finishReason } : {}),
        };
      }
    }
  }

  // ── ModelClient.countTokens() ─────────────────────────────────────────────

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private buildRequestBody(request: CompletionRequest): GeminiGenerateRequest {
    const systemText =
      request.system ??
      (request.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n') || undefined);

    const nonSystemMessages = request.messages.filter(
      (m) => m.role !== 'system'
    );

    const contents: GeminiContent[] = nonSystemMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    return {
      contents,
      ...(systemText
        ? { systemInstruction: { parts: [{ text: systemText }] } }
        : {}),
      generationConfig: {
        maxOutputTokens: request.max_tokens,
        temperature: request.temperature,
      },
    };
  }
}
