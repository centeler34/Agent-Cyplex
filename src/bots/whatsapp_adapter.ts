/**
 * WhatsApp adapter using @whiskeysockets/baileys.
 */

import type { BotAdapter, AdapterConfig, MessageHandler, MessageContent, FileRef, InboundMessage } from './bot_adapter.js';

export class WhatsAppAdapter implements BotAdapter {
  readonly platform = 'whatsapp';
  private socket: unknown = null;
  private handler: MessageHandler | null = null;

  async init(config: AdapterConfig): Promise<void> {
    const baileys = await import('@whiskeysockets/baileys');
    const { state, saveCreds } = await (baileys as any).useMultiFileAuthState('./.cyplex/whatsapp-auth');

    this.socket = (baileys as any).makeWASocket({
      auth: state,
      printQRInTerminal: true,
    });

    (this.socket as any).ev.on('creds.update', saveCreds);

    (this.socket as any).ev.on('messages.upsert', async ({ messages }: any) => {
      if (!this.handler) return;

      for (const message of messages) {
        if (!message.message || message.key.fromMe) continue;

        const text = message.message.conversation
          || message.message.extendedTextMessage?.text
          || '';

        const msg: InboundMessage = {
          platform: 'whatsapp',
          sender_id: message.key.remoteJid || '',
          sender_alias: message.pushName,
          channel_id: message.key.remoteJid || '',
          text,
          attachments: [],
          timestamp: new Date((message.messageTimestamp as number) * 1000).toISOString(),
          raw: message,
        };

        await this.handler(msg);
      }
    });
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  async sendMessage(target: string, content: MessageContent): Promise<void> {
    if (!this.socket) return;
    await (this.socket as any).sendMessage(target, { text: content.text });
  }

  async sendFile(target: string, file: FileRef): Promise<void> {
    if (!this.socket) return;
    const fs = await import('node:fs');
    const buffer = fs.readFileSync(file.path);
    await (this.socket as any).sendMessage(target, {
      document: buffer,
      fileName: file.name,
      mimetype: file.mime_type,
    });
  }

  async shutdown(): Promise<void> {
    if (this.socket) {
      (this.socket as any).end();
    }
  }
}
