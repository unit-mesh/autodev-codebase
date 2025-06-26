import React from 'react';
import { Box, Text } from 'ink';
import * as path from 'path';
import fs from 'fs';
import { createNodeDependencies } from '../adapters/nodejs';
import { CodeIndexManager } from '../code-index/manager';
import { App } from '../examples/tui/App';
import { CliOptions } from './args-parser';
import createSampleFiles from '../examples/create-sample-files';
import { CodebaseMCPServer, createMCPServer } from '../mcp/server';
import { CodebaseHTTPMCPServer } from '../mcp/http-server.js';

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


// Helper function to create HTTP MCP server
async function createHTTPMCPServer(manager: CodeIndexManager, options?: { port?: number; host?: string }): Promise<CodebaseHTTPMCPServer> {
  const server = new CodebaseHTTPMCPServer({
    codeIndexManager: manager,
    port: options?.port,
    host: options?.host
  });
  
  await server.start();
  return server;
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
    const server = await createHTTPMCPServer(manager, {
      port: options.mcpPort,
      host: options.mcpHost
    });
    console.log('✅ MCP Server started successfully');
    
    // Display configuration instructions
    console.log('\n🔗 MCP Server is now running!');
    console.log('Configure your IDE to connect to the HTTP MCP server:');
    console.log(JSON.stringify({
      "mcpServers": {
        "codebase": {
          "url": `http://${options.mcpHost || 'localhost'}:${options.mcpPort || 3001}/sse`
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
