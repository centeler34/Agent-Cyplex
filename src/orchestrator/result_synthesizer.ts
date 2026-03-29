/**
 * Multi-agent result fusion and output formatting.
 */

import type { ResultEnvelope, TaskStatus, TokenUsage } from '../types/task_envelope.js';

export class ResultSynthesizer {
  /**
   * Combine multiple agent results into a single coherent response.
   */
  synthesize(rootTaskId: string, results: ResultEnvelope[]): ResultEnvelope {
    if (results.length === 0) {
      return this.emptyResult(rootTaskId);
    }

    if (results.length === 1) {
      return { ...results[0], task_id: rootTaskId };
    }

    const status = this.resolveOverallStatus(results);
    const mergedOutput = this.mergeOutputs(results);
    const allArtifacts = results.flatMap((r) => r.artifacts);
    const totalUsage = this.sumTokenUsage(results);
    const totalDuration = results.reduce((sum, r) => sum + r.duration_ms, 0);

    return {
      task_id: rootTaskId,
      agent_id: 'agentic',
      status,
      output: mergedOutput,
      artifacts: allArtifacts,
      duration_ms: totalDuration,
      token_usage: totalUsage,
      completed_at: new Date().toISOString(),
    };
  }

  private resolveOverallStatus(results: ResultEnvelope[]): TaskStatus {
    const statuses = results.map((r) => r.status);

    if (statuses.every((s) => s === 'success')) return 'success';
    if (statuses.every((s) => s === 'failed')) return 'failed';
    if (statuses.some((s) => s === 'failed' || s === 'timeout')) return 'partial';
    return 'success';
  }

  private mergeOutputs(results: ResultEnvelope[]): Record<string, unknown> {
    const merged: Record<string, unknown> = {
      agent_results: results.map((r) => ({
        agent: r.agent_id,
        status: r.status,
        output: r.output,
        error: r.error,
      })),
    };

    // Flatten top-level keys from each agent's output
    for (const result of results) {
      for (const [key, value] of Object.entries(result.output)) {
        const prefixedKey = `${result.agent_id}_${key}`;
        merged[prefixedKey] = value;
      }
    }

    return merged;
  }

  private sumTokenUsage(results: ResultEnvelope[]): TokenUsage {
    return results.reduce(
      (sum, r) => ({
        prompt_tokens: sum.prompt_tokens + r.token_usage.prompt_tokens,
        completion_tokens: sum.completion_tokens + r.token_usage.completion_tokens,
        total_tokens: sum.total_tokens + r.token_usage.total_tokens,
        estimated_cost_usd: sum.estimated_cost_usd + r.token_usage.estimated_cost_usd,
      }),
      { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0 },
    );
  }

  private emptyResult(taskId: string): ResultEnvelope {
    return {
      task_id: taskId,
      agent_id: 'agentic',
      status: 'success',
      output: { message: 'No subtasks were required' },
      artifacts: [],
      duration_ms: 0,
      token_usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0 },
      completed_at: new Date().toISOString(),
    };
  }
}
