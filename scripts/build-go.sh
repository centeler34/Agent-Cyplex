#!/usr/bin/env bash
set -euo pipefail
mkdir -p dist
echo "Building Go binaries..."
cd go/ssh-tunnel && go build -o ../../dist/ssh-tunnel . && cd ../..
cd go/net-probe && go build -o ../../dist/net-probe . && cd ../..
echo "Done. Binaries in dist/"
