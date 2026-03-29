//! Shared cryptographic primitives for the Agent Cyplex project.
//!
//! Provides HMAC-SHA256 verification, Ed25519 signature verification,
//! secure memory zeroization, and cryptographic random generation.

pub mod ed25519;
pub mod hmac;
pub mod rng;
pub mod zeroize;

pub use ed25519::verify_ed25519;
pub use hmac::{compute_hmac_sha256, verify_hmac_sha256};
pub use rng::{generate_random_bytes, generate_session_token, generate_uuid_v4};
pub use zeroize::{SecureBuffer, SecureString};

use thiserror::Error;

/// Unified error type for cryptographic operations.
#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("invalid key length: expected {expected}, got {actual}")]
    InvalidKeyLength { expected: usize, actual: usize },

    #[error("invalid signature length: expected {expected}, got {actual}")]
    InvalidSignatureLength { expected: usize, actual: usize },

    #[error("signature verification failed")]
    VerificationFailed,

    #[error("invalid public key")]
    InvalidPublicKey,

    #[error("cryptographic operation failed: {0}")]
    OperationFailed(String),
}
