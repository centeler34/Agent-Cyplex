package main

import (
	"fmt"
	"net"
	"time"
)

// PortResult holds the result of a TCP port probe.
type PortResult struct {
	Host    string `json:"host"`
	Port    int    `json:"port"`
	Open    bool   `json:"open"`
	Latency string `json:"latency"`
}

// ProbePort checks if a TCP port is open on the target host.
func ProbePort(host string, port int, timeoutSecs int) (*PortResult, error) {
	if port <= 0 || port > 65535 {
		return nil, fmt.Errorf("invalid port: %d", port)
	}

	addr := fmt.Sprintf("%s:%d", host, port)
	timeout := time.Duration(timeoutSecs) * time.Second

	start := time.Now()
	conn, err := net.DialTimeout("tcp", addr, timeout)
	latency := time.Since(start)

	result := &PortResult{
		Host:    host,
		Port:    port,
		Open:    err == nil,
		Latency: latency.String(),
	}

	if conn != nil {
		conn.Close()
	}

	return result, nil
}
