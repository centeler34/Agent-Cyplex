/**
 * Live TUI dashboard component — `cyplex status --watch`
 */

import React from 'react';
import { render, Box, Text } from 'ink';
import { AgentGrid } from './agent_grid.js';
import { TaskList } from './task_list.js';
import { TokenMeter } from './token_meter.js';

interface DashboardProps {
  agents: { id: string; state: string; tasks: number }[];
  tasks: { id: string; agent: string; elapsed: string; type: string }[];
  tokenUsage: { agent: string; used: number; budget: number }[];
  logs: string[];
}

export function Dashboard({ agents, tasks, tokenUsage, logs }: DashboardProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          ╔══════════════════════════════════════╗
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          ║     Agent Cyplex — Live Dashboard    ║
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          ╚══════════════════════════════════════╝
        </Text>
      </Box>

      <Box flexDirection="row" marginBottom={1}>
        <Box flexDirection="column" width="50%">
          <Text bold underline>Agent Status</Text>
          <AgentGrid agents={agents} />
        </Box>
        <Box flexDirection="column" width="50%">
          <Text bold underline>Token Usage</Text>
          {tokenUsage.map((t) => (
            <TokenMeter key={t.agent} agent={t.agent} used={t.used} budget={t.budget} />
          ))}
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline>Running Tasks</Text>
        <TaskList tasks={tasks} />
      </Box>

      <Box flexDirection="column">
        <Text bold underline>Recent Logs</Text>
        {logs.slice(-5).map((log, i) => (
          <Text key={i} dimColor>{log}</Text>
        ))}
      </Box>
    </Box>
  );
}

export function launchDashboard(): void {
  const mockData: DashboardProps = {
    agents: [
      { id: 'agentic', state: 'idle', tasks: 0 },
      { id: 'recon', state: 'idle', tasks: 0 },
      { id: 'code', state: 'idle', tasks: 0 },
    ],
    tasks: [],
    tokenUsage: [
      { agent: 'agentic', used: 0, budget: 100000 },
      { agent: 'recon', used: 0, budget: 100000 },
    ],
    logs: ['[startup] Dashboard initialized'],
  };

  render(<Dashboard {...mockData} />);
}
