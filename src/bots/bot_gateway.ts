/**
 * BotGateway — Routes inbound bot messages to Agentic for processing.
 */

import type { BotAdapter, InboundMessage, AllowlistEntry } from './bot_adapter.js';
import { normalizeMessage } from './message_normalizer.js';
import type { Agentic } from '../orchestrator/agentic.js';
import type { SourceChannel } from '../types/task_envelope.js';

export class BotGateway {
  private adapters: Map<string, BotAdapter> = new Map();
  private allowlists: Map<string, Map<string, AllowlistEntry>> = new Map();
  private orchestrator: Agentic | null = null;

  setOrchestrator(orchestrator: Agentic): void {
    this.orchestrator = orchestrator;
  }

  async registerAdapter(adapter: BotAdapter, allowlist: AllowlistEntry[]): Promise<void> {
    this.adapters.set(adapter.platform, adapter);

    const allowMap = new Map<string, AllowlistEntry>();
    for (const entry of allowlist) {
      allowMap.set(entry.id, entry);
    }
    this.allowlists.set(adapter.platform, allowMap);

    adapter.onMessage(async (msg: InboundMessage) => {
      await this.handleInboundMessage(adapter.platform, msg);
    });
  }

  private async handleInboundMessage(platform: string, message: InboundMessage): Promise<void> {
    // Check allowlist
    const allowMap = this.allowlists.get(platform);
    if (!allowMap || !allowMap.has(message.sender_id)) {
      // Silently ignore unauthorized senders
      return;
    }

    if (!this.orchestrator) return;

    const sourceChannel = this.platformToChannel(platform);
    const normalized = normalizeMessage(message);

    try {
      const result = await this.orchestrator.handleInput(normalized.text, sourceChannel);
      const adapter = this.adapters.get(platform);
      if (adapter) {
        const responseTarget = message.channel_id || message.sender_id;
        const responseText = typeof result.output === 'string'
          ? result.output
          : JSON.stringify(result.output, null, 2);

        // Short results inline, long results as attachment
        if (responseText.length > 4000) {
          await adapter.sendMessage(responseTarget, {
            text: `Task completed (${result.status}). Full output attached.`,
            format: 'plain',
          });
        } else {
          await adapter.sendMessage(responseTarget, { text: responseText, format: 'markdown' });
        }
      }
    } catch (error) {
      const adapter = this.adapters.get(platform);
      if (adapter) {
        const target = message.channel_id || message.sender_id;
        await adapter.sendMessage(target, {
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          format: 'plain',
        });
      }
    }
  }

  private platformToChannel(platform: string): SourceChannel {
    const map: Record<string, SourceChannel> = {
      telegram: 'telegram',
      discord: 'discord',
      whatsapp: 'whatsapp',
    };
    return map[platform] || 'api';
  }

  async shutdownAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.shutdown();
    }
    this.adapters.clear();
  }
}
