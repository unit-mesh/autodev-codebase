import React from 'react';
import { Box, Text } from 'ink';

interface LogPanelProps {
  logs: string[];
}

export const LogPanel: React.FC<LogPanelProps> = ({ logs }) => {
  const getLogColor = (log: string): string => {
    if (log.includes('❌') || log.includes('Error')) return 'red';
    if (log.includes('⚠️') || log.includes('Warning')) return 'yellow';
    if (log.includes('✅') || log.includes('Success')) return 'green';
    if (log.includes('🔍') || log.includes('Search')) return 'cyan';
    if (log.includes('📊') || log.includes('Progress')) return 'blue';
    return 'white';
  };

  return (
    <Box flexDirection="column">
      <Text bold color="magenta">📋 System Logs</Text>

      <Box marginTop={1} flexDirection="column">
        {logs.length === 0 ? (
          <Text color="gray">No logs yet...</Text>
        ) : (
          logs.slice(-15).map((log, index) => (
            <Text key={index} color={getLogColor(log)}>
              {log}
            </Text>
          ))
        )}
      </Box>

      {logs.length > 15 && (
        <Box >
          <Text color="gray">
            ... showing last 15 of {logs.length} logs
          </Text>
        </Box>
      )}
    </Box>
  );
};
