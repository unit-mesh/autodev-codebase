import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

interface LogPanelProps {
  logs: string[];
}

export const LogPanel: React.FC<LogPanelProps> = ({ logs }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const logsPerPage = 10;

  const reversedLogs = [...logs].reverse();
  const totalPages = Math.ceil(reversedLogs.length / logsPerPage);
  const startIndex = currentPage * logsPerPage;
  const endIndex = startIndex + logsPerPage;
  const currentLogs = reversedLogs.slice(startIndex, endIndex);

  useEffect(() => {
    if (logs.length > 0) {
      setCurrentPage(0);
    }
  }, [logs.length]);

  useInput((input, key) => {
    if (key.leftArrow && currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
    if (key.rightArrow && currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  });

  const getLogColor = (log: string): string => {
    if (log.includes('❌') || log.includes('Error')) return 'red';
    if (log.includes('⚠️') || log.includes('Warning')) return 'yellow';
    if (log.includes('✅') || log.includes('Success')) return 'green';
    if (log.includes('🔍') || log.includes('Search')) return 'cyan';
    if (log.includes('📊') || log.includes('Progress')) return 'blue';
    return 'white';
  };

  const truncateLog = (log: string, maxLength: number = 80): string => {
    const singleLine = log.replace(/\n/g, ' ↵ ').replace(/\r/g, '');
    return singleLine.length > maxLength ? singleLine.substring(0, maxLength) + '...' : singleLine;
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="magenta">📋 System Logs </Text>
        {totalPages > 1 && (
          <Text color="gray">
            (Page {currentPage + 1}/{totalPages}, ← → to navigate)
          </Text>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        {logs.length === 0 ? (
          <Text color="gray">No logs yet...</Text>
        ) : (
          currentLogs.map((log, index) => (
            <Text key={startIndex + index} color={getLogColor(log)} wrap="truncate">
              {truncateLog(log)}
            </Text>
          ))
        )}
      </Box>

      {logs.length > 0 && (
        <Box marginTop={1}>
          <Text color="gray">
            Total: {logs.length} logs
          </Text>
        </Box>
      )}
    </Box>
  );
};
