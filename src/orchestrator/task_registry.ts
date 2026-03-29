/**
 * In-memory + SQLite task state store.
 */

import type { TaskEnvelope, ResultEnvelope, TaskStatus, TaskNode } from '../types/task_envelope.js';

export class TaskRegistry {
  private tasks: Map<string, TaskNode> = new Map();

  register(task: TaskEnvelope): void {
    const node: TaskNode = {
      task,
      dependencies: [],
      dependents: [],
      status: 'pending',
      assigned_agent: task.target_agent,
      retry_count: 0,
      max_retries: 3,
    };
    this.tasks.set(task.task_id, node);
  }

  get(taskId: string): TaskNode | undefined {
    return this.tasks.get(taskId);
  }

  updateStatus(taskId: string, status: TaskStatus): void {
    const node = this.tasks.get(taskId);
    if (!node) return;

    node.status = status;
    if (status === 'running') {
      node.started_at = new Date().toISOString();
    }
    if (status === 'success' || status === 'failed' || status === 'timeout') {
      node.completed_at = new Date().toISOString();
    }
  }

  setResult(taskId: string, result: ResultEnvelope): void {
    const node = this.tasks.get(taskId);
    if (!node) return;

    node.result = result;
    node.status = result.status;
    node.completed_at = result.completed_at;
  }

  addDependency(taskId: string, dependsOnId: string): void {
    const task = this.tasks.get(taskId);
    const dependsOn = this.tasks.get(dependsOnId);
    if (!task || !dependsOn) return;

    task.dependencies.push(dependsOnId);
    dependsOn.dependents.push(taskId);
  }

  getByStatus(status: TaskStatus): TaskNode[] {
    return Array.from(this.tasks.values()).filter((n) => n.status === status);
  }

  getByAgent(agentId: string): TaskNode[] {
    return Array.from(this.tasks.values()).filter((n) => n.assigned_agent === agentId);
  }

  getAll(): TaskNode[] {
    return Array.from(this.tasks.values());
  }

  getRunning(): TaskNode[] {
    return this.getByStatus('running');
  }

  getPending(): TaskNode[] {
    return this.getByStatus('pending');
  }

  cancel(taskId: string): boolean {
    const node = this.tasks.get(taskId);
    if (!node || node.status === 'success' || node.status === 'failed') return false;

    node.status = 'cancelled';
    node.completed_at = new Date().toISOString();
    return true;
  }

  canRetry(taskId: string): boolean {
    const node = this.tasks.get(taskId);
    if (!node) return false;
    return node.retry_count < node.max_retries && (node.status === 'failed' || node.status === 'timeout');
  }

  incrementRetry(taskId: string): void {
    const node = this.tasks.get(taskId);
    if (node) {
      node.retry_count++;
      node.status = 'pending';
    }
  }

  stats(): { total: number; pending: number; running: number; completed: number; failed: number } {
    const all = this.getAll();
    return {
      total: all.length,
      pending: all.filter((n) => n.status === 'pending').length,
      running: all.filter((n) => n.status === 'running').length,
      completed: all.filter((n) => n.status === 'success').length,
      failed: all.filter((n) => n.status === 'failed').length,
    };
  }
}
