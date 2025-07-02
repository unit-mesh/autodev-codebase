import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfigPanel } from './ConfigPanel';
import { ProgressMonitor } from './ProgressMonitor';
import { SearchInterface } from './SearchInterface';
import { LogPanel } from './LogPanel';

const VIEWS: AppState['currentView'][] = ['progress', 'search', 'config', 'logs'];

export interface AppState {
  currentView: 'config' | 'progress' | 'search' | 'logs';
  config: any;
  logs: string[];
  codeIndexManager: any;
  dependencies: any;
}

export const App: React.FC<{ codeIndexManager?: any; dependencies?: any }> = ({ codeIndexManager, dependencies }) => {
  const [state, setState] = useState<AppState>({
    currentView: 'progress',
    config: null,
    logs: ['🚀 Starting Autodev Codebase TUI'],
    codeIndexManager,
    dependencies
  });

  useEffect(() => {
    if (dependencies?.configProvider) {
      dependencies.configProvider.getConfig().then((config: any) => {
        setState(prev => ({ ...prev, config }));
      }).catch((error: any) => {
        console.error('Failed to load config:', error);
      });
    }
  }, [dependencies]);

  // 监听 codeIndexManager 的变化并更新状态
  useEffect(() => {
    setState(prev => ({ ...prev, codeIndexManager }));
  }, [codeIndexManager]);

  // 监听 dependencies 的变化并更新状态
  useEffect(() => {
    setState(prev => ({ ...prev, dependencies }));
  }, [dependencies]);

  useInput((input, key) => {
    if (key.tab) {
      const currentIndex = VIEWS.indexOf(state.currentView);
      const nextView = VIEWS[(currentIndex + 1) % VIEWS.length];
      setState(prev => ({ ...prev, currentView: nextView }));
    }
    if (input === 'd' && key.ctrl) {
      process.exit(0);
    }
  });

  const addLog = (message: string) => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs.slice(-50), `${new Date().toLocaleTimeString()} ${message}`]
    }));
  };


  const updateConfig = (config: any) => {
    setState(prev => ({ ...prev, config }));
  };

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="double" borderColor="blue" paddingLeft={1}>
        <Text bold color="blue">Autodev Codebase TUI</Text>
        <Box marginLeft={2}>
          <Text color="gray">Tab: Switch views | Ctrl+D: Quit</Text>
        </Box>
      </Box>

      <Box flexDirection="row" flexGrow={1}>
        <Box width="25%" borderStyle="single" borderColor="gray" padding={1} paddingTop={0} flexDirection="column">
          <Text bold>Navigation</Text>
          <Box flexDirection="column" marginTop={1}>
            {VIEWS.map(view => (
              <Text
                key={view}
                color={state.currentView === view ? 'green' : 'white'}
              >
                {state.currentView === view ? '▶ ' : '  '}
                {view.charAt(0).toUpperCase() + view.slice(1)}
              </Text>
            ))}
          </Box>
        </Box>

        <Box width="75%" flexGrow={1} borderStyle="single" borderColor="gray" padding={1} paddingTop={0}>
          {state.currentView === 'config' && (
            <ConfigPanel
              config={state.config}
              onConfigUpdate={updateConfig}
              onLog={addLog}
            />
          )}
          {state.currentView === 'progress' && (
            <ProgressMonitor
              codeIndexManager={state.codeIndexManager}
              onLog={addLog}
            />
          )}
          {state.currentView === 'search' && (
            state.codeIndexManager ? (
              <SearchInterface
                codeIndexManager={state.codeIndexManager}
                dependencies={state.dependencies}
                onLog={addLog}
              />
            ) : (
              <Box flexDirection="column">
                <Text color="red">CodeIndexManager 未初始化</Text>
                <Text color="gray">请检查配置或等待初始化完成</Text>
                <Text color="yellow">调试信息:</Text>
                <Text color="gray">codeIndexManager: {state.codeIndexManager ? 'exists' : 'null'}</Text>
                <Text color="gray">type: {typeof state.codeIndexManager}</Text>
                {state.codeIndexManager && (
                  <>
                    <Text color="gray">isInitialized: {state.codeIndexManager.isInitialized ? 'true' : 'false'}</Text>
                    <Text color="gray">isFeatureEnabled: {state.codeIndexManager.isFeatureEnabled ? 'true' : 'false'}</Text>
                    <Text color="gray">state: {state.codeIndexManager.state || 'undefined'}</Text>
                  </>
                )}
              </Box>
            )
          )}
          {state.currentView === 'logs' && (
            <LogPanel logs={state.logs} />
          )}
        </Box>
      </Box>
    </Box>
  );
};
