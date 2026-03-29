/**
 * Per-agent token usage meter widget.
 */

import React from 'react';
import { Box, Text } from 'ink';

interface TokenMeterProps {
  agent: string;
  used: number;
  budget: number;
}

export function TokenMeter({ agent, used, budget }: TokenMeterProps) {
  const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;
  const barWidth = 20;
  const filled = Math.round((pct / 100) * barWidth);
  const empty = barWidth - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  const color = pct > 80 ? 'red' : pct > 50 ? 'yellow' : 'green';

  return (
    <Box>
      <Text>{agent.padEnd(15)}</Text>
      <Text color={color}>{bar}</Text>
      <Text dimColor> {pct}% ({used.toLocaleString()}/{budget.toLocaleString()})</Text>
    </Box>
  );
}
