package main

// TunnelConfig defines the configuration for a single SSH tunnel.
type TunnelConfig struct {
	Name               string `json:"name"`
	RemoteHost         string `json:"remote_host"`
	RemotePort         int    `json:"remote_port"`
	LocalPort          int    `json:"local_port"`
	SSHUser            string `json:"ssh_user"`
	SSHKeyPath         string `json:"ssh_key_path"`
	KeepaliveIntervalS int    `json:"keepalive_interval_s"`
	ReconnectOnFailure bool   `json:"reconnect_on_failure"`
}
