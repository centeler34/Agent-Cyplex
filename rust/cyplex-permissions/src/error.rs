use std::fmt;
use thiserror::Error;

/// Errors arising from the permission enforcement engine.
#[derive(Debug, Error)]
pub enum PermissionError {
    /// The policy definition could not be parsed.
    #[error("failed to parse policy: {0}")]
    PolicyParseError(String),

    /// A glob pattern in the policy is invalid.
    #[error("invalid glob pattern: {0}")]
    InvalidGlobPattern(String),

    /// A permission check was denied.
    #[error("permission denied for agent {agent_id}: {request} — {reason}")]
    PermissionDenied {
        agent_id: String,
        request: String,
        reason: String,
    },
}

impl PermissionError {
    /// Convenience constructor for a denied permission.
    pub fn denied(agent_id: impl Into<String>, request: impl fmt::Display, reason: impl Into<String>) -> Self {
        Self::PermissionDenied {
            agent_id: agent_id.into(),
            request: request.to_string(),
            reason: reason.into(),
        }
    }
}
