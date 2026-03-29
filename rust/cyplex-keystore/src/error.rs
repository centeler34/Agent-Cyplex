use thiserror::Error;

/// Errors that can occur during keystore operations.
#[derive(Debug, Error)]
pub enum KeystoreError {
    #[error("encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("decryption failed: {0}")]
    DecryptionFailed(String),

    #[error("key derivation failed: {0}")]
    KeyDerivationFailed(String),

    #[error("key not found: {0}")]
    KeyNotFound(String),

    #[error("corrupted keystore: {0}")]
    CorruptedKeystore(String),

    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    SerializationError(String),
}

impl From<serde_json::Error> for KeystoreError {
    fn from(e: serde_json::Error) -> Self {
        KeystoreError::SerializationError(e.to_string())
    }
}
