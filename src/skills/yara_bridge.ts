/**
 * TypeScript bridge to Rust YARA scanner.
 * In MVP, uses built-in pattern matching. In v1.0, calls into cyplex-sandbox Rust crate via napi-rs.
 */

export interface YaraScanResult {
  matched: boolean;
  matches: YaraMatch[];
}

export interface YaraMatch {
  rule: string;
  description: string;
  offset: number;
  matched_data: string;
}

/**
 * Scan raw bytes against built-in YARA-like rules.
 * MVP implementation uses regex patterns until the Rust YARA bridge is ready.
 */
export function scanBytes(data: Buffer): YaraScanResult {
  const matches: YaraMatch[] = [];

  const rules: { name: string; description: string; pattern: RegExp }[] = [
    { name: 'shell_reverse', description: 'Reverse shell pattern', pattern: /\/bin\/(?:ba)?sh\s+-i/ },
    { name: 'base64_exec', description: 'Base64 encoded execution', pattern: /echo\s+[A-Za-z0-9+/]{20,}\s*\|\s*base64\s+-d/ },
    { name: 'python_exec', description: 'Python exec/eval', pattern: /python[3]?\s+-c\s+['"].*(?:exec|eval|import\s+os)/ },
    { name: 'nc_listener', description: 'Netcat listener', pattern: /\bnc\b.*-[elp]+.*\d{2,5}/ },
    { name: 'wget_pipe_sh', description: 'wget piped to shell', pattern: /wget\s+.*\|\s*(?:ba)?sh/ },
    { name: 'curl_pipe_sh', description: 'curl piped to shell', pattern: /curl\s+.*\|\s*(?:ba)?sh/ },
    { name: 'dev_tcp', description: '/dev/tcp reverse connection', pattern: /\/dev\/tcp\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/ },
    { name: 'powershell_encoded', description: 'PowerShell encoded command', pattern: /powershell\s+.*-[eE](?:nc|ncodedCommand)\s+/ },
    { name: 'elf_header', description: 'ELF binary embedded in text', pattern: /\x7fELF/ },
    { name: 'pe_header', description: 'PE binary embedded in text', pattern: /MZ\x90\x00/ },
  ];

  const text = data.toString('utf-8');

  for (const rule of rules) {
    const match = rule.pattern.exec(text);
    if (match) {
      matches.push({
        rule: rule.name,
        description: rule.description,
        offset: match.index,
        matched_data: match[0].substring(0, 100),
      });
    }
  }

  return { matched: matches.length > 0, matches };
}
