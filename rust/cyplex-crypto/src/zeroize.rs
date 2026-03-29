//! Guaranteed memory zeroization for secrets.
//!
//! Wraps `Vec<u8>` and `String` so that their contents are securely
//! overwritten with zeros when the value is dropped.

use ::zeroize::Zeroize;
use serde::{Deserialize, Serialize};
use std::fmt;

/// A byte buffer that is zeroized on drop.
///
/// Use this for raw secret material such as HMAC keys or encryption keys.
#[derive(Clone, Serialize, Deserialize)]
pub struct SecureBuffer {
    inner: Vec<u8>,
}

impl SecureBuffer {
    /// Create a new `SecureBuffer` from raw bytes.
    pub fn new(data: Vec<u8>) -> Self {
        Self { inner: data }
    }

    /// Create a `SecureBuffer` of `len` zero bytes.
    pub fn zeroed(len: usize) -> Self {
        Self {
            inner: vec![0u8; len],
        }
    }

    /// Borrow the underlying bytes.
    pub fn as_bytes(&self) -> &[u8] {
        &self.inner
    }

    /// Mutably borrow the underlying bytes.
    pub fn as_bytes_mut(&mut self) -> &mut [u8] {
        &mut self.inner
    }

    /// Return the length in bytes.
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Check whether the buffer is empty.
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }
}

impl Drop for SecureBuffer {
    fn drop(&mut self) {
        self.inner.zeroize();
    }
}

impl fmt::Debug for SecureBuffer {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SecureBuffer")
            .field("len", &self.inner.len())
            .finish()
    }
}

impl AsRef<[u8]> for SecureBuffer {
    fn as_ref(&self) -> &[u8] {
        &self.inner
    }
}

impl From<Vec<u8>> for SecureBuffer {
    fn from(v: Vec<u8>) -> Self {
        Self::new(v)
    }
}

/// A string that is zeroized on drop.
///
/// Use this for secret tokens, passwords, or API keys stored as text.
#[derive(Clone, Serialize, Deserialize)]
pub struct SecureString {
    inner: String,
}

impl SecureString {
    /// Create a new `SecureString`.
    pub fn new(s: String) -> Self {
        Self { inner: s }
    }

    /// Borrow the underlying string slice.
    pub fn as_str(&self) -> &str {
        &self.inner
    }

    /// Return the length in bytes.
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Check whether the string is empty.
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }
}

impl Drop for SecureString {
    fn drop(&mut self) {
        self.inner.zeroize();
    }
}

impl fmt::Debug for SecureString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("SecureString(***)")
    }
}

impl AsRef<str> for SecureString {
    fn as_ref(&self) -> &str {
        &self.inner
    }
}

impl From<String> for SecureString {
    fn from(s: String) -> Self {
        Self::new(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secure_buffer_basics() {
        let buf = SecureBuffer::new(vec![1, 2, 3]);
        assert_eq!(buf.len(), 3);
        assert!(!buf.is_empty());
        assert_eq!(buf.as_bytes(), &[1, 2, 3]);
    }

    #[test]
    fn secure_buffer_debug_hides_contents() {
        let buf = SecureBuffer::new(vec![0xDE, 0xAD]);
        let dbg = format!("{:?}", buf);
        assert!(!dbg.contains("DE"));
        assert!(dbg.contains("SecureBuffer"));
    }

    #[test]
    fn secure_string_basics() {
        let s = SecureString::new("hunter2".to_string());
        assert_eq!(s.as_str(), "hunter2");
        assert_eq!(s.len(), 7);
    }

    #[test]
    fn secure_string_debug_hides_contents() {
        let s = SecureString::new("super-secret".to_string());
        let dbg = format!("{:?}", s);
        assert!(!dbg.contains("super-secret"));
        assert!(dbg.contains("SecureString"));
    }
}
