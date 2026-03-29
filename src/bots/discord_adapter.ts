/**
 * Discord bot adapter using discord.js.
 */

import type { BotAdapter, AdapterConfig, MessageHandler, MessageContent, FileRef, InboundMessage } from './bot_adapter.js';

export class DiscordAdapter implements BotAdapter {
  readonly platform = 'discord';
  private client: unknown = null;
  private handler: MessageHandler | null = null;

  async init(config: AdapterConfig): Promise<void> {
    const { Client, GatewayIntentBits } = await import('discord.js');
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    (this.client as any).on('messageCreate', async (message: any) => {
      if (message.author.bot) return;
      if (!this.handler) return;

      const msg: InboundMessage = {
        platform: 'discord',
        sender_id: message.author.id,
        sender_alias: message.author.username,
        channel_id: message.channelId,
        text: message.content,
        attachments: message.attachments.map((a: any) => ({
          name: a.name,
          path: a.url,
          mime_type: a.contentType || 'application/octet-stream',
          size_bytes: a.size,
        })),
        timestamp: message.createdAt.toISOString(),
        raw: message,
      };

      await this.handler(msg);
    });

    await (this.client as any).login(config.tokenKeyRef);
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  async sendMessage(target: string, content: MessageContent): Promise<void> {
    if (!this.client) return;
    const channel = await (this.client as any).channels.fetch(target);
    if (channel?.isTextBased()) {
      // Discord has 2000 char limit; split if needed
      const text = content.text;
      if (text.length <= 2000) {
        await channel.send(text);
      } else {
        for (let i = 0; i < text.length; i += 2000) {
          await channel.send(text.substring(i, i + 2000));
        }
      }
    }
  }

  async sendFile(target: string, file: FileRef): Promise<void> {
    if (!this.client) return;
    const channel = await (this.client as any).channels.fetch(target);
    if (channel?.isTextBased()) {
      await channel.send({ files: [file.path] });
    }
  }

  async shutdown(): Promise<void> {
    if (this.client) {
      (this.client as any).destroy();
    }
  }
}
