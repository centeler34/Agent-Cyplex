use thiserror::Error;

/// Errors produced by the audit subsystem.
#[derive(Debug, Error)]
pub enum AuditError {
    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("chain integrity violation at entry {index}: expected prev_hash {expected}, got {actual}")]
    ChainIntegrityViolation {
        index: usize,
        expected: String,
        actual: String,
    },

    #[error("corrupted log: {reason}")]
    CorruptedLog { reason: String },
}
