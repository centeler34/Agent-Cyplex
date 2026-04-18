/**
 * Strip secrets from any object before logging.
 */
import crypto from 'node:crypto'; // Added for crypto.randomUUID()

const SECRET_KEY_PATTERNS = [
  /key/i,
  /token/i,
  /secret/i,
  /password/i,
  /pass(phrase|wd)?/i,
  /credential/i,
  /auth/i,
  /bearer/i,
  /api.?key/i,
];

const REDACTED = '[REDACTED]';

/**
 * Recursively walk an object and replace values for keys that match secret patterns.
 * Mutates the input object in place.
 */
export function redactSecrets(obj: Record<string, unknown>, _depth = 0): void {
  // Guard against prototype pollution and deeply nested objects (CWE-1321)
  if (_depth > 20) return;
  for (const [key, value] of Object.entries(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (isSecretKey(key)) {
      obj[key] = REDACTED;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      redactSecrets(value as Record<string, unknown>, _depth + 1);
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === 'object' && value[i] !== null) {
          redactSecrets(value[i] as Record<string, unknown>, _depth + 1);
        }
      }
    } else if (typeof value === 'string' && looksLikeSecret(value)) {
      obj[key] = REDACTED;
    }
  }
}

function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some((p) => p.test(key));
}

function looksLikeSecret(value: string): boolean {
  // Detect common API key / token patterns
  if (value.startsWith('sk-') && value.length > 20) return true;
  if (value.startsWith('sk-ant-') && value.length > 20) return true;
  if (value.startsWith('AIza') && value.length > 30) return true;
  if (value.startsWith('xoxb-') || value.startsWith('xoxp-')) return true;
  if (/^[A-Za-z0-9]{32,}$/.test(value)) return true;
  return false;
}
