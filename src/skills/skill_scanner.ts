/**
 * Orchestrates all 4 scan stages for quarantined skills.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { loadSkillFromString } from './skill_loader.js';
import { detectInjection } from './injection_detector.js';
import type { SkillScanReport, StageResult } from '../types/skill_schema.js';

export async function scanSkill(filePath: string, source: string): Promise<SkillScanReport> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  const structural = scanStructure(content);
  const permissions = structural.passed ? scanPermissions(content) : failStage('Skipped: structural validation failed');
  const injection = structural.passed ? await scanInjection(content) : failStage('Skipped: structural validation failed');
  const malware = structural.passed ? scanMalware(content) : failStage('Skipped: structural validation failed');

  const allPassed = structural.passed && permissions.passed && injection.passed && malware.passed;

  return {
    skill_id: hash.substring(0, 12),
    source,
    hash_sha256: hash,
    scanned_at: new Date().toISOString(),
    stages: { structural, permissions, injection, malware },
    overall: allPassed ? 'clean' : 'rejected',
    details: [
      ...structural.findings,
      ...permissions.findings,
      ...injection.findings,
      ...malware.findings,
    ],
  };
}

function failStage(reason: string): StageResult {
  return { passed: false, findings: [reason] };
}

/** Stage 1 — Structural Validation */
function scanStructure(content: string): StageResult {
  const result = loadSkillFromString(content);
  if (result.success) {
    return { passed: true, findings: [] };
  }
  return { passed: false, findings: result.errors || ['Unknown structural error'] };
}

/** Stage 2 — Permission Scope Audit */
function scanPermissions(content: string): StageResult {
  const findings: string[] = [];
  const result = loadSkillFromString(content);
  if (!result.success || !result.skill) return { passed: false, findings: ['Cannot parse skill for permission audit'] };

  const perms = result.skill.skill.permissions_required;

  // Check for overly broad network access
  const networkAllow = perms['network.allow'] || [];
  for (const host of networkAllow) {
    if (host === '*' || host === '0.0.0.0') {
      findings.push(`Broad network wildcard: ${host}`);
    }
  }

  // Flag execution permission requests
  if (perms['fs.execute']) {
    findings.push('Skill requests fs.execute permission — review carefully');
  }

  return { passed: findings.length === 0, findings };
}

/** Stage 3 — Prompt Injection Detection */
async function scanInjection(content: string): Promise<StageResult> {
  const result = loadSkillFromString(content);
  if (!result.success || !result.skill) return { passed: false, findings: ['Cannot parse skill'] };

  const findings: string[] = [];
  const steps = result.skill.skill.steps;

  for (const step of steps) {
    if (step.instruction) {
      const injectionResult = detectInjection(step.instruction);
      if (injectionResult.detected) {
        findings.push(`Injection in step "${step.name}": ${injectionResult.patterns.join(', ')}`);
      }
    }
  }

  // Also scan description
  const descResult = detectInjection(result.skill.skill.description);
  if (descResult.detected) {
    findings.push(`Injection in description: ${descResult.patterns.join(', ')}`);
  }

  return { passed: findings.length === 0, findings };
}

/** Stage 4 — Malware Pattern Scan */
function scanMalware(content: string): StageResult {
  const findings: string[] = [];
  const raw = Buffer.from(content);

  // Check for null bytes
  if (raw.includes(0)) {
    findings.push(`Hidden null byte detected at offset 0x${raw.indexOf(0).toString(16)}`);
  }

  // Check for embedded shell patterns
  const shellPatterns = [
    /\beval\s*\(/i,
    /\bexec\s*\(/i,
    /\/bin\/(?:ba)?sh/,
    /\brm\s+-rf\b/,
    /\bcurl\b.*\|\s*(?:ba)?sh/,
    /\bwget\b.*\|\s*(?:ba)?sh/,
    /\bnc\s+-[elp]/,
    /\breverse.?shell/i,
    /\bbase64\s+-d/,
    /\/dev\/tcp\//,
  ];

  for (const pattern of shellPatterns) {
    if (pattern.test(content)) {
      findings.push(`Shell pattern detected: ${pattern.source}`);
    }
  }

  // Check for data exfiltration patterns
  const exfilPatterns = [
    /https?:\/\/[^\s"']+\.(ru|cn|tk|ml|ga|cf)\b/i,
    /exfiltrat/i,
    /send.*data.*to.*external/i,
  ];

  for (const pattern of exfilPatterns) {
    if (pattern.test(content)) {
      findings.push(`Exfiltration pattern: ${pattern.source}`);
    }
  }

  return { passed: findings.length === 0, findings };
}
