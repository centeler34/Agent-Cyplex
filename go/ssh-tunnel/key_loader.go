package main

import (
	"fmt"
	"os"

	"golang.org/x/crypto/ssh"
)

// LoadSSHKey loads a private key from the given path for passwordless SSH auth.
func LoadSSHKey(keyPath string) (ssh.Signer, error) {
	// Expand ~ to home directory
	if len(keyPath) > 0 && keyPath[0] == '~' {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("resolve home dir: %w", err)
		}
		keyPath = home + keyPath[1:]
	}

	keyData, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, fmt.Errorf("read key file %s: %w", keyPath, err)
	}

	signer, err := ssh.ParsePrivateKey(keyData)
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}

	return signer, nil
}
