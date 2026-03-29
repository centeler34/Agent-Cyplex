/**
 * BotAdapter interface — all bot platform adapters implement this.
 */

export interface AdapterConfig {
  tokenKeyRef: string;
  allowlist: AllowlistEntry[];
  [key: string]: unknown;
}

export interface AllowlistEntry {
  id: string;
  alias: string;
  permission_tier: 'admin' | 'operator' | 'viewer';
}

export interface MessageContent {
  text: string;
  format?: 'plain' | 'markdown' | 'html';
  attachments?: FileRef[];
}

export interface FileRef {
  name: string;
  path: string;
  mime_type: string;
  size_bytes: number;
}

export interface InboundMessage {
  platform: string;
  sender_id: string;
  sender_alias?: string;
  channel_id?: string;
  text: string;
  attachments: FileRef[];
  timestamp: string;
  raw: unknown;
}

export type MessageHandler = (message: InboundMessage) => Promise<void>;

export interface BotAdapter {
  readonly platform: string;
  init(config: AdapterConfig): Promise<void>;
  onMessage(handler: MessageHandler): void;
  sendMessage(target: string, content: MessageContent): Promise<void>;
  sendFile(target: string, file: FileRef): Promise<void>;
  shutdown(): Promise<void>;
}
