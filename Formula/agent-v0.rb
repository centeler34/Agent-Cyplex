class AgentV0 < Formula
  desc "Multi-agent AI orchestration terminal with CLI + Web GUI (Agent Cyplex)"
  homepage "https://github.com/centeler34/Agent-v0"
  url "https://github.com/centeler34/Agent-v0/archive/refs/tags/v1.2.0.tar.gz"
  version "1.2.0"
  license "GPL-3.0-or-later"
  head "https://github.com/centeler34/Agent-v0.git", branch: "main"

  # Build toolchain
  depends_on "node"
  depends_on "openssl@3"
  depends_on "python@3.12"
  depends_on "rust" => :build
  depends_on "go"   => :build

  # Linux-only sandbox
  on_linux do
    depends_on "bubblewrap"
  end

  def install
    # Install Node dependencies and compile TypeScript
    system "npm", "install", "--legacy-peer-deps", "--no-audit", "--no-fund"
    system "npx", "tsc"

    # Build the Rust security crates (ignore failure so install doesn't abort
    # on platforms where a crate is platform-gated)
    system "cargo", "build", "--release" if File.exist?("Cargo.toml")

    # Build Go net-probe if present
    if Dir.exist?("go/net-probe")
      mkdir_p "dist/go"
      cd "go/net-probe" do
        system "go", "build", "-o", buildpath/"dist/go/net-probe", "."
      end
    end

    # Copy compiled artifacts into the Cellar
    libexec.install "dist"
    libexec.install "node_modules"
    libexec.install "package.json"
    libexec.install "config" if Dir.exist?("config")
    libexec.install "Web" if Dir.exist?("Web")
    libexec.install Dir["target/release/*"].select { |f|
      File.executable?(f) && !File.directory?(f) && File.basename(f).start_with?("agent-v0", "cyplex")
    } if Dir.exist?("target/release")

    # Wrapper that routes:
    #   agent-v0              -> CLI
    #   agent-v0 web [port]   -> Web GUI (Neon Architect)
    #   agent-v0 gui          -> alias for 'web'
    (bin/"agent-v0").write <<~SH
      #!/usr/bin/env bash
      NODE="#{Formula["node"].opt_bin}/node"
      LIB="#{libexec}"

      case "${1:-}" in
        web|gui)
          shift
          if [ ! -f "$LIB/Web/server.js" ]; then
            echo "[x] Web GUI not installed (Web/server.js missing)."
            exit 1
          fi
          exec "$NODE" "$LIB/Web/server.js" "$@"
          ;;
      esac

      exec "$NODE" "$LIB/dist/cli/cli.js" "$@"
    SH
    chmod 0755, bin/"agent-v0"
  end

  def caveats
    <<~EOS
      Agent v0 (Agent Cyplex) installed successfully.

      CLI:
        agent-v0                 # interactive REPL / setup wizard
        agent-v0 daemon start    # start background daemon

      Web GUI (Neon Architect):
        agent-v0 web             # http://127.0.0.1:7777
        agent-v0 web 8080        # custom port

      State directory:
        ~/.agent-v0/ (config, keystore, logs, audit, workspaces)

      On first run, the CLI walks you through:
        1. Master password for the encrypted keystore
        2. AI provider API keys (or local LLM endpoints)
        3. Bot integrations (Telegram, Discord, WhatsApp)
        4. Daemon & security settings

      #{"Linux sandbox: bubblewrap (installed automatically)." if OS.linux?}
      #{"macOS sandbox: sandbox-exec (built-in)." if OS.mac?}
    EOS
  end

  test do
    # Verify the wrapper is installed and points at Node
    assert_predicate bin/"agent-v0", :executable?
    # Version flag should execute without error
    output = shell_output("#{bin}/agent-v0 --version 2>&1", 0)
    refute_empty output
    # Web server file should exist
    assert_predicate libexec/"Web/server.js", :exist?, "Web GUI bundle missing"
  end
end
