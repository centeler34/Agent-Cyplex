/**
 * Claude Code adapter — implements ModelClient by routing requests through
 * the Claude Code CLI (`@anthropic-ai/claude-code`).
 *
 * Instead of hitting the Anthropic HTTP API directly, this adapter spawns
 * the `claude` CLI in non-interactive print mode.  This gives Agent v0
 * access to Claude Code's full tool-use loop, extended thinking, and
 * session management — all behind the same ModelClient interface that
 * the rest of the gateway already understands.
 *
 * Modes:
 *   complete() — `claude -p --output-format json`  (single JSON result)
 *   stream()   — `claude -p --output-format stream-json` (NDJSON stream)
 */

import { spawn } from 'node:child_process';
import type { ModelClient } from './model_client.js';
import type {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  ProviderConfig,
} from '../types/provider_config.js';

/** Shape returned by `claude -p --output-format json`. */
interface ClaudeJsonResult {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error';
  cost_usd: number;
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result: string;
  session_id: string;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

/** Individual message in the stream-json output. */
interface ClaudeStreamMessage {
  type: 'system' | 'assistant' | 'result';
  subtype?: string;
  // assistant messages
  message?: {
    content: Array<{ type: string; text?: string }>;
    model?: string;
    usage?: { input_tokens: number; output_tokens: number };
  };
  // result messages
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  usage?: { input_tokens: number; output_tokens: number };
}

export class ClaudeCodeAdapter implements ModelClient {
  readonly provider = 'claude_code';
  private model: string;
  private maxTurns: number;
  private cwd: string;
  private claudeBin: string;

  constructor(config: ProviderConfig) {
    this.model = config.model || 'claude-sonnet-4-6';
    this.maxTurns = config.max_retries > 0 ? config.max_retries : 3;
    this.cwd = process.cwd();
    this.claudeBin = 'claude'; // Resolved via PATH
  }

  // -------------------------------------------------------------------------
  // ModelClient.complete()
  // -------------------------------------------------------------------------

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const prompt = this.buildPrompt(request);
    const model = request.model ?? this.model;

    const args = [
      '--print',
      '--output-format', 'json',
      '--model', model,
      '--max-turns', String(this.maxTurns),
      '--no-session-persistence',
    ];

    if (request.system) {
      args.push('--system-prompt', request.system);
    }

    args.push(prompt);

    const raw = await this.exec(args);

    let parsed: ClaudeJsonResult;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // If the output isn't valid JSON, treat the raw text as the result.
      return {
        id: `cc-${Date.now()}`,
        content: raw.trim(),
        model,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        finish_reason: 'stop',
      };
    }

    if (parsed.is_error) {
      throw new Error(`Claude Code request failed: ${parsed.result}`);
    }

    const inputTokens = parsed.usage?.input_tokens ?? 0;
    const outputTokens = parsed.usage?.output_tokens ?? 0;

    return {
      id: parsed.session_id ?? `cc-${Date.now()}`,
      content: parsed.result,
      model,
      usage: {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      },
      finish_reason: parsed.subtype === 'success' ? 'stop' : 'length',
    };
  }

  // -------------------------------------------------------------------------
  // ModelClient.stream()
  // -------------------------------------------------------------------------

  async *stream(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    const prompt = this.buildPrompt(request);
    const model = request.model ?? this.model;
    const id = `cc-${Date.now()}`;

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--model', model,
      '--max-turns', String(this.maxTurns),
      '--no-session-persistence',
    ];

    if (request.system) {
      args.push('--system-prompt', request.system);
    }

    args.push(prompt);

    const child = spawn(this.claudeBin, args, {
      cwd: this.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let buffer = '';

    const lines = new ReadableLines(child.stdout!);

    for await (const line of lines) {
      if (!line.trim()) continue;

      let msg: ClaudeStreamMessage;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // skip non-JSON lines
      }

      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) {
            yield { id, delta: block.text };
          }
        }
      } else if (msg.type === 'result') {
        // If the result carries text we haven't streamed yet, emit it.
        if (msg.result) {
          yield { id, delta: msg.result };
        }
        yield {
          id,
          delta: '',
          finish_reason: msg.is_error ? 'error' : 'stop',
        };
      }
    }

    // Wait for process to exit.
    await new Promise<void>((resolve, reject) => {
      child.on('close', (code) => {
        if (code && code !== 0) {
          reject(new Error(`Claude Code exited with code ${code}`));
        } else {
          resolve();
        }
      });
      child.on('error', reject);
    });
  }

  // -------------------------------------------------------------------------
  // ModelClient.countTokens()
  // -------------------------------------------------------------------------

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Build a flat prompt string from the CompletionRequest messages. */
  private buildPrompt(request: CompletionRequest): string {
    const parts: string[] = [];
    for (const msg of request.messages) {
      if (msg.role === 'system') continue; // handled via --system-prompt
      parts.push(msg.content);
    }
    return parts.join('\n\n');
  }

  /** Spawn `claude` and collect all stdout into a string. */
  private exec(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.claudeBin, args, {
        cwd: this.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      const chunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout!.on('data', (d: Buffer) => chunks.push(d));
      child.stderr!.on('data', (d: Buffer) => stderrChunks.push(d));

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn Claude Code CLI: ${err.message}`));
      });

      child.on('close', (code) => {
        const stdout = Buffer.concat(chunks).toString('utf-8');
        if (code && code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString('utf-8');
          reject(
            new Error(
              `Claude Code exited with code ${code}: ${stderr || stdout}`
            )
          );
        } else {
          resolve(stdout);
        }
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Utility: async line iterator over a readable stream
// ---------------------------------------------------------------------------

class ReadableLines {
  private stream: NodeJS.ReadableStream;

  constructor(stream: NodeJS.ReadableStream) {
    this.stream = stream;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    let buffer = '';
    for await (const chunk of this.stream) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop()!; // keep incomplete last line in buffer
      for (const line of lines) {
        yield line;
      }
    }
    if (buffer.length > 0) {
      yield buffer;
    }
  }
}
