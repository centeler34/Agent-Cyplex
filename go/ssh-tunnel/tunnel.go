package main

import (
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// TunnelManager manages multiple SSH tunnels.
type TunnelManager struct {
	tunnels  map[string]*Tunnel
	mu       sync.Mutex
}

// Tunnel represents a single SSH port-forward tunnel.
type Tunnel struct {
	config   TunnelConfig
	client   *ssh.Client
	listener net.Listener
	done     chan struct{}
	running  bool
}

// NewTunnelManager creates a new tunnel manager.
func NewTunnelManager() *TunnelManager {
	return &TunnelManager{
		tunnels: make(map[string]*Tunnel),
	}
}

// AddTunnel registers a tunnel configuration.
func (m *TunnelManager) AddTunnel(config TunnelConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.tunnels[config.Name] = &Tunnel{
		config: config,
		done:   make(chan struct{}),
	}
	return nil
}

// StartAll starts all registered tunnels.
func (m *TunnelManager) StartAll() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for name, tunnel := range m.tunnels {
		if err := tunnel.Start(); err != nil {
			return fmt.Errorf("tunnel %s: %w", name, err)
		}
	}
	return nil
}

// StopAll stops all running tunnels.
func (m *TunnelManager) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, tunnel := range m.tunnels {
		tunnel.Stop()
	}
}

// Start establishes the SSH connection and begins port forwarding.
func (t *Tunnel) Start() error {
	key, err := LoadSSHKey(t.config.SSHKeyPath)
	if err != nil {
		return fmt.Errorf("load key: %w", err)
	}

	sshConfig := &ssh.ClientConfig{
		User: t.config.SSHUser,
		Auth: []ssh.AuthMethod{
			ssh.PublicKeys(key),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // TODO: known_hosts verification
		Timeout:         10 * time.Second,
	}

	client, err := ssh.Dial("tcp", fmt.Sprintf("%s:22", t.config.RemoteHost), sshConfig)
	if err != nil {
		return fmt.Errorf("ssh dial: %w", err)
	}
	t.client = client

	listener, err := net.Listen("tcp", fmt.Sprintf("localhost:%d", t.config.LocalPort))
	if err != nil {
		client.Close()
		return fmt.Errorf("local listen: %w", err)
	}
	t.listener = listener
	t.running = true

	// Accept connections and forward
	go t.acceptLoop()

	// Keepalive
	if t.config.KeepaliveIntervalS > 0 {
		go t.keepaliveLoop()
	}

	return nil
}

// Stop shuts down the tunnel.
func (t *Tunnel) Stop() {
	if !t.running {
		return
	}
	t.running = false
	close(t.done)
	if t.listener != nil {
		t.listener.Close()
	}
	if t.client != nil {
		t.client.Close()
	}
}

func (t *Tunnel) acceptLoop() {
	for {
		conn, err := t.listener.Accept()
		if err != nil {
			if !t.running {
				return
			}
			log.Printf("Accept error on %s: %v", t.config.Name, err)
			continue
		}
		go t.forward(conn)
	}
}

func (t *Tunnel) forward(local net.Conn) {
	remote, err := t.client.Dial("tcp", fmt.Sprintf("localhost:%d", t.config.RemotePort))
	if err != nil {
		log.Printf("Remote dial error on %s: %v", t.config.Name, err)
		local.Close()
		return
	}

	go func() {
		io.Copy(remote, local)
		remote.Close()
	}()
	go func() {
		io.Copy(local, remote)
		local.Close()
	}()
}

func (t *Tunnel) keepaliveLoop() {
	ticker := time.NewTicker(time.Duration(t.config.KeepaliveIntervalS) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-t.done:
			return
		case <-ticker.C:
			if t.client != nil {
				_, _, err := t.client.SendRequest("keepalive@cyplex", true, nil)
				if err != nil {
					log.Printf("Keepalive failed for %s: %v", t.config.Name, err)
					if t.config.ReconnectOnFailure {
						t.reconnect()
					}
				}
			}
		}
	}
}

func (t *Tunnel) reconnect() {
	log.Printf("Reconnecting tunnel: %s", t.config.Name)
	if t.client != nil {
		t.client.Close()
	}
	if t.listener != nil {
		t.listener.Close()
	}

	// Exponential backoff
	for attempt := 0; attempt < 5; attempt++ {
		delay := time.Duration(1<<uint(attempt)) * time.Second
		time.Sleep(delay)

		if err := t.Start(); err != nil {
			log.Printf("Reconnect attempt %d failed for %s: %v", attempt+1, t.config.Name, err)
			continue
		}
		log.Printf("Reconnected tunnel: %s", t.config.Name)
		return
	}
	log.Printf("Failed to reconnect tunnel after 5 attempts: %s", t.config.Name)
}
