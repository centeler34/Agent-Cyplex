use serde::{Deserialize, Serialize};

use crate::error::SandboxError;

/// Seccomp-BPF profile controlling which syscalls are permitted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SeccompProfile {
    /// Only the minimal set of syscalls required for basic execution.
    Strict,
    /// A balanced profile suitable for most agent workloads.
    Standard,
    /// A relaxed profile with few restrictions (useful during development).
    Permissive,
}

impl std::fmt::Display for SeccompProfile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Strict => write!(f, "strict"),
            Self::Standard => write!(f, "standard"),
            Self::Permissive => write!(f, "permissive"),
        }
    }
}

/// Apply a seccomp-BPF syscall filter to the current process.
///
/// This is currently a stub implementation that logs the profile being applied.
/// A production implementation would construct a BPF program and load it via
/// `prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, ...)`.
#[cfg(target_os = "linux")]
pub fn apply_seccomp_filter(profile: SeccompProfile) -> Result<(), SandboxError> {
    tracing::info!(
        profile = %profile,
        "applying seccomp-BPF filter (stub)"
    );

    match profile {
        SeccompProfile::Strict => {
            tracing::info!(
                "strict profile: would allow only read, write, exit, sigreturn, brk, mmap"
            );
        }
        SeccompProfile::Standard => {
            tracing::info!(
                "standard profile: would allow common I/O, memory, and process syscalls"
            );
        }
        SeccompProfile::Permissive => {
            tracing::info!(
                "permissive profile: would block only dangerous syscalls (e.g. kexec, ptrace)"
            );
        }
    }

    Ok(())
}

/// On non-Linux platforms, seccomp is not available.
#[cfg(not(target_os = "linux"))]
pub fn apply_seccomp_filter(_profile: SeccompProfile) -> Result<(), SandboxError> {
    Err(SandboxError::UnsupportedPlatform(
        "seccomp-BPF is only available on Linux".into(),
    ))
}
