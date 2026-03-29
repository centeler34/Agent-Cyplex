/**
 * Per-agent rate limiter using a sliding window (resets each minute).
 */

interface AgentWindow {
  tokens: number;
  windowStart: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export class RateLimiter {
  private windows: Map<string, AgentWindow> = new Map();
  private budgets: Map<string, number> = new Map();
  private readonly windowMs = 60_000; // 1 minute

  /**
   * Set the per-minute token budget for an agent.
   */
  setBudget(agentId: string, tokensPerMinute: number): void {
    this.budgets.set(agentId, tokensPerMinute);
  }

  /**
   * Check whether the agent is allowed to consume the given number of tokens.
   * Returns { allowed: true } if within budget, or { allowed: false, retryAfterMs }
   * indicating how long to wait before retrying.
   */
  checkLimit(agentId: string, tokenCount: number): RateLimitResult {
    const budget = this.budgets.get(agentId);
    if (budget === undefined) {
      // No budget configured — allow everything.
      return { allowed: true };
    }

    const now = Date.now();
    const window = this.getOrCreateWindow(agentId, now);

    if (window.tokens + tokenCount <= budget) {
      return { allowed: true };
    }

    const elapsed = now - window.windowStart;
    const retryAfterMs = this.windowMs - elapsed;

    return {
      allowed: false,
      retryAfterMs: Math.max(retryAfterMs, 0),
    };
  }

  /**
   * Record that an agent consumed tokens. Call this after a successful completion.
   */
  recordUsage(agentId: string, tokens: number): void {
    const now = Date.now();
    const window = this.getOrCreateWindow(agentId, now);
    window.tokens += tokens;
  }

  /**
   * Reset a specific agent's current window.
   */
  reset(agentId: string): void {
    this.windows.delete(agentId);
  }

  /**
   * Reset all agent windows.
   */
  resetAll(): void {
    this.windows.clear();
  }

  private getOrCreateWindow(agentId: string, now: number): AgentWindow {
    let window = this.windows.get(agentId);

    if (!window || now - window.windowStart >= this.windowMs) {
      window = { tokens: 0, windowStart: now };
      this.windows.set(agentId, window);
    }

    return window;
  }
}
