package main

import (
	"fmt"
	"net"
	"time"
)

// HealthStatus reports the health of a tunnel.
type HealthStatus struct {
	Name      string `json:"name"`
	Healthy   bool   `json:"healthy"`
	LocalPort int    `json:"local_port"`
	Latency   string `json:"latency"`
	Error     string `json:"error,omitempty"`
}

// CheckHealth probes whether the local forwarding port is reachable.
func CheckHealth(name string, localPort int, timeout time.Duration) HealthStatus {
	start := time.Now()
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("localhost:%d", localPort), timeout)
	latency := time.Since(start)

	if err != nil {
		return HealthStatus{
			Name:      name,
			Healthy:   false,
			LocalPort: localPort,
			Latency:   latency.String(),
			Error:     err.Error(),
		}
	}
	conn.Close()

	return HealthStatus{
		Name:      name,
		Healthy:   true,
		LocalPort: localPort,
		Latency:   latency.String(),
	}
}

// CheckAllHealth checks health of all tunnels in the manager.
func (m *TunnelManager) CheckAllHealth() []HealthStatus {
	m.mu.Lock()
	defer m.mu.Unlock()

	var statuses []HealthStatus
	for _, tunnel := range m.tunnels {
		status := CheckHealth(tunnel.config.Name, tunnel.config.LocalPort, 5*time.Second)
		statuses = append(statuses, status)
	}
	return statuses
}
