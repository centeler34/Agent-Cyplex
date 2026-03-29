/**
 * PID file management — duplicate instance prevention.
 */

import fs from 'node:fs';
import path from 'node:path';

export function acquireLock(pidFile: string): boolean {
  if (isLocked(pidFile)) {
    return false;
  }

  const dir = path.dirname(pidFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(pidFile, String(process.pid), 'utf-8');
  return true;
}

export function releaseLock(pidFile: string): void {
  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
}

export function isLocked(pidFile: string): boolean {
  if (!fs.existsSync(pidFile)) return false;

  const pid = getLockedPid(pidFile);
  if (pid === null) return false;

  // Check if the process is still running
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    // Process not running — stale PID file, clean it up
    fs.unlinkSync(pidFile);
    return false;
  }
}

export function getLockedPid(pidFile: string): number | null {
  if (!fs.existsSync(pidFile)) return null;

  const content = fs.readFileSync(pidFile, 'utf-8').trim();
  const pid = parseInt(content, 10);
  return isNaN(pid) ? null : pid;
}
