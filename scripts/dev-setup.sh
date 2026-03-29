#!/usr/bin/env bash
set -euo pipefail
echo "=== Cyplex Dev Environment Setup ==="
npm install
mkdir -p ~/.cyplex/{logs,audit,workspaces,quarantine/{pending,approved,rejected}}
echo "Dev environment ready. Run 'make dev' to start."
