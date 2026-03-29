/**
 * Scope file parsing and in/out-of-scope enforcement.
 */

export interface EngagementScope {
  engagement: { name: string; id: string };
  scope: {
    in_scope: {
      domains?: string[];
      ip_ranges?: string[];
      github_orgs?: string[];
    };
    out_of_scope: {
      domains?: string[];
      ip_ranges?: string[];
    };
  };
  constraints: {
    no_active_exploitation?: boolean;
    no_dos?: boolean;
    report_criticals_immediately?: boolean;
    max_request_rate_per_second?: number;
  };
  contacts?: {
    emergency?: string;
    rules_of_engagement?: string;
  };
}

export type ScopeDecision = { in_scope: true } | { in_scope: false; reason: string };

export class ScopeEnforcer {
  private scope: EngagementScope;

  constructor(scope: EngagementScope) {
    this.scope = scope;
  }

  checkDomain(domain: string): ScopeDecision {
    const lower = domain.toLowerCase();

    // Check out-of-scope first
    for (const pattern of this.scope.scope.out_of_scope.domains || []) {
      if (this.domainMatch(pattern.toLowerCase(), lower)) {
        return { in_scope: false, reason: `Domain ${domain} is explicitly out of scope` };
      }
    }

    // Check in-scope
    for (const pattern of this.scope.scope.in_scope.domains || []) {
      if (this.domainMatch(pattern.toLowerCase(), lower)) {
        return { in_scope: true };
      }
    }

    return { in_scope: false, reason: `Domain ${domain} is not in the engagement scope` };
  }

  checkIp(ip: string): ScopeDecision {
    // Check out-of-scope IP ranges
    for (const range of this.scope.scope.out_of_scope.ip_ranges || []) {
      if (this.ipInRange(ip, range)) {
        return { in_scope: false, reason: `IP ${ip} is explicitly out of scope` };
      }
    }

    // Check in-scope IP ranges
    for (const range of this.scope.scope.in_scope.ip_ranges || []) {
      if (this.ipInRange(ip, range)) {
        return { in_scope: true };
      }
    }

    return { in_scope: false, reason: `IP ${ip} is not in the engagement scope` };
  }

  getConstraints() {
    return this.scope.constraints;
  }

  getContacts() {
    return this.scope.contacts;
  }

  private domainMatch(pattern: string, domain: string): boolean {
    if (pattern === domain) return true;
    if (pattern.startsWith('*.')) {
      const suffix = pattern.substring(1); // e.g., ".target.com"
      return domain.endsWith(suffix) || domain === pattern.substring(2);
    }
    return false;
  }

  private ipInRange(ip: string, cidr: string): boolean {
    if (!cidr.includes('/')) return ip === cidr;

    const [rangeIp, prefixStr] = cidr.split('/');
    const prefix = parseInt(prefixStr, 10);
    const ipNum = this.ipToNum(ip);
    const rangeNum = this.ipToNum(rangeIp);
    const mask = ~((1 << (32 - prefix)) - 1) >>> 0;

    return (ipNum & mask) === (rangeNum & mask);
  }

  private ipToNum(ip: string): number {
    const parts = ip.split('.').map(Number);
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }
}
