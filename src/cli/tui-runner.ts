import React from 'react';
import { Box, Text } from 'ink';
import * as path from 'path';
import fs from 'fs';
import { createNodeDependencies } from '../adapters/nodejs';
import { CodeIndexManager } from '../code-index/manager';
import { App } from '../examples/tui/App';
import { CliOptions } from './args-parser';
import createSampleFiles from '../examples/create-sample-files';
import { createMCPServer, CodebaseMCPServer } from '../mcp/server';

// Extract sample files creation from original demo


export function createTUIApp(options: CliOptions) {
  const AppWithOptions: React.FC = () => {
    const [codeIndexManager, setCodeIndexManager] = React.useState<any>(null);
    const [dependencies, setDependencies] = React.useState<any>(null);
    const [error, setError] = React.useState<string | null>(null);
    
    React.useEffect(() => {
      async function initialize() {
        // Ensure options.path is absolute; if not, prepend process.cwd()
        let resolvedPath = options.path;
        if (!path.isAbsolute(resolvedPath)) {
          resolvedPath = path.join(process.cwd(), resolvedPath);
        }

        // Create workspace path - use demo subdirectory if --demo flag is set
        const workspacePath = options.demo
          ? path.join(resolvedPath, 'demo')
          : resolvedPath;
        // console.log('[tui-runner]📂 Workspace path:', workspacePath);
        const deps = createNodeDependencies({
          workspacePath,
          storageOptions: {
            globalStoragePath: options.storage || path.join(process.cwd(), '.autodev-storage'),
            cacheBasePath: options.cache || path.join(process.cwd(), '.autodev-cache')
          },
          loggerOptions: {
            name: 'Autodev-Codebase-TUI',
            level: options.logLevel,
            timestamps: true,
            colors: true
          },
          configOptions: {
            configPath: options.config || path.join(process.cwd(), '.autodev-config.json'),
            defaultConfig: {
              isEnabled: true,
              isConfigured: true,
              embedderProvider: "ollama",
              modelId: options.model,
              ollamaOptions: {
                ollamaBaseUrl: options.ollamaUrl,
                apiKey: '',
              },
              qdrantUrl: options.qdrantUrl
            }
          }
        });

        try {
          // Log workspace path after deps are created so we can use the logger
          deps.logger?.info('[tui-runner]📂 Workspace path:', workspacePath);
          
          // Create demo files if requested
          if (options.demo) {
            const workspaceExists = await deps.fileSystem.exists(workspacePath);
            if (!workspaceExists) {
              fs.mkdirSync(workspacePath, { recursive: true });
              await createSampleFiles(deps.fileSystem, workspacePath);
              deps.logger?.info('[tui-runner]📁 Demo files created in:', workspacePath);
            }
          }

          deps.logger?.info('[tui-runner]⚙️ Loading configuration...');
          const config = await deps.configProvider.loadConfig();
          deps.logger?.info('[tui-runner]📝 Configuration:', JSON.stringify(config, null, 2));

          deps.logger?.info('[tui-runner]✅ Validating configuration...');
          const validation = await deps.configProvider.validateConfig();
          deps.logger?.info('[tui-runner]📝 Validation result:', validation);

          if (!validation.isValid) {
            deps.logger?.warn('[tui-runner]⚠️ Configuration validation warnings:', validation.errors);
            deps.logger?.info('[tui-runner]⚠️ Continuing initialization (debug mode)');
          } else {
            deps.logger?.info('[tui-runner]✅ Configuration validation passed');
          }

          setDependencies(deps);

          deps.logger?.info('Creating CodeIndexManager with dependencies:', {
            hasFileSystem: !!deps.fileSystem,
            hasStorage: !!deps.storage,
            hasEventBus: !!deps.eventBus,
            hasWorkspace: !!deps.workspace,
            hasPathUtils: !!deps.pathUtils,
            hasConfigProvider: !!deps.configProvider,
            workspaceRootPath: deps.workspace.getRootPath()
          });

          const manager = CodeIndexManager.getInstance(deps);
          deps.logger?.info('CodeIndexManager instance created:', !!manager);

          if (!manager) {
            setError('Failed to create CodeIndexManager - workspace root path may be invalid');
            return;
          }

          deps.logger?.info('[tui-runner]⚙️ Initializing CodeIndexManager...');
          const initResult = await manager.initialize();
          deps.logger?.info('[tui-runner]✅ CodeIndexManager initialization success:', initResult);
          deps.logger?.info('[tui-runner]📝 Manager state:', {
            isInitialized: manager.isInitialized,
            isFeatureEnabled: manager.isFeatureEnabled,
            isFeatureConfigured: manager.isFeatureConfigured,
            state: manager.state
          });

          deps.logger?.info('[tui-runner]🔄 Setting CodeIndexManager to state...');
          setCodeIndexManager(manager);
          deps.logger?.info('[tui-runner]✅ CodeIndexManager set to state');

          // Start indexing in background
          deps.logger?.info('[tui-runner]🚀 Preparing to start indexing...');
          manager.onProgressUpdate((progressInfo) => {
            deps.logger?.info('[tui-runner]📊 Indexing progress:', progressInfo);
          });

          setTimeout(() => {
            if (manager.isFeatureEnabled && manager.isInitialized) {
              deps.logger?.info('[tui-runner]🚀 Starting indexing process...');
              deps.logger?.info('[tui-runner]📊 Current state:', manager.state);

              const indexingTimeout = setTimeout(() => {
                deps.logger?.warn('[tui-runner]⚠️ Indexing process timeout (30s), may be stuck');
              }, 30000);

              manager.startIndexing()
                .then(() => {
                  clearTimeout(indexingTimeout);
                  deps.logger?.info('[tui-runner]✅ Indexing completed');
                })
                .catch((err: any) => {
                  clearTimeout(indexingTimeout);
                  deps.logger?.error('[tui-runner]❌ Indexing failed:', err);
                  deps.logger?.error('[tui-runner]❌ Error stack:', err.stack);
                  setError(`Indexing failed: ${err.message}`);
                });
            } else {
              deps.logger?.warn('[tui-runner]⚠️ Skipping indexing - feature not enabled or not initialized');
              deps.logger?.error('[tui-runner]📊 Feature state:', {
                isFeatureEnabled: manager.isFeatureEnabled,
                isInitialized: manager.isInitialized,
                state: manager.state
              });
            }
          }, 1000);

          deps.logger?.info('[tui-runner]✅ Initialization completed');

        } catch (err: any) {
          deps.logger?.error('[tui-runner]❌ Initialization failed:', err);
          deps.logger?.error('[tui-runner]❌ Error stack:', err.stack);
          setError(`Initialization failed: ${err.message}`);
        }
      }

      initialize();
    }, []);

    if (error) {
      return React.createElement(Box, { flexDirection: "column", padding: 1 },
        React.createElement(Text, { bold: true, color: "red" }, "X Initialization Failed"),
        React.createElement(Text, { color: "white" }, error),
        React.createElement(Text, { color: "gray" }, "Please check configuration or service connection status")
      );
    }
    const DummyApp = () => null;
    return React.createElement(App, { codeIndexManager, dependencies });
  };

  return AppWithOptions;
}

export function createDualModeApp(options: CliOptions) {
  const DualModeAppWithOptions: React.FC = () => {
    const [codeIndexManager, setCodeIndexManager] = React.useState<any>(null);
    const [dependencies, setDependencies] = React.useState<any>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [mcpServer, setMcpServer] = React.useState<CodebaseMCPServer | null>(null);
    const [mcpStatus, setMcpStatus] = React.useState<'starting' | 'running' | 'error'>('starting');
    
    React.useEffect(() => {
      async function initialize() {
        // Ensure options.path is absolute; if not, prepend process.cwd()
        let resolvedPath = options.path;
        if (!path.isAbsolute(resolvedPath)) {
          resolvedPath = path.join(process.cwd(), resolvedPath);
        }

        // Create workspace path - use demo subdirectory if --demo flag is set
        const workspacePath = options.demo
          ? path.join(resolvedPath, 'demo')
          : resolvedPath;
        
        const deps = createNodeDependencies({
          workspacePath,
          storageOptions: {
            globalStoragePath: options.storage || path.join(process.cwd(), '.autodev-storage'),
            cacheBasePath: options.cache || path.join(process.cwd(), '.autodev-cache')
          },
          loggerOptions: {
            name: 'Autodev-Codebase-Dual-Mode',
            level: options.logLevel,
            timestamps: true,
            colors: true
          },
          configOptions: {
            configPath: options.config || path.join(process.cwd(), '.autodev-config.json'),
            defaultConfig: {
              isEnabled: true,
              isConfigured: true,
              embedderProvider: "ollama",
              modelId: options.model,
              ollamaOptions: {
                ollamaBaseUrl: options.ollamaUrl,
                apiKey: '',
              },
              qdrantUrl: options.qdrantUrl
            }
          }
        });

        try {
          // Log workspace path after deps are created so we can use the logger
          deps.logger?.info('[dual-mode]📂 Workspace path:', workspacePath);
          deps.logger?.info('[dual-mode]🔄 MCP Server mode enabled');
          
          // Create demo files if requested
          if (options.demo) {
            const workspaceExists = await deps.fileSystem.exists(workspacePath);
            if (!workspaceExists) {
              fs.mkdirSync(workspacePath, { recursive: true });
              await createSampleFiles(deps.fileSystem, workspacePath);
              deps.logger?.info('[dual-mode]📁 Demo files created in:', workspacePath);
            }
          }

          deps.logger?.info('[dual-mode]⚙️ Loading configuration...');
          const config = await deps.configProvider.loadConfig();
          deps.logger?.info('[dual-mode]📝 Configuration:', JSON.stringify(config, null, 2));

          deps.logger?.info('[dual-mode]✅ Validating configuration...');
          const validation = await deps.configProvider.validateConfig();
          deps.logger?.info('[dual-mode]📝 Validation result:', validation);

          if (!validation.isValid) {
            deps.logger?.warn('[dual-mode]⚠️ Configuration validation warnings:', validation.errors);
            deps.logger?.info('[dual-mode]⚠️ Continuing initialization (debug mode)');
          } else {
            deps.logger?.info('[dual-mode]✅ Configuration validation passed');
          }

          setDependencies(deps);

          deps.logger?.info('Creating CodeIndexManager with dependencies:', {
            hasFileSystem: !!deps.fileSystem,
            hasStorage: !!deps.storage,
            hasEventBus: !!deps.eventBus,
            hasWorkspace: !!deps.workspace,
            hasPathUtils: !!deps.pathUtils,
            hasConfigProvider: !!deps.configProvider,
            workspaceRootPath: deps.workspace.getRootPath()
          });

          const manager = CodeIndexManager.getInstance(deps);
          deps.logger?.info('CodeIndexManager instance created:', !!manager);

          if (!manager) {
            setError('Failed to create CodeIndexManager - workspace root path may be invalid');
            return;
          }

          deps.logger?.info('[dual-mode]⚙️ Initializing CodeIndexManager...');
          const initResult = await manager.initialize();
          deps.logger?.info('[dual-mode]✅ CodeIndexManager initialization success:', initResult);
          deps.logger?.info('[dual-mode]📝 Manager state:', {
            isInitialized: manager.isInitialized,
            isFeatureEnabled: manager.isFeatureEnabled,
            isFeatureConfigured: manager.isFeatureConfigured,
            state: manager.state
          });

          deps.logger?.info('[dual-mode]🔄 Setting CodeIndexManager to state...');
          setCodeIndexManager(manager);
          deps.logger?.info('[dual-mode]✅ CodeIndexManager set to state');

          // Start MCP Server
          deps.logger?.info('[dual-mode]🚀 Starting MCP Server...');
          try {
            const server = await createMCPServer(manager);
            setMcpServer(server);
            setMcpStatus('running');
            deps.logger?.info('[dual-mode]✅ MCP Server started successfully');
            
            // Log MCP server usage instructions
            console.log('\n🔗 MCP Server Running!');
            console.log('Add this to your IDE MCP configuration:');
            console.log(JSON.stringify({
              "mcpServers": {
                "codebase": {
                  "command": "codebase",
                  "args": [`--path=${workspacePath}`, "--mcp-server"]
                }
              }
            }, null, 2));
            console.log('');
          } catch (mcpError: any) {
            deps.logger?.error('[dual-mode]❌ MCP Server failed to start:', mcpError);
            setMcpStatus('error');
            setError(`MCP Server failed to start: ${mcpError.message}`);
          }

          // Start indexing in background
          deps.logger?.info('[dual-mode]🚀 Preparing to start indexing...');
          manager.onProgressUpdate((progressInfo) => {
            deps.logger?.info('[dual-mode]📊 Indexing progress:', progressInfo);
          });

          setTimeout(() => {
            if (manager.isFeatureEnabled && manager.isInitialized) {
              deps.logger?.info('[dual-mode]🚀 Starting indexing process...');
              deps.logger?.info('[dual-mode]📊 Current state:', manager.state);

              const indexingTimeout = setTimeout(() => {
                deps.logger?.warn('[dual-mode]⚠️ Indexing process timeout (30s), may be stuck');
              }, 30000);

              manager.startIndexing()
                .then(() => {
                  clearTimeout(indexingTimeout);
                  deps.logger?.info('[dual-mode]✅ Indexing completed');
                })
                .catch((err: any) => {
                  clearTimeout(indexingTimeout);
                  deps.logger?.error('[dual-mode]❌ Indexing failed:', err);
                  deps.logger?.error('[dual-mode]❌ Error stack:', err.stack);
                  setError(`Indexing failed: ${err.message}`);
                });
            } else {
              deps.logger?.warn('[dual-mode]⚠️ Skipping indexing - feature not enabled or not initialized');
              deps.logger?.error('[dual-mode]📊 Feature state:', {
                isFeatureEnabled: manager.isFeatureEnabled,
                isInitialized: manager.isInitialized,
                state: manager.state
              });
            }
          }, 1000);

          deps.logger?.info('[dual-mode]✅ Dual-mode initialization completed');

        } catch (err: any) {
          deps.logger?.error('[dual-mode]❌ Initialization failed:', err);
          deps.logger?.error('[dual-mode]❌ Error stack:', err.stack);
          setError(`Initialization failed: ${err.message}`);
        }
      }

      initialize();
    }, []);

    // Handle graceful shutdown
    React.useEffect(() => {
      const handleShutdown = async () => {
        if (mcpServer) {
          console.log('\n🔄 Shutting down MCP Server...');
          await mcpServer.stop();
          console.log('✅ MCP Server stopped');
        }
        process.exit(0);
      };

      process.on('SIGINT', handleShutdown);
      process.on('SIGTERM', handleShutdown);

      return () => {
        process.off('SIGINT', handleShutdown);
        process.off('SIGTERM', handleShutdown);
      };
    }, [mcpServer]);

    if (error) {
      return React.createElement(Box, { flexDirection: "column", padding: 1 },
        React.createElement(Text, { bold: true, color: "red" }, "X Dual-Mode Initialization Failed"),
        React.createElement(Text, { color: "white" }, error),
        React.createElement(Text, { color: "gray" }, "Please check configuration or service connection status")
      );
    }

    // Show MCP status in the UI
    const DualModeInfo = React.createElement(Box, { flexDirection: "column", marginBottom: 1 },
      React.createElement(Text, { bold: true, color: "blue" }, "🔗 Dual Mode: TUI + MCP Server"),
      React.createElement(Text, { color: mcpStatus === 'running' ? 'green' : mcpStatus === 'error' ? 'red' : 'yellow' },
        `MCP Server Status: ${mcpStatus === 'running' ? '✅ Running' : mcpStatus === 'error' ? '❌ Error' : '⏳ Starting'}`
      )
    );

    return React.createElement(Box, { flexDirection: "column" },
      DualModeInfo,
      React.createElement(App, { codeIndexManager, dependencies })
    );
  };

  return DualModeAppWithOptions;
}

export async function startMCPServerMode(options: CliOptions): Promise<void> {
  // Ensure options.path is absolute; if not, prepend process.cwd()
  let resolvedPath = options.path;
  if (!path.isAbsolute(resolvedPath)) {
    resolvedPath = path.join(process.cwd(), resolvedPath);
  }

  // Create workspace path - use demo subdirectory if --demo flag is set
  const workspacePath = options.demo
    ? path.join(resolvedPath, 'demo')
    : resolvedPath;
  
  console.log('🚀 Starting MCP Server Mode');
  console.log(`📂 Workspace: ${workspacePath}`);
  
  const deps = createNodeDependencies({
    workspacePath,
    storageOptions: {
      globalStoragePath: options.storage || path.join(process.cwd(), '.autodev-storage'),
      cacheBasePath: options.cache || path.join(process.cwd(), '.autodev-cache')
    },
    loggerOptions: {
      name: 'Autodev-Codebase-MCP',
      level: options.logLevel,
      timestamps: true,
      colors: false // Disable colors for MCP server mode
    },
    configOptions: {
      configPath: options.config || path.join(process.cwd(), '.autodev-config.json'),
      defaultConfig: {
        isEnabled: true,
        isConfigured: true,
        embedderProvider: "ollama",
        modelId: options.model,
        ollamaOptions: {
          ollamaBaseUrl: options.ollamaUrl,
          apiKey: '',
        },
        qdrantUrl: options.qdrantUrl
      }
    }
  });

  try {
    // Create demo files if requested
    if (options.demo) {
      const workspaceExists = await deps.fileSystem.exists(workspacePath);
      if (!workspaceExists) {
        fs.mkdirSync(workspacePath, { recursive: true });
        await createSampleFiles(deps.fileSystem, workspacePath);
        console.log(`📁 Demo files created in: ${workspacePath}`);
      }
    }

    console.log('⚙️ Loading configuration...');
    const config = await deps.configProvider.loadConfig();
    
    console.log('✅ Validating configuration...');
    const validation = await deps.configProvider.validateConfig();
    
    if (!validation.isValid) {
      console.warn('⚠️ Configuration validation warnings:', validation.errors);
      console.log('⚠️ Continuing initialization (debug mode)');
    } else {
      console.log('✅ Configuration validation passed');
    }

    console.log('🔧 Creating CodeIndexManager...');
    const manager = CodeIndexManager.getInstance(deps);
    
    if (!manager) {
      throw new Error('Failed to create CodeIndexManager - workspace root path may be invalid');
    }

    console.log('⚙️ Initializing CodeIndexManager...');
    const initResult = await manager.initialize();
    console.log('✅ CodeIndexManager initialization success');

    // Start MCP Server
    console.log('🚀 Starting MCP Server...');
    const server = await createMCPServer(manager);
    console.log('✅ MCP Server started successfully');
    
    // Display configuration instructions
    console.log('\n🔗 MCP Server is now running!');
    console.log('Add this configuration to your IDE:');
    console.log(JSON.stringify({
      "mcpServers": {
        "codebase": {
          "command": "codebase",
          "args": [`--path=${workspacePath}`, "--mcp-server"]
        }
      }
    }, null, 2));
    console.log('');

    // Start indexing in background
    console.log('🚀 Starting indexing process...');
    manager.onProgressUpdate((progressInfo) => {
      console.log(`📊 Indexing progress: ${progressInfo.systemStatus} - ${progressInfo.message || ''}`);
    });

    if (manager.isFeatureEnabled && manager.isInitialized) {
      manager.startIndexing()
        .then(() => {
          console.log('✅ Indexing completed');
        })
        .catch((err: any) => {
          console.error('❌ Indexing failed:', err.message);
        });
    } else {
      console.warn('⚠️ Skipping indexing - feature not enabled or not initialized');
    }

    // Handle graceful shutdown
    const handleShutdown = async () => {
      console.log('\n🔄 Shutting down MCP Server...');
      await server.stop();
      console.log('✅ MCP Server stopped');
      process.exit(0);
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);

    console.log('📡 MCP Server is ready for connections. Press Ctrl+C to stop.');
    
    // Keep the process alive
    return new Promise(() => {}); // This never resolves, keeping the server running

  } catch (err: any) {
    console.error('❌ MCP Server initialization failed:', err.message);
    process.exit(1);
  }
}
