import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfigPanel } from './ConfigPanel';
import { ProgressMonitor } from './ProgressMonitor';
import { SearchInterface } from './SearchInterface';
import { LogPanel } from './LogPanel';

export interface AppState {
  currentView: 'config' | 'progress' | 'search' | 'logs';
  config: any;
  progress: any;
  logs: string[];
  codeIndexManager: any;
}

export const App: React.FC<{ codeIndexManager?: any }> = ({ codeIndexManager }) => {
  const [state, setState] = useState<AppState>({
    currentView: 'config',
    config: null,
    progress: { processedItems: 0, totalItems: 0, message: 'Initializing...' },
    logs: ['🚀 Starting Autodev Codebase TUI'],
    codeIndexManager
  });

  useInput((input, key) => {
    if (key.tab) {
      const views: AppState['currentView'][] = ['config', 'progress', 'search', 'logs'];
      const currentIndex = views.indexOf(state.currentView);
      const nextView = views[(currentIndex + 1) % views.length];
      setState(prev => ({ ...prev, currentView: nextView }));
    }
    if (input === 'q' && key.ctrl) {
      process.exit(0);
    }
  });

  const addLog = (message: string) => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs.slice(-50), `${new Date().toLocaleTimeString()} ${message}`]
    }));
  };

  const updateProgress = (progress: any) => {
    setState(prev => ({ ...prev, progress }));
  };

  const updateConfig = (config: any) => {
    setState(prev => ({ ...prev, config }));
  };

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="double" borderColor="blue" padding={1}>
        <Text bold color="blue">Autodev Codebase TUI</Text>
        <Box marginLeft={2}>
          <Text color="gray">Tab: Switch views | Ctrl+Q: Quit</Text>
        </Box>
      </Box>
      
      <Box flexDirection="row" flexGrow={1}>
        <Box width="25%" borderStyle="single" borderColor="gray" padding={1}>
          <Text bold>Navigation</Text>
          <Box flexDirection="column" marginTop={1}>
            <Text color={state.currentView === 'config' ? 'green' : 'white'}>
              {state.currentView === 'config' ? '▶ ' : '  '}Config
            </Text>
            <Text color={state.currentView === 'progress' ? 'green' : 'white'}>
              {state.currentView === 'progress' ? '▶ ' : '  '}Progress
            </Text>
            <Text color={state.currentView === 'search' ? 'green' : 'white'}>
              {state.currentView === 'search' ? '▶ ' : '  '}Search
            </Text>
            <Text color={state.currentView === 'logs' ? 'green' : 'white'}>
              {state.currentView === 'logs' ? '▶ ' : '  '}Logs
            </Text>
          </Box>
        </Box>

        <Box flexGrow={1} borderStyle="single" borderColor="gray" padding={1}>
          {state.currentView === 'config' && (
            <ConfigPanel 
              config={state.config} 
              onConfigUpdate={updateConfig}
              onLog={addLog}
            />
          )}
          {state.currentView === 'progress' && (
            <ProgressMonitor 
              progress={state.progress}
              codeIndexManager={state.codeIndexManager}
              onLog={addLog}
            />
          )}
          {state.currentView === 'search' && (
            <SearchInterface 
              codeIndexManager={state.codeIndexManager}
              onLog={addLog}
            />
          )}
          {state.currentView === 'logs' && (
            <LogPanel logs={state.logs} />
          )}
        </Box>
      </Box>
    </Box>
  );
};