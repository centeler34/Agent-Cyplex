/**
 * Task and Result envelope type definitions for inter-agent communication.
 */

export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'running' | 'success' | 'partial' | 'failed' | 'timeout' | 'cancelled';
export type SourceChannel = 'cli' | 'telegram' | 'discord' | 'whatsapp' | 'api';

export interface TaskEnvelope {
  task_id: string;
  parent_task_id: string | null;
  source_agent: string;
  target_agent: string;
  task_type: string;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
  priority: Priority;
  deadline_ms: number;
  created_at: string;
  source_channel: SourceChannel;
}

export interface ResultEnvelope {
  task_id: string;
  agent_id: string;
  status: TaskStatus;
  output: Record<string, unknown>;
  artifacts: ArtifactRef[];
  duration_ms: number;
  token_usage: TokenUsage;
  completed_at: string;
  error?: string;
}

export interface ArtifactRef {
  name: string;
  path: string;
  type: string;
  size_bytes: number;
  hash_sha256: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface TaskNode {
  task: TaskEnvelope;
  result?: ResultEnvelope;
  dependencies: string[];
  dependents: string[];
  status: TaskStatus;
  assigned_agent: string;
  started_at?: string;
  completed_at?: string;
  retry_count: number;
  max_retries: number;
}
