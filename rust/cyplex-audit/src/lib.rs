//! # cyplex-audit
//!
//! Hash-chained, append-only audit log for Agent Cyplex.
//!
//! Every action performed by an agent is recorded as a [`LogEntry`] whose
//! `entry_hash` is cryptographically linked to the previous entry, forming a
//! tamper-evident chain similar to a blockchain.
//!
//! ## Quick start
//!
//! ```no_run
//! use std::path::Path;
//! use cyplex_audit::{write_entry, verify_chain, export};
//! use cyplex_audit::{LogEntry, Outcome, SourceChannel};
//!
//! // Write an entry
//! let entry = LogEntry {
//!     log_id: uuid::Uuid::new_v4().to_string(),
//!     prev_hash: String::new(),
//!     timestamp: chrono::Utc::now().to_rfc3339(),
//!     session_id: "sess-1".into(),
//!     agent_id: "agent-1".into(),
//!     action_type: "file.read".into(),
//!     action_detail: serde_json::json!({"path": "/etc/hosts"}),
//!     permissions_checked: vec!["fs.read".into()],
//!     outcome: Outcome::Success,
//!     user_id: Some("user-1".into()),
//!     source_channel: SourceChannel::Cli,
//!     entry_hash: String::new(),
//! };
//! write_entry(Path::new("audit.jsonl"), entry).unwrap();
//! ```

pub mod chain;
pub mod error;
pub mod log_entry;
pub mod redactor;
pub mod writer;

// Re-exports for convenience.
pub use chain::{build_chain_hash, verify_chain, verify_single};
pub use error::AuditError;
pub use log_entry::{LogEntry, Outcome, SourceChannel};
pub use redactor::redact_secrets;
pub use writer::AuditWriter;

use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

/// Convenience function: open the log at `path`, append `entry`, and close.
///
/// For high-throughput scenarios prefer holding an [`AuditWriter`] open.
pub fn write_entry(path: &Path, entry: LogEntry) -> Result<(), AuditError> {
    let mut w = AuditWriter::open(path)?;
    w.write(entry)
}

/// Read all entries from `path` and verify the hash chain.
///
/// This is a thin wrapper around [`chain::verify_chain`].
pub fn verify_chain_file(path: &Path) -> Result<bool, AuditError> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut entries = Vec::new();

    for (idx, line) in reader.lines().enumerate() {
        let line = line?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let entry: LogEntry = serde_json::from_str(trimmed).map_err(|e| {
            AuditError::CorruptedLog {
                reason: format!("line {}: {}", idx + 1, e),
            }
        })?;
        entries.push(entry);
    }

    chain::verify_chain(&entries)
}

/// Export all entries from the log file as a JSON array string.
pub fn export(path: &Path) -> Result<String, AuditError> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut entries: Vec<serde_json::Value> = Vec::new();

    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let value: serde_json::Value = serde_json::from_str(trimmed)?;
        entries.push(value);
    }

    let json = serde_json::to_string_pretty(&entries)?;
    Ok(json)
}
