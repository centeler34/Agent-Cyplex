use rand::RngCore;
use zeroize::Zeroize;

use crate::crypto::derive_key_argon2id;
use crate::error::KeystoreError;

/// A master encryption key held in memory with automatic zeroization on drop.
pub struct MasterKey {
    bytes: [u8; 32],
}

impl MasterKey {
    /// Derive a master key from a password, generating a random 16-byte salt.
    ///
    /// Returns the derived key and the generated salt (which must be stored alongside
    /// the keystore so the key can be re-derived later).
    pub fn derive(password: &str) -> Result<(Self, Vec<u8>), KeystoreError> {
        let mut salt = vec![0u8; 16];
        rand::rngs::OsRng.fill_bytes(&mut salt);
        let bytes = derive_key_argon2id(password.as_bytes(), &salt)?;
        Ok((Self { bytes }, salt))
    }

    /// Derive a master key from a password and an existing salt.
    pub fn derive_with_salt(password: &str, salt: &[u8]) -> Result<Self, KeystoreError> {
        let bytes = derive_key_argon2id(password.as_bytes(), salt)?;
        Ok(Self { bytes })
    }

    /// Access the raw key bytes.
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.bytes
    }
}

impl Drop for MasterKey {
    fn drop(&mut self) {
        self.bytes.zeroize();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_and_rederive() {
        let (key, salt) = MasterKey::derive("my-password").unwrap();
        let key2 = MasterKey::derive_with_salt("my-password", &salt).unwrap();
        assert_eq!(key.as_bytes(), key2.as_bytes());
    }

    #[test]
    fn different_passwords_different_keys() {
        let (key1, salt) = MasterKey::derive("password-a").unwrap();
        let key2 = MasterKey::derive_with_salt("password-b", &salt).unwrap();
        assert_ne!(key1.as_bytes(), key2.as_bytes());
    }
}
