/**
 * Normalize bot messages from various platforms into a unified internal format.
 */

import type { InboundMessage } from './bot_adapter.js';
import type { SourceChannel } from '../types/task_envelope.js';

export interface NormalizedMessage {
  text: string;
  senderId: string;
  senderAlias: string;
  sourceChannel: SourceChannel;
  isCommand: boolean;
  command?: string;
  args?: string;
  attachments: { name: string; path: string; type: string }[];
  timestamp: string;
}

const COMMAND_PREFIXES = ['/', '!', 'cyplex '];

export function normalizeMessage(message: InboundMessage): NormalizedMessage {
  let text = message.text.trim();
  let isCommand = false;
  let command: string | undefined;
  let args: string | undefined;

  // Detect commands
  for (const prefix of COMMAND_PREFIXES) {
    if (text.toLowerCase().startsWith(prefix)) {
      isCommand = true;
      const withoutPrefix = text.substring(prefix.length).trim();
      const spaceIdx = withoutPrefix.indexOf(' ');
      if (spaceIdx >= 0) {
        command = withoutPrefix.substring(0, spaceIdx);
        args = withoutPrefix.substring(spaceIdx + 1).trim();
      } else {
        command = withoutPrefix;
        args = '';
      }
      // Normalize the text to a task submission
      text = args || command;
      break;
    }
  }

  const channelMap: Record<string, SourceChannel> = {
    telegram: 'telegram',
    discord: 'discord',
    whatsapp: 'whatsapp',
  };

  return {
    text,
    senderId: message.sender_id,
    senderAlias: message.sender_alias || message.sender_id,
    sourceChannel: channelMap[message.platform] || 'api',
    isCommand,
    command,
    args,
    attachments: message.attachments.map((a) => ({
      name: a.name,
      path: a.path,
      type: a.mime_type,
    })),
    timestamp: message.timestamp,
  };
}
