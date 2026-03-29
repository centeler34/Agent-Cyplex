use thiserror::Error;

/// Errors that can occur in the IPC layer.
#[derive(Debug, Error)]
pub enum IpcError {
    #[error("connection failed: {0}")]
    ConnectionFailed(String),

    #[error("failed to bind socket: {0}")]
    SocketBindFailed(String),

    #[error("message encoding error: {0}")]
    MessageEncodingError(String),

    #[error("message decoding error: {0}")]
    MessageDecodingError(String),

    #[error("connection closed")]
    ConnectionClosed,

    #[error("operation timed out")]
    Timeout,

    #[error("invalid session token: {0}")]
    InvalidSessionToken(String),

    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),
}
