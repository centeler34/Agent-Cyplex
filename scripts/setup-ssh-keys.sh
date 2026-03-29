#!/usr/bin/env bash
set -euo pipefail
echo "=== Cyplex SSH Key Setup ==="
echo "Generating dedicated keypair for AI tunnel connections..."
ssh-keygen -t ed25519 -f ~/.ssh/cyplex_ai_rsa -N "" -C "cyplex-ai-tunnel"
echo ""
echo "Public key:"
cat ~/.ssh/cyplex_ai_rsa.pub
echo ""
echo "Copy this to your remote AI host with:"
echo "  ssh-copy-id -i ~/.ssh/cyplex_ai_rsa.pub user@remote-host"
