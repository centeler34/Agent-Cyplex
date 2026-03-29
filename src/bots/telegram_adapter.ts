/**
 * Telegram bot adapter using grammy.
 */

import type { BotAdapter, AdapterConfig, MessageHandler, MessageContent, FileRef, InboundMessage } from './bot_adapter.js';

export class TelegramAdapter implements BotAdapter {
  readonly platform = 'telegram';
  private bot: unknown = null;
  private handler: MessageHandler | null = null;

  async init(config: AdapterConfig): Promise<void> {
    // Dynamic import to avoid hard dependency if not using Telegram
    const { Bot } = await import('grammy');
    const token = config.tokenKeyRef; // Resolved by keystore before passing here
    this.bot = new Bot(token);

    (this.bot as any).on('message:text', async (ctx: any) => {
      if (!this.handler) return;

      const msg: InboundMessage = {
        platform: 'telegram',
        sender_id: String(ctx.from.id),
        sender_alias: ctx.from.username || ctx.from.first_name,
        channel_id: String(ctx.chat.id),
        text: ctx.message.text,
        attachments: [],
        timestamp: new Date(ctx.message.date * 1000).toISOString(),
        raw: ctx.message,
      };

      await this.handler(msg);
    });

    await (this.bot as any).start();
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  async sendMessage(target: string, content: MessageContent): Promise<void> {
    if (!this.bot) return;
    const parseMode = content.format === 'markdown' ? 'MarkdownV2' : undefined;
    await (this.bot as any).api.sendMessage(target, content.text, { parse_mode: parseMode });
  }

  async sendFile(target: string, file: FileRef): Promise<void> {
    if (!this.bot) return;
    const { InputFile } = await import('grammy');
    await (this.bot as any).api.sendDocument(target, new InputFile(file.path));
  }

  async shutdown(): Promise<void> {
    if (this.bot) {
      await (this.bot as any).stop();
    }
  }
}
