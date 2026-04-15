//! Ed25519 signature verification for Discord webhook interactions.

use ed25519_dalek::{Signature, Verifier, VerifyingKey};

use crate::CryptoError;

/// Verify an Ed25519 signature against a public key and message.
///
/// This is primarily used for Discord interaction webhook verification,
/// where the public key, timestamp + body (message), and the X-Signature header
/// (signature) are provided as raw byte slices.
///
/// Returns `Ok(true)` if the signature is valid, `Ok(false)` is never returned;
/// invalid signatures produce `Err(CryptoError::VerificationFailed)`.
pub fn verify_ed25519(
    public_key: &[u8],
    message: &[u8],
    signature: &[u8],
) -> Result<bool, CryptoError> {
    let vk = VerifyingKey::from_bytes(
        public_key
            .try_into()
            .map_err(|_| CryptoError::InvalidKeyLength {
                expected: 32,
                actual: public_key.len(),
            })?,
    )
    .map_err(|_| CryptoError::InvalidPublicKey)?;

    let sig = Signature::from_bytes(
        signature
            .try_into()
            .map_err(|_| CryptoError::InvalidSignatureLength {
                expected: 64,
                actual: signature.len(),
            })?,
    );

    vk.verify(message, &sig)
        .map_err(|_| CryptoError::VerificationFailed)?;

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use rand::Rng;

    fn generate_signing_key() -> SigningKey {
        let mut secret = [0u8; 32];
        rand::rng().fill(&mut secret);
        SigningKey::from_bytes(&secret)
    }

    #[test]
    fn valid_signature_accepted() {
        let signing_key = generate_signing_key();
        let verifying_key = signing_key.verifying_key();

        let message = b"discord interaction body";
        let sig = signing_key.sign(message);

        let result = verify_ed25519(
            verifying_key.as_bytes(),
            message,
            &sig.to_bytes(),
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), true);
    }

    #[test]
    fn invalid_signature_rejected() {
        let signing_key = generate_signing_key();
        let verifying_key = signing_key.verifying_key();

        let message = b"discord interaction body";
        let bad_sig = [0u8; 64];

        let result = verify_ed25519(
            verifying_key.as_bytes(),
            message,
            &bad_sig,
        );
        assert!(result.is_err());
    }

    #[test]
    fn wrong_key_length_returns_error() {
        let result = verify_ed25519(&[0u8; 16], b"msg", &[0u8; 64]);
        assert!(matches!(
            result,
            Err(CryptoError::InvalidKeyLength { expected: 32, actual: 16 })
        ));
    }

    #[test]
    fn wrong_signature_length_returns_error() {
        let result = verify_ed25519(&[0u8; 32], b"msg", &[0u8; 32]);
        assert!(matches!(
            result,
            Err(CryptoError::InvalidSignatureLength { expected: 64, actual: 32 })
        ));
    }
}
