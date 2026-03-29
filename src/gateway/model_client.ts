/**
 * ModelClient interface — abstract contract for all AI provider adapters.
 */

import type {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
} from '../types/provider_config.js';

export interface ModelClient {
  readonly provider: string;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<CompletionChunk>;
  countTokens(text: string): number;
}
