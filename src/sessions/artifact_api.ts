/**
 * Cross-agent read-only artifact sharing API.
 * Agents request artifact access through Agentic; direct cross-workspace access is never permitted.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ArtifactRef } from '../types/task_envelope.js';

export interface ArtifactToken {
  token: string;
  source_agent: string;
  requesting_agent: string;
  artifact_path: string;
  created_at: string;
  expires_at: string;
  used: boolean;
}

export class ArtifactApi {
  private tokens: Map<string, ArtifactToken> = new Map();
  private workspaceBase: string;

  constructor(workspaceBase: string) {
    this.workspaceBase = workspaceBase;
  }

  /**
   * Grant a scoped read token for a specific artifact.
   */
  grantReadToken(sourceAgent: string, requestingAgent: string, artifactPath: string, ttlMs = 60000): ArtifactToken {
    const token: ArtifactToken = {
      token: crypto.randomUUID(),
      source_agent: sourceAgent,
      requesting_agent: requestingAgent,
      artifact_path: artifactPath,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
      used: false,
    };

    this.tokens.set(token.token, token);
    return token;
  }

  /**
   * Read an artifact using a valid token. Returns file content or null.
   */
  readArtifact(tokenStr: string): { content: string; ref: ArtifactRef } | null {
    const token = this.tokens.get(tokenStr);
    if (!token) return null;
    if (token.used) return null;
    if (new Date() > new Date(token.expires_at)) return null;

    const fullPath = path.join(this.workspaceBase, token.artifact_path);

    // Validate path is within workspace
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(this.workspaceBase))) return null;

    if (!fs.existsSync(fullPath)) return null;

    const content = fs.readFileSync(fullPath, 'utf-8');
    const stats = fs.statSync(fullPath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    token.used = true;

    return {
      content,
      ref: {
        name: path.basename(fullPath),
        path: token.artifact_path,
        type: path.extname(fullPath).replace('.', ''),
        size_bytes: stats.size,
        hash_sha256: hash,
      },
    };
  }

  /**
   * List artifacts in an agent's workspace.
   */
  listArtifacts(agentId: string): ArtifactRef[] {
    const agentDir = path.join(this.workspaceBase, agentId);
    if (!fs.existsSync(agentDir)) return [];

    const files = fs.readdirSync(agentDir, { recursive: true }) as string[];
    return files
      .filter((f) => !fs.statSync(path.join(agentDir, f)).isDirectory())
      .map((f) => {
        const fullPath = path.join(agentDir, f);
        const stats = fs.statSync(fullPath);
        return {
          name: path.basename(f),
          path: path.join(agentId, f),
          type: path.extname(f).replace('.', ''),
          size_bytes: stats.size,
          hash_sha256: '',
        };
      });
  }
}
