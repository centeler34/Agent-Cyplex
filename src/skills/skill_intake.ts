/**
 * /skills-download handler — URL fetch + local file picker for skill intake.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

export interface IntakeResult {
  success: boolean;
  quarantinePath?: string;
  hash?: string;
  error?: string;
}

const QUARANTINE_DIR = path.join(process.env.HOME || '~', '.cyplex', 'quarantine', 'pending');

function ensureQuarantineDir(): void {
  fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
  fs.mkdirSync(path.join(path.dirname(QUARANTINE_DIR), 'approved'), { recursive: true });
  fs.mkdirSync(path.join(path.dirname(QUARANTINE_DIR), 'rejected'), { recursive: true });
}

/**
 * Download a skill from a URL and place in quarantine.
 */
export async function intakeFromUrl(url: string, allowHttp = false): Promise<IntakeResult> {
  if (!allowHttp && url.startsWith('http://')) {
    return { success: false, error: 'HTTP (non-TLS) downloads are rejected. Use --allow-http to override.' };
  }

  if (!url.endsWith('.yaml') && !url.endsWith('.yml')) {
    return { success: false, error: 'URL must point to a .yaml or .yml file' };
  }

  ensureQuarantineDir();

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `Download failed: HTTP ${response.status}` };
    }

    const content = await response.text();
    return quarantineContent(content, url);
  } catch (err) {
    return { success: false, error: `Download error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Import a skill from a local file path.
 */
export function intakeFromFile(filePath: string): IntakeResult {
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  ensureQuarantineDir();
  const content = fs.readFileSync(filePath, 'utf-8');
  return quarantineContent(content, `file://${filePath}`);
}

/**
 * Open native file picker and import selected files.
 */
export function intakeFromPicker(): IntakeResult[] {
  const platform = process.platform;
  let files: string[] = [];

  try {
    if (platform === 'linux') {
      const result = execSync('zenity --file-selection --multiple --file-filter="YAML files|*.yaml *.yml" 2>/dev/null', {
        encoding: 'utf-8',
      });
      files = result.trim().split('|');
    } else if (platform === 'darwin') {
      const result = execSync(
        'osascript -e \'choose file of type {"yaml","yml"} with multiple selections allowed\'',
        { encoding: 'utf-8' },
      );
      files = result.trim().split(', ').map((f) => f.replace('alias ', ''));
    }
  } catch {
    return [{ success: false, error: 'File picker cancelled or unavailable' }];
  }

  return files.filter((f) => f.length > 0).map((f) => intakeFromFile(f));
}

function quarantineContent(content: string, source: string): IntakeResult {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const quarantinePath = path.join(QUARANTINE_DIR, `${hash}.yaml`);

  // Write skill file
  fs.writeFileSync(quarantinePath, content, 'utf-8');

  // Write metadata alongside
  const meta = {
    source,
    hash,
    quarantined_at: new Date().toISOString(),
    status: 'pending_scan',
  };
  fs.writeFileSync(`${quarantinePath}.meta.json`, JSON.stringify(meta, null, 2), 'utf-8');

  return { success: true, quarantinePath, hash };
}
