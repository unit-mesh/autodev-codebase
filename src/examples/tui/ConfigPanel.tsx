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
      {config ? (
        <Box flexDirection="column" key="config-loaded" marginTop={1}>
          <Text color="green">✔ Configuration loaded</Text>
          <Box key="provider">
          <Text>
              <Text color="gray">Provider: </Text>
              <Text color="white">{config.embedderProvider || 'Not set'}</Text>
            </Text>
          </Box>
          <Box key="model">
            <Text>
              <Text color="gray">Model: </Text>
              <Text color="white">{config.modelId || 'Not set'}</Text>
            </Text>
          </Box>
          <Box key="ollama-url">
            <Text>
              <Text color="gray">Ollama URL: </Text>
              <Text color="white">{config.ollamaOptions?.ollamaBaseUrl || 'Not set'}</Text>
            </Text>
          </Box>
          <Box key="qdrant-url">
            <Text>
              <Text color="gray">Qdrant URL: </Text>
              <Text color="white">{config.qdrantUrl || 'Not set'}</Text>
            </Text>
          </Box>
          <Box key="status">
            <Text>
              <Text color="gray">Status: </Text>
              <Text color={config.isEnabled ? 'green' : 'red'}>
                {config.isEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" key="config-default" marginTop={1}>
          <Text color="gray">Default settings:</Text>
          <Box flexDirection="column" key="default-list">
            <Text key="default-provider">• Provider: ollama</Text>
            <Text key="default-model">• Model: nomic-embed-text</Text>
            <Text key="default-ollama">• Ollama: http://localhost:11434</Text>
            <Text key="default-qdrant">• Qdrant: http://localhost:6333</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
