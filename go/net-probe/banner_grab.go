package main

import (
	"fmt"
	"net"
	"strings"
	"time"
)

// BannerResult holds the result of a service banner grab.
type BannerResult struct {
	Host    string `json:"host"`
	Port    int    `json:"port"`
	Banner  string `json:"banner"`
	Service string `json:"service,omitempty"`
}

// GrabBanner connects to a TCP port and reads the service banner.
func GrabBanner(host string, port int, timeoutSecs int) (*BannerResult, error) {
	if port <= 0 || port > 65535 {
		return nil, fmt.Errorf("invalid port: %d", port)
	}

	addr := fmt.Sprintf("%s:%d", host, port)
	timeout := time.Duration(timeoutSecs) * time.Second

	conn, err := net.DialTimeout("tcp", addr, timeout)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	defer conn.Close()

	conn.SetReadDeadline(time.Now().Add(timeout))

	buf := make([]byte, 4096)
	n, err := conn.Read(buf)

	result := &BannerResult{
		Host: host,
		Port: port,
	}

	if n > 0 {
		banner := strings.TrimSpace(string(buf[:n]))
		result.Banner = banner
		result.Service = identifyService(banner)
	} else if err != nil {
		// Some services don't send a banner until they receive data
		// Try sending a basic probe
		conn.Write([]byte("HEAD / HTTP/1.0\r\n\r\n"))
		conn.SetReadDeadline(time.Now().Add(timeout))
		n, _ = conn.Read(buf)
		if n > 0 {
			banner := strings.TrimSpace(string(buf[:n]))
			result.Banner = banner
			result.Service = identifyService(banner)
		}
	}

	return result, nil
}

func identifyService(banner string) string {
	lower := strings.ToLower(banner)

	switch {
	case strings.HasPrefix(lower, "ssh-"):
		return "SSH"
	case strings.HasPrefix(lower, "http/"):
		return "HTTP"
	case strings.HasPrefix(lower, "220"):
		if strings.Contains(lower, "ftp") {
			return "FTP"
		}
		return "SMTP"
	case strings.HasPrefix(lower, "+ok"):
		return "POP3"
	case strings.HasPrefix(lower, "* ok"):
		return "IMAP"
	case strings.Contains(lower, "mysql"):
		return "MySQL"
	case strings.Contains(lower, "postgresql"):
		return "PostgreSQL"
	case strings.Contains(lower, "redis"):
		return "Redis"
	default:
		return "unknown"
	}
}
