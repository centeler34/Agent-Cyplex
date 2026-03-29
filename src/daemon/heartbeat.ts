/**
 * Agent health monitoring and stale-task reaping.
 */

import type { AgentProcess } from './process_manager.js';

export interface AgentHealthStatus {
  agentId: string;
  alive: boolean;
  lastSeen: Date;
  taskCount: number;
  missedBeats: number;
}

export class HeartbeatMonitor {
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private agents: Map<string, AgentProcess> = new Map();
  private healthMap: Map<string, AgentHealthStatus> = new Map();
  private readonly MAX_MISSED_BEATS = 3;

  constructor(intervalMs: number = 5000) {
    this.intervalMs = intervalMs;
  }

  start(agents: Map<string, AgentProcess>): void {
    this.agents = agents;

    // Initialize health tracking
    for (const [id] of agents) {
      this.healthMap.set(id, {
        agentId: id,
        alive: true,
        lastSeen: new Date(),
        taskCount: 0,
        missedBeats: 0,
      });
    }

    this.timer = setInterval(() => this.checkAll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  checkAgent(agentId: string): AgentHealthStatus | undefined {
    return this.healthMap.get(agentId);
  }

  getHealthStatuses(): AgentHealthStatus[] {
    return Array.from(this.healthMap.values());
  }

  recordHeartbeat(agentId: string): void {
    const status = this.healthMap.get(agentId);
    if (status) {
      status.alive = true;
      status.lastSeen = new Date();
      status.missedBeats = 0;
    }
  }

  private checkAll(): void {
    for (const [id, agent] of this.agents) {
      const health = this.healthMap.get(id);
      if (!health) continue;

      // Check if the process is still running
      const processAlive = agent.pid > 0 && this.isProcessRunning(agent.pid);

      if (!processAlive) {
        health.alive = false;
        health.missedBeats++;
      }

      // Stale task reaping: if agent hasn't responded in 3x interval
      if (health.missedBeats >= this.MAX_MISSED_BEATS) {
        health.alive = false;
        // Tasks assigned to this agent should be marked as failed
        // The process manager handles actual reaping
      }
    }
  }

  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
