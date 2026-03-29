// SSH tunnel manager — manages SSH port-forward tunnels to remote AI backends.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	configFile := flag.String("config", "", "Path to tunnel config JSON")
	flag.Parse()

	if *configFile == "" {
		// Read config from stdin
		var configs []TunnelConfig
		if err := json.NewDecoder(os.Stdin).Decode(&configs); err != nil {
			log.Fatalf("Failed to read config: %v", err)
		}
		runTunnels(configs)
	} else {
		data, err := os.ReadFile(*configFile)
		if err != nil {
			log.Fatalf("Failed to read config file: %v", err)
		}
		var configs []TunnelConfig
		if err := json.Unmarshal(data, &configs); err != nil {
			log.Fatalf("Failed to parse config: %v", err)
		}
		runTunnels(configs)
	}
}

func runTunnels(configs []TunnelConfig) {
	manager := NewTunnelManager()

	for _, cfg := range configs {
		if err := manager.AddTunnel(cfg); err != nil {
			log.Printf("Failed to add tunnel %s: %v", cfg.Name, err)
			continue
		}
		log.Printf("Tunnel configured: %s (localhost:%d -> %s:%d via %s@%s)",
			cfg.Name, cfg.LocalPort, cfg.RemoteHost, cfg.RemotePort, cfg.SSHUser, cfg.RemoteHost)
	}

	if err := manager.StartAll(); err != nil {
		log.Fatalf("Failed to start tunnels: %v", err)
	}

	log.Printf("All tunnels started. Waiting for signals...")

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	fmt.Println("\nShutting down tunnels...")
	manager.StopAll()
}
