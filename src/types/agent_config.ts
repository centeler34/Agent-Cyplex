/**
 * Agent configuration type definitions.
 */

export type AgentRole =
  | 'agentic'
  | 'recon'
  | 'code'
  | 'exploit_research'
  | 'report'
  | 'monitor'
  | 'osint_analyst'
  | 'threat_intel'
  | 'forensics'
  | 'scribe';

export type AgentState = 'idle' | 'busy' | 'error' | 'stopped' | 'starting';

export interface AgentPermissions {
  fs_read: string[];
  fs_write: string[];
  fs_execute: boolean;
  execute_allowed_binaries: string[];
  network_allow: string[];
  network_deny: string[];
  api_providers: string[];
  api_keys: string[];
  agent_communicate: string[];
  agent_spawn: boolean;
}

export interface AgentConfig {
  id: AgentRole;
  enabled: boolean;
  workspace: string;
  model_override?: string;
  fallback_model?: string;
  skills: string[];
  permissions: AgentPermissions;
  max_concurrent_tasks: number;
  timeout_ms: number;
  rate_limit: {
    tokens_per_minute: number;
    requests_per_minute: number;
  };
}

export interface AgentStatus {
  id: AgentRole;
  state: AgentState;
  current_tasks: string[];
  total_tasks_completed: number;
  total_tasks_failed: number;
  uptime_ms: number;
  token_usage: {
    session_total: number;
    budget_remaining: number;
  };
  last_heartbeat: string;
}

export const DEFAULT_PERMISSIONS: AgentPermissions = {
  fs_read: [],
  fs_write: [],
  fs_execute: false,
  execute_allowed_binaries: [],
  network_allow: [],
  network_deny: [],
  api_providers: [],
  api_keys: [],
  agent_communicate: [],
  agent_spawn: false,
};
