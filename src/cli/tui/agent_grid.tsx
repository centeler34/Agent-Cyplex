/**
 * Agent status grid widget.
 */

import React from 'react';
import { Box, Text } from 'ink';

interface AgentGridProps {
  agents: { id: string; state: string; tasks: number }[];
}

const STATE_COLORS: Record<string, string> = {
  idle: 'green',
  busy: 'yellow',
  error: 'red',
  stopped: 'gray',
  starting: 'blue',
};

const STATE_ICONS: Record<string, string> = {
  idle: '●',
  busy: '◉',
  error: '✗',
  stopped: '○',
  starting: '◎',
};

export function AgentGrid({ agents }: AgentGridProps) {
  return (
    <Box flexDirection="column">
      {agents.map((agent) => (
        <Box key={agent.id}>
          <Text color={STATE_COLORS[agent.state] || 'white'}>
            {STATE_ICONS[agent.state] || '?'}{' '}
          </Text>
          <Text>{agent.id.padEnd(20)}</Text>
          <Text dimColor>{agent.state.padEnd(10)}</Text>
          <Text dimColor>tasks: {agent.tasks}</Text>
        </Box>
      ))}
    </Box>
  );
}
