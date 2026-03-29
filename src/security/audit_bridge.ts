/**
 * TypeScript FFI bridge to cyplex-audit Rust crate.
 * MVP: pure-TS append-only JSON lines logger with hash chaining.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { redactSecrets } from './secret_redactor.js';

export interface AuditEntry {
  log_id: string;
  prev_hash: string;
  timestamp: string;
  session_id: string;
  agent_id: string;
  action_type: string;
  action_detail: Record<string, unknown>;
  permissions_checked: string[];
  outcome: 'success' | 'denied' | 'error';
  user_id: string | null;
  source_channel: string;
  entry_hash: string;
}

export class AuditBridge {
  private logPath: string;
  private lastHash: string = '0'.repeat(64);

  constructor(logPath: string) {
    this.logPath = logPath;
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Recover last hash from existing log
    if (fs.existsSync(logPath)) {
      const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter((l) => l.length > 0);
      if (lines.length > 0) {
        const last = JSON.parse(lines[lines.length - 1]);
        this.lastHash = last.entry_hash;
      }
    }
  }

  writeEntry(entry: Omit<AuditEntry, 'log_id' | 'prev_hash' | 'entry_hash' | 'timestamp'>): void {
    const fullEntry: AuditEntry = {
      log_id: crypto.randomUUID(),
      prev_hash: this.lastHash,
      timestamp: new Date().toISOString(),
      ...entry,
      entry_hash: '',
    };

    // Redact secrets from action_detail
    fullEntry.action_detail = JSON.parse(JSON.stringify(fullEntry.action_detail));
    redactSecrets(fullEntry.action_detail);

    // Compute hash
    fullEntry.entry_hash = this.computeHash(fullEntry);
    this.lastHash = fullEntry.entry_hash;

    // Append to file
    fs.appendFileSync(this.logPath, JSON.stringify(fullEntry) + '\n');
  }

  verifyChain(): { valid: boolean; entries: number; error?: string } {
    if (!fs.existsSync(this.logPath)) {
      return { valid: true, entries: 0 };
    }

    const lines = fs.readFileSync(this.logPath, 'utf-8').trim().split('\n').filter((l) => l.length > 0);
    let prevHash = '0'.repeat(64);

    for (let i = 0; i < lines.length; i++) {
      const entry: AuditEntry = JSON.parse(lines[i]);

      if (entry.prev_hash !== prevHash) {
        return { valid: false, entries: i, error: `Chain break at entry ${i}: expected prev_hash ${prevHash}` };
      }

      const computed = this.computeHash(entry);
      if (entry.entry_hash !== computed) {
        return { valid: false, entries: i, error: `Hash mismatch at entry ${i}` };
      }

      prevHash = entry.entry_hash;
    }

    return { valid: true, entries: lines.length };
  }

  export(since?: string): AuditEntry[] {
    if (!fs.existsSync(this.logPath)) return [];

    const lines = fs.readFileSync(this.logPath, 'utf-8').trim().split('\n').filter((l) => l.length > 0);
    const entries = lines.map((l) => JSON.parse(l) as AuditEntry);

    if (since) {
      const sinceDate = new Date(since);
      return entries.filter((e) => new Date(e.timestamp) >= sinceDate);
    }

    return entries;
  }

  private computeHash(entry: AuditEntry): string {
    const { entry_hash, ...rest } = entry;
    const canonical = JSON.stringify(rest, Object.keys(rest).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }
}
