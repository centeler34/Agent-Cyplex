/**
 * Running task list widget.
 */

import React from 'react';
import { Box, Text } from 'ink';

interface TaskListProps {
  tasks: { id: string; agent: string; elapsed: string; type: string }[];
}

export function TaskList({ tasks }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <Box>
        <Text dimColor>No running tasks</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{'ID'.padEnd(12)}</Text>
        <Text bold>{'Agent'.padEnd(20)}</Text>
        <Text bold>{'Type'.padEnd(25)}</Text>
        <Text bold>Elapsed</Text>
      </Box>
      {tasks.map((task) => (
        <Box key={task.id}>
          <Text>{task.id.substring(0, 10).padEnd(12)}</Text>
          <Text color="cyan">{task.agent.padEnd(20)}</Text>
          <Text>{task.type.padEnd(25)}</Text>
          <Text color="yellow">{task.elapsed}</Text>
        </Box>
      ))}
    </Box>
  );
}
