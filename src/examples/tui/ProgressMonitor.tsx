import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

interface ProgressMonitorProps {
  progress: any;
  codeIndexManager: any;
  onLog: (message: string) => void;
}

export const ProgressMonitor: React.FC<ProgressMonitorProps> = ({ 
  progress, 
  codeIndexManager, 
  onLog 
}) => {
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    if (codeIndexManager) {
      const updateStatus = () => {
        const currentStatus = codeIndexManager.getCurrentStatus();
        setStatus(currentStatus);
      };

      updateStatus();
      const interval = setInterval(updateStatus, 1000);
      return () => clearInterval(interval);
    }
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
            <Box marginTop={1}>
              <Text>
                <Text color="gray">Total Items: </Text>
                <Text color="white">{status.totalItems}</Text>
              </Text>
            </Box>
            
            <Box marginTop={1}>
              <Text>
                <Text color="gray">Progress: </Text>
                <Text color="white">
                  {progress.processedItems}/{progress.totalItems} {progress.currentItemUnit || 'items'}
                </Text>
              </Text>
            </Box>
            
            <Box marginTop={1}>
              <Text>{getProgressBar(progress.processedItems, progress.totalItems)}</Text>
              <Text color="gray"> {progress.totalItems > 0 ? Math.round((progress.processedItems / progress.totalItems) * 100) : 0}%</Text>
            </Box>
          </>
        )}
        
        <Box marginTop={1}>
          <Text>
            <Text color="gray">Message: </Text>
            <Text color="cyan">{progress.message}</Text>
          </Text>
        </Box>
        
        {status?.lastUpdate && (
          <Box marginTop={1}>
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