//! HMAC-SHA256 functions for bot webhook verification.

use ::hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// Compute the HMAC-SHA256 of `message` using the given `key`.
///
/// Returns the raw MAC bytes as a `Vec<u8>`.
pub fn compute_hmac_sha256(key: &[u8], message: &[u8]) -> Vec<u8> {
    let mut mac =
        HmacSha256::new_from_slice(key).expect("HMAC-SHA256 accepts keys of any length");
    mac.update(message);
    mac.finalize().into_bytes().to_vec()
}

/// Verify that `signature` is the correct HMAC-SHA256 of `message` under `key`.
///
/// Uses constant-time comparison to prevent timing attacks.
pub fn verify_hmac_sha256(key: &[u8], message: &[u8], signature: &[u8]) -> bool {
    let mut mac =
        HmacSha256::new_from_slice(key).expect("HMAC-SHA256 accepts keys of any length");
    mac.update(message);
    mac.verify_slice(signature).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let key = b"secret-key";
        let message = b"hello world";
        let mac = compute_hmac_sha256(key, message);
        assert!(verify_hmac_sha256(key, message, &mac));
    }

    #[test]
    fn wrong_signature_rejected() {
        let key = b"secret-key";
        let message = b"hello world";
        let bad_sig = vec![0u8; 32];
        assert!(!verify_hmac_sha256(key, message, &bad_sig));
    }

    #[test]
    fn wrong_key_rejected() {
        let key = b"secret-key";
        let message = b"hello world";
        let mac = compute_hmac_sha256(key, message);
        assert!(!verify_hmac_sha256(b"wrong-key", message, &mac));
    }
}
