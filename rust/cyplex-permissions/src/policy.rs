use serde::{Deserialize, Serialize};

/// Defines the permission boundaries for a single agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPolicy {
    /// Unique identifier of the agent this policy applies to.
    pub agent_id: String,

    /// Glob patterns for allowed filesystem read paths.
    pub fs_read: Vec<String>,

    /// Glob patterns for allowed filesystem write paths.
    pub fs_write: Vec<String>,

    /// Whether the agent may execute binaries at all.
    pub fs_execute: bool,

    /// Exact binary names the agent is allowed to execute (only consulted when
    /// `fs_execute` is `true`).
    pub execute_allowed_binaries: Vec<String>,

    /// FQDNs (or wildcard patterns like `*.example.com`) the agent may contact.
    pub network_allow: Vec<String>,

    /// FQDNs (or wildcard patterns) the agent must never contact. Checked
    /// before the allow list.
    pub network_deny: Vec<String>,

    /// API provider identifiers the agent is permitted to use (e.g. `"openai"`).
    pub api_providers: Vec<String>,

    /// API key identifiers the agent is permitted to reference.
    pub api_keys: Vec<String>,

    /// Agent IDs this agent may send messages to.
    pub agent_communicate: Vec<String>,

    /// Whether the agent may spawn child agents.
    pub agent_spawn: bool,
}

impl Default for AgentPolicy {
    /// Returns a maximally restrictive policy — everything denied, no patterns.
    fn default() -> Self {
        Self {
            agent_id: String::new(),
            fs_read: Vec::new(),
            fs_write: Vec::new(),
            fs_execute: false,
            execute_allowed_binaries: Vec::new(),
            network_allow: Vec::new(),
            network_deny: Vec::new(),
            api_providers: Vec::new(),
            api_keys: Vec::new(),
            agent_communicate: Vec::new(),
            agent_spawn: false,
        }
    }
}
