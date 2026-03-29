/**
 * BaseAgent — Abstract base class for all subordinate agents.
 * Provides message queue handling, audit logging, skill execution, and workspace management.
 */

import type { TaskEnvelope, ResultEnvelope, TokenUsage } from '../types/task_envelope.js';
import type { AgentConfig, AgentRole, AgentState } from '../types/agent_config.js';
import type { ModelClient } from '../gateway/model_client.js';

export abstract class BaseAgent {
  readonly id: AgentRole;
  protected config: AgentConfig;
  protected state: AgentState = 'idle';
  protected modelClient: ModelClient | null = null;
  protected activeTasks: Map<string, TaskEnvelope> = new Map();
  protected totalCompleted = 0;
  protected totalFailed = 0;
  protected startedAt: Date;
  protected tokenUsage: TokenUsage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
  };

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.config = config;
    this.startedAt = new Date();
  }

  setModelClient(client: ModelClient): void {
    this.modelClient = client;
  }

  getState(): AgentState {
    return this.state;
  }

  /**
   * Handle an incoming task from Agentic.
   */
  async handleTask(task: TaskEnvelope): Promise<ResultEnvelope> {
    this.state = 'busy';
    this.activeTasks.set(task.task_id, task);
    const startTime = Date.now();

    try {
      const result = await this.executeTask(task);
      this.totalCompleted++;
      this.activeTasks.delete(task.task_id);
      this.state = this.activeTasks.size > 0 ? 'busy' : 'idle';
      return result;
    } catch (error) {
      this.totalFailed++;
      this.activeTasks.delete(task.task_id);
      this.state = this.activeTasks.size > 0 ? 'busy' : 'idle';

      return {
        task_id: task.task_id,
        agent_id: this.id,
        status: 'failed',
        output: {},
        artifacts: [],
        duration_ms: Date.now() - startTime,
        token_usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0 },
        completed_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Subclasses implement their specific task logic here.
   */
  protected abstract executeTask(task: TaskEnvelope): Promise<ResultEnvelope>;

  /**
   * Build a successful result envelope.
   */
  protected buildResult(
    taskId: string,
    output: Record<string, unknown>,
    startTime: number,
    usage?: Partial<TokenUsage>,
  ): ResultEnvelope {
    const tokenUsage: TokenUsage = {
      prompt_tokens: usage?.prompt_tokens ?? 0,
      completion_tokens: usage?.completion_tokens ?? 0,
      total_tokens: usage?.total_tokens ?? 0,
      estimated_cost_usd: usage?.estimated_cost_usd ?? 0,
    };

    this.tokenUsage.prompt_tokens += tokenUsage.prompt_tokens;
    this.tokenUsage.completion_tokens += tokenUsage.completion_tokens;
    this.tokenUsage.total_tokens += tokenUsage.total_tokens;
    this.tokenUsage.estimated_cost_usd += tokenUsage.estimated_cost_usd;

    return {
      task_id: taskId,
      agent_id: this.id,
      status: 'success',
      output,
      artifacts: [],
      duration_ms: Date.now() - startTime,
      token_usage: tokenUsage,
      completed_at: new Date().toISOString(),
    };
  }

  /**
   * Send a prompt to the AI model and return the response.
   */
  protected async queryModel(systemPrompt: string, userPrompt: string): Promise<{ content: string; usage: TokenUsage }> {
    if (!this.modelClient) {
      throw new Error(`Agent ${this.id} has no model client configured`);
    }

    const response = await this.modelClient.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.3,
      stream: false,
    });

    return {
      content: response.content,
      usage: {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
        estimated_cost_usd: 0,
      },
    };
  }

  getStatus() {
    return {
      id: this.id,
      state: this.state,
      current_tasks: Array.from(this.activeTasks.keys()),
      total_tasks_completed: this.totalCompleted,
      total_tasks_failed: this.totalFailed,
      uptime_ms: Date.now() - this.startedAt.getTime(),
      token_usage: {
        session_total: this.tokenUsage.total_tokens,
        budget_remaining: this.config.rate_limit.tokens_per_minute,
      },
      last_heartbeat: new Date().toISOString(),
    };
  }
}
