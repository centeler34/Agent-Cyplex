/**
 * Natural language → structured task decomposition.
 * Uses the AI model to parse user intent into agent-routable subtasks.
 */

import type { AgentRole } from '../types/agent_config.js';

export interface SubtaskPlan {
  agent: string;
  type: string;
  payload: Record<string, unknown>;
  context?: Record<string, unknown>;
  timeoutMs?: number;
  dependsOn?: string[];
}

export interface ParsedIntent {
  summary: string;
  subtasks: SubtaskPlan[];
  pipeline: string[];
}

/** Keyword-to-agent mapping for rule-based decomposition (MVP). */
const AGENT_KEYWORDS: Record<string, { agent: AgentRole; type: string }> = {
  recon: { agent: 'recon', type: 'reconnaissance' },
  subdomain: { agent: 'recon', type: 'subdomain_enumeration' },
  enumerate: { agent: 'recon', type: 'enumeration' },
  dns: { agent: 'recon', type: 'dns_sweep' },
  fingerprint: { agent: 'recon', type: 'tech_fingerprint' },
  shodan: { agent: 'recon', type: 'shodan_sweep' },
  wayback: { agent: 'recon', type: 'wayback_crawl' },
  code: { agent: 'code', type: 'code_analysis' },
  review: { agent: 'code', type: 'vulnerability_review' },
  vulnerability: { agent: 'code', type: 'vulnerability_review' },
  dependency: { agent: 'code', type: 'dependency_audit' },
  exploit: { agent: 'exploit_research', type: 'exploit_research' },
  cve: { agent: 'exploit_research', type: 'cve_analysis' },
  patch: { agent: 'exploit_research', type: 'patch_diff' },
  report: { agent: 'report', type: 'report_generation' },
  pentest: { agent: 'report', type: 'pentest_report' },
  summary: { agent: 'report', type: 'executive_summary' },
  monitor: { agent: 'monitor', type: 'monitoring' },
  alert: { agent: 'monitor', type: 'alerting' },
  osint: { agent: 'osint_analyst', type: 'osint_analysis' },
  person: { agent: 'osint_analyst', type: 'person_profiling' },
  corporate: { agent: 'osint_analyst', type: 'corporate_mapping' },
  threat: { agent: 'threat_intel', type: 'threat_intelligence' },
  ioc: { agent: 'threat_intel', type: 'ioc_analysis' },
  actor: { agent: 'threat_intel', type: 'actor_profiling' },
  forensic: { agent: 'forensics', type: 'forensic_analysis' },
  pcap: { agent: 'forensics', type: 'pcap_analysis' },
  malware: { agent: 'forensics', type: 'malware_analysis' },
  memory: { agent: 'forensics', type: 'memory_analysis' },
  note: { agent: 'scribe', type: 'documentation' },
  document: { agent: 'scribe', type: 'documentation' },
  cheatsheet: { agent: 'scribe', type: 'cheatsheet' },
};

export class IntentParser {
  /**
   * Parse natural language input into a structured task plan.
   * MVP uses keyword matching; v1.0 will use LLM-driven decomposition.
   */
  async parse(input: string): Promise<ParsedIntent> {
    const lower = input.toLowerCase();
    const matchedAgents = new Set<string>();
    const subtasks: SubtaskPlan[] = [];

    for (const [keyword, mapping] of Object.entries(AGENT_KEYWORDS)) {
      if (lower.includes(keyword) && !matchedAgents.has(mapping.agent)) {
        matchedAgents.add(mapping.agent);
        subtasks.push({
          agent: mapping.agent,
          type: mapping.type,
          payload: { instruction: input },
        });
      }
    }

    // Default to code agent if no keywords matched
    if (subtasks.length === 0) {
      subtasks.push({
        agent: 'code',
        type: 'general_analysis',
        payload: { instruction: input },
      });
    }

    // If report keyword was found but it's not the only agent, make it depend on others
    const reportIdx = subtasks.findIndex((s) => s.agent === 'report');
    if (reportIdx >= 0 && subtasks.length > 1) {
      subtasks[reportIdx].dependsOn = subtasks
        .filter((_, i) => i !== reportIdx)
        .map((s) => s.agent);
    }

    return {
      summary: `Parsed ${subtasks.length} subtask(s) from input`,
      subtasks,
      pipeline: subtasks.map((s) => s.agent),
    };
  }
}
