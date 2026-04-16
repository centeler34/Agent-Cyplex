/**
 * Agent v0 — First-Run Setup Wizard
 * Interactive terminal setup that runs on first launch.
 * Configures API keys, bot tokens, and daemon settings.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto'; // Added for crypto.randomUUID()
import { TaskRegistry } from '../orchestrator/task_registry.js';
import { KeystoreBridge } from '../security/keystore_bridge.js';
import * as platform from '../utils/platform.js';

const HOME = process.env.HOME || process.env.USERPROFILE || '~';
const AGENT_DIR = platform.DATA_DIR;
const CONFIG_PATH = path.join(AGENT_DIR, 'config.yaml');
const KEYSTORE_PATH = path.join(AGENT_DIR, 'keystore.enc');
const SETUP_MARKER = path.join(AGENT_DIR, '.setup-complete');
const ENV_PATH = path.join(AGENT_DIR, '.env');

// ── ANSI Palette ─────────────────────────────────────────────────────────────

const x = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',

  white: '\x1b[37m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',

  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightRed: '\x1b[91m',

  teal: '\x1b[38;5;43m',
  purple: '\x1b[38;5;141m',
  orange: '\x1b[38;5;208m',
  darkGray: '\x1b[38;5;238m',
  slate: '\x1b[38;5;245m',
};

// ── Drawing Helpers ──────────────────────────────────────────────────────────

function getTermWidth(): number {
  return process.stdout.columns || 80;
}

function boxLine(lines: string[], borderColor: string = x.darkGray): string {
  const w = Math.min(getTermWidth() - 2, 72);
  const top    = `${borderColor}╭${'─'.repeat(w - 2)}╮${x.reset}`;
  const bottom = `${borderColor}╰${'─'.repeat(w - 2)}╯${x.reset}`;
  const padded = lines.map(line => {
    const visible = line.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = Math.max(0, w - 4 - visible.length);
    return `${borderColor}│${x.reset} ${line}${' '.repeat(pad)} ${borderColor}│${x.reset}`;
  });
  return [top, ...padded, bottom].join('\n');
}

function stepHeader(num: number, total: number, title: string): void {
  console.log('');
  console.log(`  ${x.darkGray}╭──────────────────────────────────────────────────────────╮${x.reset}`);
  console.log(`  ${x.darkGray}│${x.reset}  ${x.brightCyan}${x.bold}Step ${num}/${total}${x.reset}  ${x.dim}─${x.reset}  ${x.bold}${x.white}${title}${x.reset}${' '.repeat(Math.max(0, 42 - title.length))}${x.darkGray}│${x.reset}`);
  console.log(`  ${x.darkGray}╰──────────────────────────────────────────────────────────╯${x.reset}`);
  console.log('');
}

function logSuccess(text: string): void {
  console.log(`    ${x.green}✓${x.reset} ${text}`);
}

function logWarn(text: string): void {
  console.log(`    ${x.yellow}○${x.reset} ${x.dim}${text}${x.reset}`);
}

function logError(text: string): void {
  console.log(`    ${x.red}✗${x.reset} ${text}`);
}

// ── Input Helpers ────────────────────────────────────────────────────────────

function createRl(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function ask(rl: readline.Interface, question: string, defaultVal?: string): Promise<string> {
  const suffix = defaultVal ? ` ${x.darkGray}[${x.slate}${defaultVal}${x.darkGray}]${x.reset}` : '';
  return new Promise((resolve) => {
    rl.question(`    ${x.brightCyan}?${x.reset} ${question}${suffix}${x.dim}: ${x.reset}`, (answer) => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

async function askSecret(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(`    ${x.brightCyan}?${x.reset} ${question}${x.dim}: ${x.reset}`);

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }

    let input = '';
    const onData = (char: Buffer) => {
      const ch = char.toString();
      if (ch === '\n' || ch === '\r') {
        if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input.trim());
      } else if (ch === '\u007f' || ch === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (ch === '\u0003') {
        process.stdout.write('\n');
        process.exit(0);
      } else {
        input += ch;
        process.stdout.write(`${x.cyan}*${x.reset}`);
      }
    };
    stdin.on('data', onData);
    stdin.resume();
  });
}

async function askYesNo(rl: readline.Interface, question: string, defaultVal: boolean = false): Promise<boolean> {
  const hint = defaultVal
    ? `${x.green}Y${x.dim}/${x.slate}n${x.reset}`
    : `${x.slate}y${x.dim}/${x.green}N${x.reset}`;
  const answer = await ask(rl, `${question} (${hint})${x.reset}`);
  if (answer === '') return defaultVal;
  return answer.toLowerCase().startsWith('y');
}

async function askChoice(rl: readline.Interface, question: string, options: string[], defaultIdx: number = 0): Promise<number> {
  console.log(`    ${x.brightCyan}?${x.reset} ${question}`);
  console.log('');
  for (let i = 0; i < options.length; i++) {
    const isDefault = i === defaultIdx;
    const marker = isDefault ? `${x.green}❯${x.reset}` : `${x.darkGray} ${x.reset}`;
    const label = isDefault
      ? `${x.white}${x.bold}${options[i]}${x.reset}`
      : `${x.slate}${options[i]}${x.reset}`;
    console.log(`      ${marker} ${x.darkGray}${i + 1})${x.reset} ${label}`);
  }
  console.log('');
  const answer = await ask(rl, `Choice`, String(defaultIdx + 1));
  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < options.length) return idx;
  return defaultIdx;
}

// ── Setup Steps ──────────────────────────────────────────────────────────────

interface SetupConfig {
  masterPassword: string;
  defaultProvider: string;
  fallbackProvider: string;
  keys: Record<string, string>;
  enableTelegram: boolean;
  telegramToken: string;
  enableDiscord: boolean;
  discordToken: string;
  enableWhatsapp: boolean;
  daemonLogLevel: string;
  socketPath: string;
}

function printWizardBanner(): void {
  console.clear();
  console.log('');
  console.log(`  ${x.brightCyan}${x.bold}  ██████╗██╗   ██╗██████╗ ██╗     ███████╗██╗  ██╗${x.reset}`);
  console.log(`  ${x.brightCyan}${x.bold} ██╔════╝╚██╗ ██╔╝██╔══██╗██║     ██╔════╝╚██╗██╔╝${x.reset}`);
  console.log(`  ${x.cyan}${x.bold} ██║      ╚████╔╝ ██████╔╝██║     █████╗   ╚███╔╝${x.reset}`);
  console.log(`  ${x.blue}${x.bold} ██║       ╚██╔╝  ██╔═══╝ ██║     ██╔══╝   ██╔██╗${x.reset}`);
  console.log(`  ${x.blue}${x.bold} ╚██████╗   ██║   ██║     ███████╗███████╗██╔╝ ██╗${x.reset}`);
  console.log(`  ${x.blue}${x.bold}  ╚═════╝   ╚═╝   ╚═╝     ╚══════╝╚══════╝╚═╝  ╚═╝${x.reset}`);
  console.log('');
  console.log(`  ${x.bold}${x.white}  Setup Wizard${x.reset}  ${x.dim}v1.0.0${x.reset}`);
  console.log(`  ${x.dim}  First-time configuration${x.reset}`);
  console.log('');
}

async function stepWelcome(rl: readline.Interface): Promise<void> {
  console.log(boxLine([
    `${x.bold}${x.white}Welcome to Agent v0${x.reset}`,
    `${x.dim}Multi-Agent AI Orchestration Terminal${x.reset}`,
    ``,
    `${x.white}This wizard sets up your personal AI hub:${x.reset}`,
    ``,
    `  ${x.brightCyan}01${x.reset}  ${x.white}Master password${x.reset}     ${x.dim}AES-256 encrypted keystore${x.reset}`,
    `  ${x.brightCyan}02${x.reset}  ${x.white}Cloud AI providers${x.reset}  ${x.dim}Anthropic, OpenAI, Gemini, DeepSeek, Qwen, +more${x.reset}`,
    `  ${x.brightCyan}03${x.reset}  ${x.white}Bot integrations${x.reset}    ${x.dim}Telegram, Discord, WhatsApp${x.reset}`,
    `  ${x.brightCyan}04${x.reset}  ${x.white}Daemon settings${x.reset}     ${x.dim}Logging, socket config${x.reset}`,
    ``,
    `${x.dim}Re-run anytime: ${x.white}agent-v0 setup${x.reset}`,
  ]));
  console.log('');
  await ask(rl, `Press ${x.bold}Enter${x.reset} to begin`);
}

async function stepMasterPassword(rl: readline.Interface): Promise<string> {
  stepHeader(1, 4, 'Master Password');
  console.log(`    ${x.white}Your master password encrypts all API keys and secrets.${x.reset}`);
  console.log(`    ${x.yellow}Choose a strong password — it cannot be recovered if lost.${x.reset}`);
  console.log('');

  let password = '';
  while (true) {
    password = await askSecret(rl, 'Enter master password');
    if (password.length < 8) {
      logError('Password must be at least 8 characters');
      continue;
    }
    const confirm = await askSecret(rl, 'Confirm master password');
    if (password !== confirm) {
      logError('Passwords do not match');
      continue;
    }
    break;
  }
  console.log('');
  logSuccess('Master password set');
  return password;
}

async function stepCloudProviders(rl: readline.Interface): Promise<{ keys: Record<string, string>; defaultProvider: string; fallbackProvider: string }> {
  stepHeader(2, 4, 'Cloud AI Providers');
  console.log(`    ${x.white}Configure API keys for cloud AI providers.${x.reset}`);
  console.log(`    ${x.dim}Press Enter to skip any provider you don't use.${x.reset}`);
  console.log('');

  const keys: Record<string, string> = {};

  // Anthropic
  console.log(`    ${x.purple}┃${x.reset} ${x.bold}${x.white}Anthropic${x.reset} ${x.dim}(Claude)${x.reset}`);
  const anthropicAuthIdx = await askChoice(rl, 'Authentication method:', [
    'API key (sk-ant-...)',
    'Subscription (Claude Pro/Team — uses claude CLI)',
    'Skip',
  ], 0);
  if (anthropicAuthIdx === 0) {
    const anthropicKey = await askSecret(rl, 'API key (sk-ant-...)');
    if (anthropicKey) {
      keys['anthropic_api_key'] = anthropicKey;
      logSuccess('Anthropic API key saved');
    } else {
      logWarn('Anthropic skipped');
    }
  } else if (anthropicAuthIdx === 1) {
    keys['anthropic_subscription'] = 'true';
    logSuccess('Anthropic subscription mode — requests route through claude CLI');
  } else {
    logWarn('Anthropic skipped');
  }
  console.log('');

  // OpenAI
  console.log(`    ${x.green}┃${x.reset} ${x.bold}${x.white}OpenAI / ChatGPT${x.reset}`);
  const openaiAuthIdx = await askChoice(rl, 'Authentication method:', [
    'API key (sk-...)',
    'Subscription (ChatGPT Plus/Pro — session token)',
    'Skip',
  ], 0);
  if (openaiAuthIdx === 0) {
    const openaiKey = await askSecret(rl, 'API key (sk-...)');
    if (openaiKey) {
      keys['openai_api_key'] = openaiKey;
      logSuccess('OpenAI API key saved');
    } else {
      logWarn('OpenAI skipped');
    }
  } else if (openaiAuthIdx === 1) {
    console.log(`    ${x.cyan}●${x.reset} ${x.dim}To get your session token:${x.reset}`);
    console.log(`      ${x.dim}1. Log into ${x.white}chatgpt.com${x.dim} in your browser${x.reset}`);
    console.log(`      ${x.dim}2. Visit ${x.white}chatgpt.com/api/auth/session${x.reset}`);
    console.log(`      ${x.dim}3. Copy the ${x.white}accessToken${x.dim} value${x.reset}`);
    const sessionToken = await askSecret(rl, 'ChatGPT access token');
    if (sessionToken) {
      keys['chatgpt_access_token'] = sessionToken;
      keys['openai_subscription'] = 'true';
      logSuccess('ChatGPT subscription token saved');
    } else {
      logWarn('OpenAI skipped');
    }
  } else {
    logWarn('OpenAI skipped');
  }
  console.log('');

  // Gemini
  console.log(`    ${x.blue}┃${x.reset} ${x.bold}${x.white}Google Gemini${x.reset}`);
  const geminiAuthIdx = await askChoice(rl, 'Authentication method:', [
    'API key (AI...)',
    'Subscription (Google account — uses gcloud ADC)',
    'Skip',
  ], 0);
  if (geminiAuthIdx === 0) {
    const geminiKey = await askSecret(rl, 'API key (AI...)');
    if (geminiKey) {
      keys['google_ai_api_key'] = geminiKey;
      logSuccess('Gemini API key saved');
    } else {
      logWarn('Gemini skipped');
    }
  } else if (geminiAuthIdx === 1) {
    console.log(`    ${x.cyan}●${x.reset} ${x.dim}Make sure you've run:${x.reset}`);
    console.log(`      ${x.white}gcloud auth application-default login${x.reset}`);
    keys['gemini_subscription'] = 'true';
    logSuccess('Gemini subscription mode — requests use gcloud OAuth');
  } else {
    logWarn('Gemini skipped');
  }
  console.log('');

  // Claude Code (Agent SDK) — no API key needed
  console.log(`    ${x.purple}┃${x.reset} ${x.bold}${x.white}Claude Code${x.reset} ${x.dim}(Agent SDK — no API key needed)${x.reset}`);
  const useClaudeCode = await askYesNo(rl, 'Route requests through Claude Code?', false);
  if (useClaudeCode) {
    keys['claude_code_enabled'] = 'true';
    logSuccess('Claude Code adapter enabled');
  } else {
    logWarn('Claude Code skipped');
  }
  console.log('');

  // ── Chinese AI Providers ────────────────────────────────────────────────

  // DeepSeek
  console.log(`    ${x.blue}┃${x.reset} ${x.bold}${x.white}DeepSeek${x.reset} ${x.dim}(deepseek-chat, deepseek-reasoner)${x.reset}`);
  const deepseekIdx = await askChoice(rl, 'Authentication method:', [
    'API key (sk-...)',
    'Skip',
  ], 0);
  if (deepseekIdx === 0) {
    const deepseekKey = await askSecret(rl, 'API key (sk-...)');
    if (deepseekKey) {
      keys['deepseek_api_key'] = deepseekKey;
      logSuccess('DeepSeek API key saved');
    } else {
      logWarn('DeepSeek skipped');
    }
  } else {
    logWarn('DeepSeek skipped');
  }
  console.log('');

  // Zhipu AI / CodeGeeX
  console.log(`    ${x.green}┃${x.reset} ${x.bold}${x.white}Zhipu AI / CodeGeeX${x.reset} ${x.dim}(GLM-4, CodeGeeX-4)${x.reset}`);
  const zhipuIdx = await askChoice(rl, 'Authentication method:', [
    'API key ({id}.{secret} format)',
    'Skip',
  ], 0);
  if (zhipuIdx === 0) {
    console.log(`    ${x.cyan}●${x.reset} ${x.dim}Get your key at ${x.white}open.bigmodel.cn${x.reset}`);
    console.log(`      ${x.dim}Key format: ${x.white}xxxxxxxx.xxxxxxxx${x.dim} (id.secret)${x.reset}`);
    const zhipuKey = await askSecret(rl, 'API key (id.secret)');
    if (zhipuKey) {
      keys['zhipu_api_key'] = zhipuKey;
      logSuccess('Zhipu AI API key saved');
    } else {
      logWarn('Zhipu AI skipped');
    }
  } else {
    logWarn('Zhipu AI skipped');
  }
  console.log('');

  // Moonshot AI / Kimi
  console.log(`    ${x.cyan}┃${x.reset} ${x.bold}${x.white}Moonshot AI / Kimi${x.reset} ${x.dim}(moonshot-v1, kimi-k2.5)${x.reset}`);
  const moonshotIdx = await askChoice(rl, 'Authentication method:', [
    'API key (sk-...)',
    'Skip',
  ], 0);
  if (moonshotIdx === 0) {
    const moonshotKey = await askSecret(rl, 'API key (sk-...)');
    if (moonshotKey) {
      keys['moonshot_api_key'] = moonshotKey;
      logSuccess('Moonshot API key saved');
    } else {
      logWarn('Moonshot skipped');
    }
  } else {
    logWarn('Moonshot skipped');
  }
  console.log('');

  // Alibaba DashScope / Qwen
  console.log(`    ${x.orange}┃${x.reset} ${x.bold}${x.white}Alibaba DashScope / Qwen${x.reset} ${x.dim}(Tongyi Lingma)${x.reset}`);
  const dashscopeIdx = await askChoice(rl, 'Authentication method:', [
    'API key',
    'Skip',
  ], 0);
  if (dashscopeIdx === 0) {
    const dashscopeKey = await askSecret(rl, 'DashScope API key');
    if (dashscopeKey) {
      keys['dashscope_api_key'] = dashscopeKey;
      logSuccess('DashScope API key saved');
    } else {
      logWarn('DashScope skipped');
    }
  } else {
    logWarn('DashScope skipped');
  }
  console.log('');

  // Baidu Qianfan / ERNIE
  console.log(`    ${x.red}┃${x.reset} ${x.bold}${x.white}Baidu Qianfan / ERNIE${x.reset} ${x.dim}(Comate)${x.reset}`);
  const baiduIdx = await askChoice(rl, 'Authentication method:', [
    'API key (bce-v3/...)',
    'Skip',
  ], 0);
  if (baiduIdx === 0) {
    console.log(`    ${x.cyan}●${x.reset} ${x.dim}Get your key at ${x.white}qianfan.baidubce.com${x.reset}`);
    console.log(`      ${x.dim}Use the OpenAI-compatible API key (not legacy AK/SK)${x.reset}`);
    const baiduKey = await askSecret(rl, 'Qianfan API key');
    if (baiduKey) {
      keys['qianfan_api_key'] = baiduKey;
      logSuccess('Baidu Qianfan API key saved');
    } else {
      logWarn('Baidu skipped');
    }
  } else {
    logWarn('Baidu skipped');
  }
  console.log('');

  // Default provider
  const configured = [];
  if (keys['anthropic_api_key'] || keys['anthropic_subscription']) configured.push('anthropic');
  if (keys['openai_api_key'] || keys['openai_subscription']) configured.push('openai');
  if (keys['google_ai_api_key'] || keys['gemini_subscription']) configured.push('gemini');
  if (keys['claude_code_enabled']) configured.push('claude_code');
  if (keys['deepseek_api_key']) configured.push('deepseek');
  if (keys['zhipu_api_key']) configured.push('zhipu');
  if (keys['moonshot_api_key']) configured.push('moonshot');
  if (keys['dashscope_api_key']) configured.push('dashscope');
  if (keys['qianfan_api_key']) configured.push('baidu');

  let defaultProvider = 'anthropic';
  let fallbackProvider = 'openai';

  if (configured.length > 0) {
    const defaultIdx = await askChoice(rl, 'Select default AI provider:', configured, 0);
    defaultProvider = configured[defaultIdx];

    const remaining = configured.filter((_, i) => i !== defaultIdx);
    if (remaining.length > 0) {
      const fbIdx = await askChoice(rl, 'Select fallback provider:', remaining, 0);
      fallbackProvider = remaining[fbIdx];
    }
  } else {
    logWarn('No cloud providers configured — add keys later via setup');
  }

  return { keys, defaultProvider, fallbackProvider };
}

async function stepBots(rl: readline.Interface): Promise<{ enableTelegram: boolean; telegramToken: string; enableDiscord: boolean; discordToken: string; enableWhatsapp: boolean; botKeys: Record<string, string> }> {
  stepHeader(3, 4, 'Bot Integrations');
  console.log(`    ${x.white}Receive tasks from chat platforms.${x.reset}`);
  console.log(`    ${x.dim}Press Enter to skip any integration.${x.reset}`);
  console.log('');

  const botKeys: Record<string, string> = {};

  // Telegram
  console.log(`    ${x.blue}┃${x.reset} ${x.bold}${x.white}Telegram${x.reset}`);
  const enableTelegram = await askYesNo(rl, 'Enable Telegram bot?', false);
  let telegramToken = '';
  if (enableTelegram) {
    telegramToken = await askSecret(rl, 'Bot token');
    if (telegramToken) {
      botKeys['telegram_bot_token'] = telegramToken;
      logSuccess('Telegram configured');
    }
  }
  console.log('');

  // Discord
  console.log(`    ${x.purple}┃${x.reset} ${x.bold}${x.white}Discord${x.reset}`);
  const enableDiscord = await askYesNo(rl, 'Enable Discord bot?', false);
  let discordToken = '';
  if (enableDiscord) {
    discordToken = await askSecret(rl, 'Bot token');
    if (discordToken) {
      botKeys['discord_bot_token'] = discordToken;
      logSuccess('Discord configured');
    }
  }
  console.log('');

  // WhatsApp
  console.log(`    ${x.green}┃${x.reset} ${x.bold}${x.white}WhatsApp${x.reset}`);
  const enableWhatsapp = await askYesNo(rl, 'Enable WhatsApp bot?', false);
  if (enableWhatsapp) {
    console.log(`    ${x.cyan}●${x.reset} ${x.dim}WhatsApp uses QR-code pairing — configured on first bot start${x.reset}`);
  }

  return { enableTelegram, telegramToken, enableDiscord, discordToken, enableWhatsapp, botKeys };
}

async function stepDaemon(rl: readline.Interface): Promise<{ logLevel: string; socketPath: string }> {
  stepHeader(4, 4, 'Daemon & Security');
  console.log(`    ${x.white}Configure the background daemon process.${x.reset}`);
  console.log('');

  const logIdx = await askChoice(rl, 'Log level:', ['debug', 'info', 'warn', 'error'], 1);
  const logLevel = ['debug', 'info', 'warn', 'error'][logIdx];
  console.log('');

  const socketPath = await ask(rl, 'Daemon socket path', platform.socketPath());
  console.log('');

  return { logLevel, socketPath };
}

// ── Config Generation ────────────────────────────────────────────────────────

function generateConfig(cfg: SetupConfig): string {
  return `agent-v0:
  version: "1.0.0"

  daemon:
    socket_path: "${platform.socketPath()}"
    pid_file: "${platform.pidFilePath()}"
    heartbeat_interval_ms: 5000
    log_level: "${cfg.daemonLogLevel}"
    log_path: "${platform.LOG_DIR}/"

  sessions:
    default_workspace_root: "~/.agent-v0/workspaces/"
    auto_archive_after_days: 90

  gateway:
    default_provider: "${cfg.defaultProvider}"
    fallback_provider: "${cfg.fallbackProvider}"
    timeout_ms: 30000
    max_retries: 3
    providers:
${cfg.keys['anthropic_api_key'] ? `      anthropic:
        model: "claude-sonnet-4-6"
        key_ref: "anthropic_api_key"` : cfg.keys['anthropic_subscription'] ? `      anthropic:
        model: "claude-sonnet-4-6"
        auth_mode: "subscription"` : `      # anthropic:
      #   model: "claude-sonnet-4-6"
      #   key_ref: "anthropic_api_key"`}
${cfg.keys['openai_api_key'] ? `      openai:
        model: "gpt-4o"
        key_ref: "openai_api_key"` : cfg.keys['openai_subscription'] ? `      openai:
        model: "gpt-4o"
        auth_mode: "subscription"
        key_ref: "chatgpt_access_token"` : `      # openai:
      #   model: "gpt-4o"
      #   key_ref: "openai_api_key"`}
${cfg.keys['google_ai_api_key'] ? `      gemini:
        model: "gemini-pro"
        key_ref: "google_ai_api_key"` : cfg.keys['gemini_subscription'] ? `      gemini:
        model: "gemini-pro"
        auth_mode: "subscription"` : `      # gemini:
      #   model: "gemini-pro"
      #   key_ref: "google_ai_api_key"`}
${cfg.keys['claude_code_enabled'] ? `      claude_code:
        model: "claude-sonnet-4-6"` : `      # claude_code:
      #   model: "claude-sonnet-4-6"`}
${cfg.keys['deepseek_api_key'] ? `      deepseek:
        model: "deepseek-chat"
        key_ref: "deepseek_api_key"
        base_url: "https://api.deepseek.com"` : `      # deepseek:
      #   model: "deepseek-chat"
      #   key_ref: "deepseek_api_key"
      #   base_url: "https://api.deepseek.com"`}
${cfg.keys['zhipu_api_key'] ? `      zhipu:
        model: "glm-4.5-flash"
        key_ref: "zhipu_api_key"
        base_url: "https://open.bigmodel.cn/api/paas/v4/"` : `      # zhipu:
      #   model: "glm-4.5-flash"
      #   key_ref: "zhipu_api_key"
      #   base_url: "https://open.bigmodel.cn/api/paas/v4/"`}
${cfg.keys['moonshot_api_key'] ? `      moonshot:
        model: "moonshot-v1-auto"
        key_ref: "moonshot_api_key"
        base_url: "https://api.moonshot.cn/v1"` : `      # moonshot:
      #   model: "moonshot-v1-auto"
      #   key_ref: "moonshot_api_key"
      #   base_url: "https://api.moonshot.cn/v1"`}
${cfg.keys['dashscope_api_key'] ? `      dashscope:
        model: "qwen-plus"
        key_ref: "dashscope_api_key"
        base_url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"` : `      # dashscope:
      #   model: "qwen-plus"
      #   key_ref: "dashscope_api_key"
      #   base_url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"`}
${cfg.keys['qianfan_api_key'] ? `      baidu:
        model: "ernie-4.5"
        key_ref: "qianfan_api_key"
        base_url: "https://qianfan.baidubce.com/v2"` : `      # baidu:
      #   model: "ernie-4.5"
      #   key_ref: "qianfan_api_key"
      #   base_url: "https://qianfan.baidubce.com/v2"`}

  # Agent Fleet Configuration
  # You can add as many specialized agents as you desire.
  agents:
    agentic:
      enabled: true
      model_override: "${cfg.defaultProvider === 'anthropic' ? 'anthropic/claude-opus-4-6' : cfg.defaultProvider === 'openai' ? 'openai/gpt-4o' : cfg.defaultProvider + '/default'}"
      max_concurrent_delegations: 10
    recon:
      enabled: true
      workspace: "workspaces/recon/"
      skills: [recon.subdomain_enum, recon.dns_sweep, recon.tech_fingerprint]
      permissions:
        network.allow: ["*.shodan.io", "crt.sh", "*.censys.io", "dns.google", "web.archive.org"]
        fs.write: ["workspaces/recon/"]
        fs.execute: false
    code:
      enabled: true
      workspace: "workspaces/code/"
      permissions:
        fs.execute: true
        execute.allowed_binaries: ${JSON.stringify(platform.defaultAllowedBinaries())}
        network.allow: []
    exploit_research:
      enabled: true
      workspace: "workspaces/exploit_research/"
      permissions:
        network.allow: ["nvd.nist.gov", "cve.mitre.org"]
        fs.execute: false
    report:
      enabled: true
      workspace: "workspaces/reports/"
      permissions:
        fs.write: ["workspaces/reports/"]
        network.allow: []
        fs.execute: false
    monitor:
      enabled: true
      workspace: "workspaces/monitor/"
    osint_analyst:
      enabled: true
      workspace: "workspaces/osint/"
    threat_intel:
      enabled: true
      workspace: "workspaces/threat_intel/"
    forensics:
      enabled: true
      workspace: "workspaces/forensics/"
    scribe:
      enabled: true
      workspace: "workspaces/scribe/"

  bots:
    telegram:
      enabled: ${cfg.enableTelegram}
      token_key_ref: "telegram_bot_token"
      allowlist: []
    discord:
      enabled: ${cfg.enableDiscord}
      token_key_ref: "discord_bot_token"
    whatsapp:
      enabled: ${cfg.enableWhatsapp}

  security:
    audit_log_path: "~/.agent-v0/audit/audit.jsonl"
    keystore_path: "~/.agent-v0/keystore.enc"
    kdf: "argon2id"
    session_token_ttl_hours: 24
    skill_signature_verification: true

  rate_limits:
    global_tokens_per_minute: 500000
    per_agent_tokens_per_minute: 100000
    bot_messages_per_user_per_minute: 20
`;
}

function generateEnvFile(cfg: SetupConfig): string {
  // SECURITY: API keys and bot tokens are stored ONLY in the encrypted keystore.
  // Never write secrets to .env — this file contains only non-sensitive daemon settings.
  return `# ============================================================================
# Agent v0 — Environment Configuration (daemon settings only)
# Auto-generated by setup wizard.
# API keys are stored in the encrypted keystore (~/.agent-v0/keystore.enc)
# ============================================================================

# ── Daemon Settings ────────────────────────────────────────────────────────
AGENT_V0_SOCKET_PATH=${cfg.socketPath}
AGENT_V0_LOG_LEVEL=${cfg.daemonLogLevel}
`;
}

// ── Main Setup Flow ──────────────────────────────────────────────────────────

export function isFirstRun(): boolean {
  return !fs.existsSync(SETUP_MARKER);
}

export async function runSetupWizard(): Promise<void> {
  const rl = createRl();

  try {
    printWizardBanner();
    await stepWelcome(rl);

    const masterPassword = await stepMasterPassword(rl);
    const { keys: cloudKeys, defaultProvider, fallbackProvider } = await stepCloudProviders(rl);
    const bots = await stepBots(rl);
    const daemon = await stepDaemon(rl);

    // ── Finalize ───────────────────────────────────────────────────────────

    console.log('');
    console.log(`  ${x.darkGray}╭──────────────────────────────────────────────────────────╮${x.reset}`);
    console.log(`  ${x.darkGray}│${x.reset}  ${x.brightGreen}${x.bold}Finalizing${x.reset}  ${x.dim}─  Writing configuration files${x.reset}             ${x.darkGray}│${x.reset}`);
    console.log(`  ${x.darkGray}╰──────────────────────────────────────────────────────────╯${x.reset}`);
    console.log('');

    // Create directories
    const dirs = [
      AGENT_DIR,
      path.join(AGENT_DIR, 'logs'),
      path.join(AGENT_DIR, 'audit'),
      path.join(AGENT_DIR, 'workspaces'),
      path.join(AGENT_DIR, 'sessions'),
      path.join(AGENT_DIR, 'quarantine', 'pending'),
      path.join(AGENT_DIR, 'quarantine', 'approved'),
      path.join(AGENT_DIR, 'quarantine', 'rejected'),
    ];
    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }
    logSuccess('Created ~/.agent-v0/ directory structure');

    // Save keys to encrypted keystore
    const allKeys = { ...cloudKeys, ...bots.botKeys };
    if (Object.keys(allKeys).length > 0) {
      const keystore = new KeystoreBridge();
      // Open keystore to get the derived master key
      await keystore.open(KEYSTORE_PATH, masterPassword);
      const masterKey = keystore.getDerivedKey();
      const registry = new TaskRegistry();
      registry.setMasterKey(masterKey);
      for (const [name, value] of Object.entries(allKeys)) {
        if (value) registry.setSecret(name, value);
      }
      logSuccess(`Saved ${Object.keys(allKeys).length} key(s) to encrypted keystore`);
    }

    // Generate config
    const cfg: SetupConfig = {
      masterPassword,
      defaultProvider,
      fallbackProvider,
      keys: allKeys,
      enableTelegram: bots.enableTelegram,
      telegramToken: bots.telegramToken,
      enableDiscord: bots.enableDiscord,
      discordToken: bots.discordToken,
      enableWhatsapp: bots.enableWhatsapp,
      daemonLogLevel: daemon.logLevel,
      socketPath: daemon.socketPath,
    };

    fs.writeFileSync(CONFIG_PATH, generateConfig(cfg), { encoding: 'utf-8', mode: 0o600 });
    logSuccess('Generated ~/.agent-v0/config.yaml');

    // Write .env with restrictive permissions — contains API keys (CWE-732)
    // No longer storing secrets in .env, only daemon settings
    fs.writeFileSync(ENV_PATH, generateEnvFile(cfg), { encoding: 'utf-8', mode: 0o600 }); // Still write for daemon settings
    logSuccess('Generated ~/.agent-v0/.env (daemon settings only)');

    fs.writeFileSync(SETUP_MARKER, new Date().toISOString(), 'utf-8');

    // ── Summary ──────────────────────────────────────────────────────────

    const providerCount = Object.keys(cloudKeys).length;
    const botCount = [bots.enableTelegram, bots.enableDiscord, bots.enableWhatsapp].filter(Boolean).length;

    console.log('');
    console.log(boxLine([
      `${x.brightGreen}${x.bold}Setup Complete${x.reset}`,
      ``,
      `${x.bold}${x.white}Files${x.reset}`,
      `  ${x.teal}Config${x.reset}     ${x.dim}~/.agent-v0/config.yaml${x.reset}`,
      `  ${x.teal}Env${x.reset}        ${x.dim}~/.agent-v0/.env${x.reset}`,
      `  ${x.teal}Keystore${x.reset}   ${x.dim}~/.agent-v0/keystore.enc${x.reset}`,
      `  ${x.teal}Logs${x.reset}       ${x.dim}~/.agent-v0/audit/${x.reset}`,
      ``,
      `${x.bold}${x.white}Stats${x.reset}`,
      `  ${x.cyan}Providers${x.reset}  ${x.white}${providerCount}${x.reset} ${x.dim}configured${x.reset}`,
      `  ${x.cyan}Bots${x.reset}       ${x.white}${botCount}${x.reset} ${x.dim}enabled${x.reset}`,
      `  ${x.cyan}Log level${x.reset}  ${x.white}${daemon.logLevel}${x.reset}`,
      ``,
      `${x.bold}${x.white}Quick Start${x.reset}`,
      `  ${x.dim}$${x.reset} ${x.white}agent-v0 daemon start${x.reset}  ${x.dim}Start daemon${x.reset}`,
      `  ${x.dim}$${x.reset} ${x.white}agent-v0${x.reset}               ${x.dim}Launch REPL${x.reset}`,
    ], x.green));
    console.log('');

  } finally {
    rl.close();
  }
}
