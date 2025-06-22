import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { CodeIndexManager } from '../../code-index/manager';
import type { IndexingState } from '../../code-index/interfaces/manager';

interface ProgressMonitorProps {
  progress: {
    processedItems: number;
    totalItems: number;
    currentItemUnit?: string;
    message: string;
  };
  codeIndexManager: CodeIndexManager;
  onLog: (message: string) => void;
}

interface SystemStatus {
  systemStatus: IndexingState;
  fileStatuses: Record<string, unknown>;
  message: string;
  totalItems?: number;
  lastUpdate?: Date;
}

export const ProgressMonitor: React.FC<ProgressMonitorProps> = ({
  progress,
  codeIndexManager,
  onLog
}) => {
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    if (!codeIndexManager) {
      return undefined;
    }

    const updateStatus = () => {
      const currentStatus = codeIndexManager.getCurrentStatus();
      setStatus(currentStatus);
    };

    updateStatus();
    const interval = setInterval(updateStatus, 1000);
    return () => clearInterval(interval);
  }, [codeIndexManager]);

  const getProgressBar = (processed: number, total: number) => {
    if (total === 0) return '▓▓▓▓▓▓▓▓▓▓';

    const percentage = Math.min(processed / total, 1);
    const filled = Math.round(percentage * 20);
    const empty = 20 - filled;

    return '█'.repeat(filled) + '░'.repeat(empty);
  };

  const getStatusColor = (systemStatus: string) => {
    switch (systemStatus) {
      case 'Indexed': return 'green';
      case 'Indexing': return 'yellow';
      case 'Watching': return 'blue';
      case 'Error': return 'red';
      default: return 'gray';
    }
  };

  return (
    <Box flexDirection="column">
      <Text bold color="blue">📊 Progress Monitor</Text>

      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color="gray">Status: </Text>
          <Text color={status ? getStatusColor(status.systemStatus) : 'gray'}>
            {status?.systemStatus || 'Unknown'}
          </Text>
        </Text>

        {status && (
          <>
            <Box >
              {status.totalItems !== undefined && (
                <Text>
                  <Text color="gray">Total Items: </Text>
                  <Text color="white">{status.totalItems}</Text>
                </Text>
              )}
            </Box>

            <Box >
              <Text>
                <Text color="gray">Progress: </Text>
                <Text color="white">
                  {progress.processedItems}/{progress.totalItems} {progress.currentItemUnit || 'items'}
                </Text>
                {progress.totalItems === 0 && status?.systemStatus === 'Indexed' && (
                  <Text color="yellow"> (All files cached)</Text>
                )}
              </Text>
            </Box>

            <Box >
              <Text>{getProgressBar(progress.processedItems, progress.totalItems)}</Text>
              <Text color="gray"> {progress.totalItems > 0 ? Math.round((progress.processedItems / progress.totalItems) * 100) : 0}%</Text>
            </Box>
          </>
        )}

        <Box >
          <Text>
            <Text color="gray">Message: </Text>
            <Text color="cyan">{status?.message || progress.message}</Text>
          </Text>
        </Box>

        {status?.lastUpdate && (
          <Box >
            <Text>
              <Text color="gray">Last Update: </Text>
              <Text color="white">{new Date(status.lastUpdate).toLocaleTimeString()}</Text>
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
