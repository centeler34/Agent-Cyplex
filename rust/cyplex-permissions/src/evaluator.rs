use std::fmt;
use std::path::PathBuf;

use glob::Pattern;
use tracing::{debug, warn};

use crate::network_guard::NetworkGuard;
use crate::policy::AgentPolicy;

/// A request to perform some privileged operation.
#[derive(Debug, Clone)]
pub enum PermissionRequest {
    /// Read a file at the given path.
    FsRead(PathBuf),
    /// Write a file at the given path.
    FsWrite(PathBuf),
    /// Execute a binary by name.
    FsExecute(String),
    /// Access a network host.
    NetworkAccess(String),
    /// Use an API provider.
    ApiProvider(String),
    /// Reference an API key.
    ApiKey(String),
    /// Communicate with another agent.
    AgentCommunicate(String),
    /// Spawn a child agent.
    AgentSpawn,
}

impl fmt::Display for PermissionRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::FsRead(p) => write!(f, "fs_read({})", p.display()),
            Self::FsWrite(p) => write!(f, "fs_write({})", p.display()),
            Self::FsExecute(bin) => write!(f, "fs_execute({bin})"),
            Self::NetworkAccess(host) => write!(f, "network_access({host})"),
            Self::ApiProvider(prov) => write!(f, "api_provider({prov})"),
            Self::ApiKey(key) => write!(f, "api_key({key})"),
            Self::AgentCommunicate(id) => write!(f, "agent_communicate({id})"),
            Self::AgentSpawn => write!(f, "agent_spawn"),
        }
    }
}

/// The outcome of a permission evaluation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PermissionDecision {
    /// The request is permitted.
    Allow,
    /// The request is denied, with a human-readable reason.
    Deny(String),
}

/// Evaluate a single [`PermissionRequest`] against an [`AgentPolicy`].
pub fn evaluate(policy: &AgentPolicy, request: &PermissionRequest) -> PermissionDecision {
    let decision = match request {
        PermissionRequest::FsRead(path) => check_glob_list(&policy.fs_read, path, "fs_read"),

        PermissionRequest::FsWrite(path) => check_glob_list(&policy.fs_write, path, "fs_write"),

        PermissionRequest::FsExecute(binary) => {
            if !policy.fs_execute {
                return PermissionDecision::Deny("fs_execute is disabled".into());
            }
            if policy.execute_allowed_binaries.is_empty() {
                // Execute is enabled but no allow-list means all binaries OK.
                PermissionDecision::Allow
            } else if policy.execute_allowed_binaries.iter().any(|b| b == binary) {
                PermissionDecision::Allow
            } else {
                PermissionDecision::Deny(format!(
                    "binary {binary} not in execute_allowed_binaries"
                ))
            }
        }

        PermissionRequest::NetworkAccess(host) => {
            let guard = NetworkGuard::new(
                policy.network_allow.clone(),
                policy.network_deny.clone(),
            );
            guard.check_host(host)
        }

        PermissionRequest::ApiProvider(provider) => {
            check_list_membership(&policy.api_providers, provider, "api_providers")
        }

        PermissionRequest::ApiKey(key) => {
            check_list_membership(&policy.api_keys, key, "api_keys")
        }

        PermissionRequest::AgentCommunicate(agent_id) => {
            check_list_membership(&policy.agent_communicate, agent_id, "agent_communicate")
        }

        PermissionRequest::AgentSpawn => {
            if policy.agent_spawn {
                PermissionDecision::Allow
            } else {
                PermissionDecision::Deny("agent_spawn is disabled".into())
            }
        }
    };

    match &decision {
        PermissionDecision::Allow => {
            debug!(agent = %policy.agent_id, request = %request, "permission allowed");
        }
        PermissionDecision::Deny(reason) => {
            warn!(agent = %policy.agent_id, request = %request, reason = %reason, "permission denied");
        }
    }

    decision
}

/// Check a path against a list of glob patterns. Returns [`PermissionDecision::Allow`]
/// if at least one pattern matches.
fn check_glob_list(patterns: &[String], path: &PathBuf, label: &str) -> PermissionDecision {
    let path_str = path.to_string_lossy();
    for pat in patterns {
        match Pattern::new(pat) {
            Ok(compiled) => {
                if compiled.matches(&path_str) {
                    return PermissionDecision::Allow;
                }
            }
            Err(e) => {
                warn!(pattern = %pat, error = %e, "invalid glob pattern in policy — skipping");
            }
        }
    }
    PermissionDecision::Deny(format!(
        "path {} does not match any {label} pattern",
        path_str
    ))
}

/// Check whether a value appears in a simple string list.
fn check_list_membership(list: &[String], value: &str, label: &str) -> PermissionDecision {
    if list.iter().any(|entry| entry == value || entry == "*") {
        PermissionDecision::Allow
    } else {
        PermissionDecision::Deny(format!(
            "{value} not found in {label} list"
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::AgentPolicy;

    fn test_policy() -> AgentPolicy {
        AgentPolicy {
            agent_id: "test-agent".into(),
            fs_read: vec!["/tmp/**".into(), "/data/*.csv".into()],
            fs_write: vec!["/tmp/**".into()],
            fs_execute: true,
            execute_allowed_binaries: vec!["python3".into(), "node".into()],
            network_allow: vec!["api.openai.com".into(), "*.internal.dev".into()],
            network_deny: vec!["evil.internal.dev".into()],
            api_providers: vec!["openai".into()],
            api_keys: vec!["key-prod-1".into()],
            agent_communicate: vec!["agent-b".into()],
            agent_spawn: false,
        }
    }

    #[test]
    fn fs_read_allowed() {
        let p = test_policy();
        assert_eq!(
            evaluate(&p, &PermissionRequest::FsRead("/tmp/foo.txt".into())),
            PermissionDecision::Allow
        );
    }

    #[test]
    fn fs_read_denied() {
        let p = test_policy();
        assert!(matches!(
            evaluate(&p, &PermissionRequest::FsRead("/etc/passwd".into())),
            PermissionDecision::Deny(_)
        ));
    }

    #[test]
    fn fs_execute_allowed_binary() {
        let p = test_policy();
        assert_eq!(
            evaluate(&p, &PermissionRequest::FsExecute("python3".into())),
            PermissionDecision::Allow
        );
    }

    #[test]
    fn fs_execute_denied_binary() {
        let p = test_policy();
        assert!(matches!(
            evaluate(&p, &PermissionRequest::FsExecute("rm".into())),
            PermissionDecision::Deny(_)
        ));
    }

    #[test]
    fn fs_execute_globally_disabled() {
        let mut p = test_policy();
        p.fs_execute = false;
        assert!(matches!(
            evaluate(&p, &PermissionRequest::FsExecute("python3".into())),
            PermissionDecision::Deny(_)
        ));
    }

    #[test]
    fn network_deny_overrides() {
        let p = test_policy();
        assert!(matches!(
            evaluate(&p, &PermissionRequest::NetworkAccess("evil.internal.dev".into())),
            PermissionDecision::Deny(_)
        ));
    }

    #[test]
    fn agent_spawn_denied() {
        let p = test_policy();
        assert!(matches!(
            evaluate(&p, &PermissionRequest::AgentSpawn),
            PermissionDecision::Deny(_)
        ));
    }

    #[test]
    fn wildcard_list_membership() {
        let p = AgentPolicy {
            api_providers: vec!["*".into()],
            ..Default::default()
        };
        assert_eq!(
            evaluate(&p, &PermissionRequest::ApiProvider("anything".into())),
            PermissionDecision::Allow
        );
    }
}
