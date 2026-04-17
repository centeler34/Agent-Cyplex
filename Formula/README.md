# Homebrew Formula for Agent v0

This directory contains the Homebrew formula for installing Agent v0 (Agent Cyplex) on **macOS** (Intel + Apple Silicon) and **Linux** (via [Linuxbrew](https://docs.brew.sh/Homebrew-on-Linux)).

## Install from this repo (one-off)

```bash
brew install --build-from-source ./Formula/agent-v0.rb
```

## Install via a tap (recommended)

The easiest way to publish the formula is a dedicated tap repo named `homebrew-agent-v0`:

```bash
# one-time tap setup
brew tap centeler34/agent-v0 https://github.com/centeler34/Agent-v0.git

# install
brew install agent-v0

# or always get latest from main:
brew install --HEAD agent-v0
```

To use a dedicated tap repo instead, create
`https://github.com/centeler34/homebrew-agent-v0` and copy
`Formula/agent-v0.rb` into it — then users can:

```bash
brew tap centeler34/agent-v0
brew install agent-v0
```

## What you get

| Command | Action |
|---------|--------|
| `agent-v0` | CLI terminal / setup wizard |
| `agent-v0 daemon start` | Start the background daemon |
| `agent-v0 web` | Web GUI on <http://127.0.0.1:7777> |
| `agent-v0 web 8080` | Web GUI on a custom port |
| `agent-v0 gui` | Alias for `web` |

## Uninstall

```bash
brew uninstall agent-v0
brew untap   centeler34/agent-v0    # if you tapped
rm -rf ~/.agent-v0                  # remove config + keystore (optional)
```

## Updating

```bash
brew update
brew upgrade agent-v0
```

## Dependencies

Homebrew pulls these automatically:

- `node` (≥ 20)
- `rust` (build-time)
- `go` (build-time)
- `python@3.12`
- `openssl@3`
- `bubblewrap` (Linux only)

## Troubleshooting

**Formula fails to build** — run `brew install --verbose --build-from-source ./Formula/agent-v0.rb` to see the full output.

**`agent-v0 web` fails to open** — confirm the port is free: `lsof -i :7777`. Use a different port: `agent-v0 web 8123`.

**Apple Silicon vs Intel Mac** — the formula builds from source, so it works on both. The first install takes longer while Rust/Go compile.
