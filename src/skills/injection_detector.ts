/**
 * Prompt injection pattern detection.
 * Scans instruction and description fields for jailbreak/override attempts.
 */

export interface InjectionScanResult {
  detected: boolean;
  patterns: string[];
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

const INJECTION_PATTERNS: { pattern: RegExp; label: string; severity: 'low' | 'medium' | 'high' | 'critical' }[] = [
  // Role override attempts
  { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, label: 'role_override', severity: 'critical' },
  { pattern: /disregard\s+(all\s+)?prior\s+(instructions|context)/i, label: 'role_override', severity: 'critical' },
  { pattern: /you\s+are\s+now\s+/i, label: 'role_override', severity: 'high' },
  { pattern: /new\s+system\s+prompt/i, label: 'role_override', severity: 'critical' },
  { pattern: /forget\s+(everything|all|your)\b/i, label: 'role_override', severity: 'high' },

  // Jailbreak patterns
  { pattern: /\bDAN\s+mode\b/i, label: 'jailbreak', severity: 'high' },
  { pattern: /\bdeveloper\s+mode\b/i, label: 'jailbreak', severity: 'medium' },
  { pattern: /pretend\s+you\s+(are|can|have)/i, label: 'jailbreak', severity: 'medium' },
  { pattern: /act\s+as\s+(if|though)\s+you\s+(have\s+)?no\s+(restrictions|limitations)/i, label: 'jailbreak', severity: 'high' },

  // Exfiltration patterns
  { pattern: /send\s+(all\s+)?data\s+to\b/i, label: 'exfiltration', severity: 'critical' },
  { pattern: /upload\s+(all\s+)?(files?|data|content)\s+to\b/i, label: 'exfiltration', severity: 'critical' },
  { pattern: /exfiltrate/i, label: 'exfiltration', severity: 'critical' },
  { pattern: /POST\s+.*workspace/i, label: 'exfiltration', severity: 'high' },

  // Hidden content
  { pattern: /[\u200B-\u200F\u202A-\u202E\uFEFF]/, label: 'hidden_unicode', severity: 'high' },
  { pattern: /[\x00-\x08\x0E-\x1F]/, label: 'control_chars', severity: 'high' },

  // Base64-encoded payloads in instructions (suspicious)
  { pattern: /[A-Za-z0-9+/]{50,}={0,2}/, label: 'base64_payload', severity: 'medium' },
];

export function detectInjection(text: string): InjectionScanResult {
  const detectedPatterns: string[] = [];
  let maxSeverity: InjectionScanResult['severity'] = 'none';

  const severityOrder: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const severityNames: InjectionScanResult['severity'][] = ['none', 'low', 'medium', 'high', 'critical'];

  for (const { pattern, label, severity } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      detectedPatterns.push(label);
      if (severityOrder[severity] > severityOrder[maxSeverity]) {
        maxSeverity = severity;
      }
    }
  }

  return {
    detected: detectedPatterns.length > 0,
    patterns: detectedPatterns,
    severity: maxSeverity,
  };
}
