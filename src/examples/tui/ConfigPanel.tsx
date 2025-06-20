import React from 'react';
import { Box, Text } from 'ink';

interface ConfigPanelProps {
  config: any;
  onConfigUpdate: (config: any) => void;
  onLog: (message: string) => void;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, onConfigUpdate, onLog }) => {
  return (
    <Box flexDirection="column">
      <Text bold color="yellow">⚙️  Configuration</Text>
      <Box marginTop={1}>
        {config ? (
          <Box flexDirection="column">
            <Text color="green">✅ Configuration loaded</Text>
            <Box marginTop={1}>
              <Text>
                <Text color="gray">Provider: </Text>
                <Text color="white">{config.embedderProvider || 'Not set'}</Text>
              </Text>
            </Box>
            <Box>
              <Text>
                <Text color="gray">Model: </Text>
                <Text color="white">{config.modelId || 'Not set'}</Text>
              </Text>
            </Box>
            <Box>
              <Text>
                <Text color="gray">Ollama URL: </Text>
                <Text color="white">{config.ollamaOptions?.ollamaBaseUrl || 'Not set'}</Text>
              </Text>
            </Box>
            <Box>
              <Text>
                <Text color="gray">Qdrant URL: </Text>
                <Text color="white">{config.qdrantUrl || 'Not set'}</Text>
              </Text>
            </Box>
            <Box>
              <Text>
                <Text color="gray">Status: </Text>
                <Text color={config.isEnabled ? 'green' : 'red'}>
                  {config.isEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </Text>
            </Box>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Text color="yellow">⏳ Loading configuration...</Text>
            <Box marginTop={1}>
              <Text color="gray">Default settings:</Text>
              <Text>• Provider: ollama</Text>
              <Text>• Model: nomic-embed-text</Text>
              <Text>• Ollama: http://localhost:11434</Text>
              <Text>• Qdrant: http://localhost:6333</Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};