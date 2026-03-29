#!/usr/bin/env bash
set -euo pipefail
echo "Building Rust crates (release mode)..."
cargo build --release
echo "Done. Binaries in target/release/"
