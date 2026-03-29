use serde::{Deserialize, Serialize};

use crate::error::SandboxError;

/// Configuration for Linux namespace isolation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NamespaceConfig {
    /// Isolate the mount namespace.
    pub mount_ns: bool,
    /// Isolate the PID namespace.
    pub pid_ns: bool,
    /// Isolate the user namespace.
    pub user_ns: bool,
    /// Isolate the network namespace.
    pub net_ns: bool,
}

impl Default for NamespaceConfig {
    fn default() -> Self {
        Self {
            mount_ns: true,
            pid_ns: true,
            user_ns: true,
            net_ns: false,
        }
    }
}

/// Set up Linux namespaces according to the given configuration.
///
/// This calls `unshare(2)` with the appropriate flags to isolate the calling
/// process into new namespaces.
#[cfg(target_os = "linux")]
pub fn setup_namespaces(config: &NamespaceConfig) -> Result<(), SandboxError> {
    use nix::sched::{unshare, CloneFlags};

    let mut flags = CloneFlags::empty();

    if config.mount_ns {
        flags |= CloneFlags::CLONE_NEWNS;
        tracing::info!("enabling mount namespace isolation");
    }
    if config.pid_ns {
        flags |= CloneFlags::CLONE_NEWPID;
        tracing::info!("enabling PID namespace isolation");
    }
    if config.user_ns {
        flags |= CloneFlags::CLONE_NEWUSER;
        tracing::info!("enabling user namespace isolation");
    }
    if config.net_ns {
        flags |= CloneFlags::CLONE_NEWNET;
        tracing::info!("enabling network namespace isolation");
    }

    if flags.is_empty() {
        tracing::warn!("no namespaces requested; skipping unshare");
        return Ok(());
    }

    unshare(flags).map_err(|e| {
        SandboxError::NamespaceSetupFailed(format!("unshare failed: {e}"))
    })?;

    tracing::info!("namespace isolation established");
    Ok(())
}

/// On non-Linux platforms, namespace isolation is not supported.
#[cfg(not(target_os = "linux"))]
pub fn setup_namespaces(_config: &NamespaceConfig) -> Result<(), SandboxError> {
    Err(SandboxError::UnsupportedPlatform(
        "Linux namespace isolation is only available on Linux".into(),
    ))
}
