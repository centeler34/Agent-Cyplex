/**
 * Gateway provider configuration types.
 */

export type ProviderType = 'anthropic' | 'openai' | 'gemini' | 'mistral' | 'claude_code';

/**
 * Authentication mode for a provider.
 *
 *   api_key      — Traditional API key (stored in keystore / env var).
 *   subscription — Use the provider's subscription login instead of an API key:
 *                    • Claude / Anthropic → routes through `claude` CLI (Claude Pro/Team)
 *                    • ChatGPT / OpenAI  → uses a stored session/access token from
 *                      the ChatGPT web session (ChatGPT Plus/Pro/Team)
 *                    • Gemini / Google    → uses Google Cloud ADC via `gcloud` OAuth
 *                      (Gemini Advanced / Google One AI Premium)
 */
export type AuthMode = 'api_key' | 'subscription';

export interface ProviderConfig {
  name: string;
  type: ProviderType;
  model: string;
  base_url?: string;
  key_ref?: string;
  auth_mode?: AuthMode;
  timeout_ms: number;
  max_retries: number;
}

export interface GatewayConfig {
  default_provider: string;
  fallback_provider: string;
  timeout_ms: number;
  max_retries: number;
  providers: Record<string, ProviderConfig>;
}

export interface CompletionRequest {
  model?: string;
  messages: Message[];
  max_tokens: number;
  temperature: number;
  system?: string;
  stream: boolean;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionResponse {
  id: string;
  content: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  finish_reason: string;
}

export interface CompletionChunk {
  id: string;
  delta: string;
  finish_reason?: string;
}
