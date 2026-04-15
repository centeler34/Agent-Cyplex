# Agent v0 — Security Architecture & Hardening

This document outlines the full security architecture of Agent v0, covering all encryption implementations, vulnerability remediations, and defense-in-depth measures across the Rust, TypeScript, and Python layers.

**Current version: v1.9.0** | 43 vulnerabilities patched across 4 security releases.

---

## 1. Security Release History

### v1.9.0 — Web Dashboard Hardening & Subscription Auth

| Area | Summary |
|------|---------|
| Web Dashboard | Fixed 7 broken interactivity issues; all socket events now properly wired with error feedback |
| Subscription Auth | Added `auth_mode: "subscription"` for Anthropic (Claude CLI), OpenAI (session token), Gemini (gcloud ADC) |
| Rand Migration | Upgraded `rand` 0.8 → 0.9.3 across all Rust crates; resolved cross-crate `rand_core` version conflicts |

**Key changes:**
- `chat_complete` event now properly emitted by the server (was orphaned — client listened but server never sent it)
- `memory_error` and `memories_cleared` socket events now have UI listeners — memory operation failures are no longer silent
- Chat action chips no longer use solid borders (Neon Architect no-line rule compliance)
- Markdown rendering in AI chat uses `esc()` before applying formatting — untrusted input is escaped first
- ChatGPT subscription adapter accepts session tokens via keystore (never stored in plaintext config)
- Gemini subscription adapter caches OAuth tokens for 50 minutes (gcloud tokens expire after 60)
- All `OsRng` usage migrated to `rand::rng()` (rand 0.9 API) — avoids deprecated `rand_core 0.6` trait conflicts

### v1.4.4 — TypeScript & Python Hardening (21 fixes)

| Severity | Count | Summary |
|----------|-------|---------|
| Critical | 3 | Command injection in OpenSSL cert generation and agent Bash tool |
| High | 6 | Secret leakage, SSRF, prototype pollution, missing security headers |
| Medium | 12 | DoS payload limits, file permissions, path traversal in Python |

**Key fixes:**
- All `execSync()` calls replaced with `execFileSync()` using argument arrays — eliminates shell injection across the entire TypeScript codebase
- Agent Bash tool now blocks dangerous patterns: backtick substitution, `$()`, pipe-to-bash, reverse shells
- All 3 web servers (web dashboard, orchestrator, CLI server) now set CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- Secret redactor hardened against prototype pollution (`__proto__`, `constructor`, `prototype` keys skipped)
- API keys removed from `.env` template — stored only in the encrypted keystore
- All 5 Python forensics modules validate file paths and block `..` traversal
- OSINT tools validate domain/email format before external API requests

### v1.3.2 — Rust Crypto Hardening (22 fixes)

| Severity | Count | Summary |
|----------|-------|---------|
| Critical | 3 | Timing attacks, weak RNG, DoS via oversized IPC messages |
| High | 3 | Panic-prone HMAC, hard-coded test keys, unsafe JSON serialization |
| Medium | 3 | Domain matching, file permissions, error handling |

**Key fixes:**
- Session token validation and audit hash chain verification now use `subtle::ConstantTimeEq` — prevents timing side-channel attacks
- All cryptographic random generation uses OS-seeded CSPRNG (rand 0.9: `rand::rng()`)
- IPC protocol capped at 16 MiB max message size (was uncapped at 4 GB)
- HMAC operations return `Result<T, HmacError>` instead of panicking with `.expect()`
- Hard-coded test keys (`[0xAB; 32]`, `"sk-secret-12345"`, `"hunter2"`) replaced with CSPRNG-generated random values
- Wildcard domain matching normalized to case-insensitive per RFC 4343

### v1.0.0 — SSH Tunnel Removal (9 fixes)

The `go/ssh-tunnel` module was removed entirely after a security audit identified 9 vulnerabilities:
- **Critical:** SSH host key verification disabled (`InsecureIgnoreHostKey`), enabling MITM attacks
- **High:** Race conditions in reconnection logic, missing SSH key file permission checks, double-close on connection forwarding
- **Medium:** No input validation on host/port, hardcoded SSH port, config permissions not checked
- **Low:** Information disclosure in error logging

Rather than patching 9 issues, the entire module was deleted as it no longer served a purpose.

---

## 2. Encryption Architecture

### 2.1 AES-256-GCM Secret Storage

All secrets (AI provider keys, bot tokens, session tokens) are stored using Authenticated Encryption with Associated Data (AEAD) via AES-256-GCM.

- **Nonce:** A fresh 12-byte random nonce generated via `rand::rng()` for every encryption operation
- **Integrity:** The GCM authentication tag ensures encrypted data has not been tampered with at rest
- **Key validation:** Encryption functions validate key length (must be exactly 32 bytes) before proceeding
- **Nonce generation:** Manual 12-byte fill via `rand::rng().fill()` to avoid cross-crate `rand_core` version conflicts between `aes-gcm 0.10` and `rand 0.9`

### 2.2 Column-Level SQLite Encryption

The `tasks.db` SQLite database uses column-level encryption for `task_data`, `result_data`, and `secrets` tables.

- **Encryption key:** All data bound to the 32-byte master key derived from the user's master password
- **Persistence:** Sensitive task context and results survive daemon restarts but remain encrypted on disk

### 2.3 Key Derivation (Argon2id)

The master key is derived from the user's master password using Argon2id:

- **Parameters:** 64 MB memory, 3 iterations, parallelism 4
- **Salt:** 16-byte random salt generated via `rand::rng()`, stored alongside the encrypted keystore
- **Zeroization:** In-memory key material is securely wiped using the `zeroize` crate immediately after use
- **File permissions:** Keystore written with mode `0o600` (owner read/write only)

---

## 3. Authentication & Session Management

### 3.1 Session Tokens

- **Generation:** Cryptographically random tokens generated via CSPRNG (32 bytes, hex-encoded = 64 chars)
- **Validation:** Tokens compared using `subtle::ConstantTimeEq` to prevent timing attacks
- **Lifespan:** Valid for 3 days
- **Re-authentication:** Upon expiration or logout, the token is deleted and the user must re-enter the master password

### 3.2 Web Dashboard Authentication

- **HTTPS only:** Self-signed TLS certificates generated on first launch
- **CORS restriction:** Only `localhost:3000` and `127.0.0.1:3000` are allowed origins
- **Rate limiting:** Authentication attempts are rate-limited (5 attempts per 60 seconds per socket)
- **Session binding:** Dashboard sessions are bound to the CLI's master key
- **CSP:** Allows Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) for the Neon Architect design system

### 3.3 Subscription-Based Authentication

For users who prefer to authenticate via existing paid subscriptions instead of API keys:

| Provider | Auth Method | Security Notes |
|----------|------------|----------------|
| **Anthropic** | Claude CLI (`claude --print`) | Uses ambient CLI auth; no credentials stored by Agent v0 |
| **OpenAI/ChatGPT** | Session/access token | Token stored in encrypted keystore, sent as Bearer header |
| **Google Gemini** | gcloud ADC (`gcloud auth print-access-token`) | OAuth token fetched on demand, cached 50 min (expires at 60) |

- Subscription tokens are stored in the same encrypted keystore as API keys (AES-256-GCM + Argon2id)
- The Claude Code adapter spawns a subprocess — no credentials pass through Agent v0's memory
- Gemini ADC tokens are short-lived and never persisted to disk

---

## 4. Runtime Security

### 4.1 Agent Sandboxing

Agents are confined using OS-native isolation:

- **Linux:** Bubblewrap (`bwrap`) with PID, mount, network, and user namespace isolation + seccomp filtering
- **macOS:** `sandbox-exec` with Sandbox.framework deny-by-default profiles (Apple Silicon: M1–M5)
- **Filesystem isolation:** Agents can only access their designated `workspaces/<agent_name>` directory
- **Path traversal protection:** All file paths are resolved and validated against the workspace root before any filesystem operation

### 4.2 Tool Execution Security

The `AgentToolkit` enforces per-agent tool allowlists at runtime:

| Control | Implementation |
|---------|---------------|
| **Per-agent allowlists** | Each agent role only has access to the tools it needs |
| **Bash injection blocking** | Patterns like `` `cmd` ``, `$(cmd)`, `; rm`, `| bash` are rejected |
| **Command size limit** | Maximum 10KB per command |
| **Workspace confinement** | FileRead/Write/Edit operations cannot escape the workspace |
| **Cloud metadata blocking** | WebFetch blocks `169.254.169.254` and `metadata.google.internal` |
| **Timeout enforcement** | All tool calls have configurable timeouts (default 120s for Bash, 30s for WebFetch) |

### 4.3 Web Server Hardening

All 3 HTTP servers (web dashboard, orchestrator, CLI server) enforce:

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' wss://localhost:*; frame-ancestors 'none'` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `X-Powered-By` | Disabled |
| JSON body limit | 10KB max |

---

## 5. Audit Trail

Every agent action is logged to a structured, append-only, hash-chained audit log.

### 5.1 Hash Chain Integrity

- Each log entry contains the SHA-256 hash of the previous entry
- Chain verification uses `subtle::ConstantTimeEq` to prevent timing attacks
- The first entry links to a genesis sentinel (64 zero characters)
- Verification: entries can be validated individually or as a complete chain

### 5.2 Secret Redaction

Before any data is written to the audit log, the `secret_redactor` module:

- Matches keys against patterns: `key`, `token`, `secret`, `password`, `credential`, `auth`, `bearer`, `api_key`
- Detects API key formats: `sk-*`, `sk-ant-*`, `AIza*`, `xoxb-*`, `xoxp-*`
- Replaces matched values with `[REDACTED]`
- Skips `__proto__`, `constructor`, `prototype` keys (prototype pollution protection)
- Enforces max recursion depth of 20 to prevent stack overflow attacks

### 5.3 Tool Invocation Logging

Every tool call is recorded with:
- Tool name and agent ID
- Input parameters
- Success/failure result
- Execution duration
- ISO 8601 timestamp

Capped at 10,000 entries in the in-memory ring buffer.

### 5.4 Web Dashboard Audit Viewer

The Security tab in the web dashboard displays the audit trail in real-time:
- Tamper-evident hash chain displayed per entry
- Client-side filtering by agent or action type
- Color-coded outcomes (success/failure)
- Timestamps in local time format

---

## 6. Cryptographic Standards

| Primitive | Implementation | Purpose |
|-----------|---------------|---------|
| AES-256-GCM | `aes-gcm` 0.10 | Secret storage encryption |
| Argon2id | `argon2` 0.5 (64MB/3iter/4par) | Master key derivation |
| Ed25519 | `ed25519-dalek` 2.x | Skill signature verification |
| HMAC-SHA256 | `hmac` 0.12 + `sha2` 0.10 | Message authentication |
| SHA-256 | `sha2` 0.10 | Audit log hash chain |
| CSPRNG | `rand` 0.9.3 (`rand::rng()`) | All random generation |
| Constant-time comparison | `subtle` 2.6 | Token/hash validation |
| Memory zeroization | `zeroize` 1.8 | Key material cleanup |

All cryptographic operations use proper error handling (`Result` types) — no `.expect()` or `.unwrap()` on crypto paths.

**Note on rand 0.9 migration:** The `rand::rngs::OsRng` direct usage was replaced with `rand::rng()` (which returns a `ThreadRng` backed by OS entropy). Manual nonce generation (`rand::rng().fill(&mut bytes)`) is used for AES-GCM to avoid trait conflicts between `aes-gcm 0.10` (depends on `rand_core 0.6`) and `rand 0.9` (uses `rand_core 0.9`). Similarly, Ed25519 test keys are generated via `SigningKey::from_bytes()` with random bytes rather than `SigningKey::generate()` which requires the old `CryptoRngCore` trait.

---

## 7. Python Security

All Python forensics and OSINT modules enforce input validation:

| Module | Protection |
|--------|-----------|
| `pcap_analyzer.py` | Path traversal check + `realpath` validation |
| `entropy_analyzer.py` | Path traversal check + `realpath` validation |
| `pefile_analyzer.py` | Path traversal check + file existence validation |
| `yara_scanner.py` | Path traversal check on both `file_path` and `rules_path` |
| `volatility_bridge.py` | Path traversal check |
| `cert_transparency.py` | Domain format regex + URL encoding |
| `breach_lookup.py` | Email format regex + length limit |

---

## 8. Recommendations for Operators

1. **Run `npm audit` and `pip audit` regularly** — monitor dependencies for new CVEs
2. **Keep Agent v0 updated** — `agent-v0 update` checks GitHub releases and applies only changed files
3. **Use strong master passwords** — Argon2id protects against brute force, but a weak password is still a weak password
4. **Review audit logs** — `agent-v0 audit query` lets you inspect what agents have been doing
5. **Restrict bot access** — Use allowlists in `config.yaml` to control who can submit tasks via Telegram/Discord/WhatsApp
6. **Run behind a firewall** — The web dashboard binds to localhost by default; keep it that way in production
7. **Rotate subscription tokens** — ChatGPT session tokens should be refreshed periodically; gcloud ADC tokens auto-expire after 60 minutes
8. **Prefer subscription auth for local use** — Subscription mode (Claude CLI, gcloud ADC) avoids storing long-lived API keys

---

*For the full project description and architecture deep-dive, see [Description.md](./Description.md).*
