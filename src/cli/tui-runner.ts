import React from 'react';
import { Box, Text } from 'ink';
import * as path from 'path';
import fs from 'fs';
import { createNodeDependencies } from '../adapters/nodejs';
import { CodeIndexManager } from '../code-index/manager';
import { App } from '../examples/tui/App';
import { CliOptions } from './args-parser';

// Extract sample files creation from original demo
async function createSampleFiles(fileSystem: any, demoFolder: string) {
  const sampleFiles = [
    {
      path: 'hello.js',
      content: '// Sample JavaScript file\nfunction greetUser(name) {\n  console.log(`Hello, ${name}!`);\n  return `Welcome, ${name}`;\n}\n\nclass UserManager {\n  constructor() {\n    this.users = [];\n  }\n\n  addUser(user) {\n    this.users.push(user);\n    console.log(\'User added:\', user.name);\n  }\n\n  getUsers() {\n    return this.users;\n  }\n}\n\nmodule.exports = { greetUser, UserManager };\n'
    },
    {
      path: 'utils.py',
      content: '"""\nUtility functions for data processing\n"""\n\ndef process_data(data):\n    """Process input data and return cleaned version"""\n    if not data:\n        return []\n\n    # Clean and filter data\n    cleaned = [item.strip() for item in data if item.strip()]\n    return cleaned\n\nclass DataProcessor:\n    def __init__(self, config=None):\n        self.config = config or {}\n        self.processed_count = 0\n\n    def process_batch(self, batch):\n        """Process a batch of data items"""\n        results = []\n        for item in batch:\n            processed = self._process_item(item)\n            results.append(processed)\n            self.processed_count += 1\n        return results\n\n    def _process_item(self, item):\n        """Process individual item"""\n        # Apply transformations\n        return item.upper() if isinstance(item, str) else item\n'
    },
    {
      path: 'README.md',
      content: '# Demo Project\n\nThis is a sample project for demonstrating the Autodev Codebase indexing system.\n\n## Features\n\n- JavaScript utilities\n- Python data processing\n- Markdown documentation\n- Automated code indexing\n\n## Usage\n\nThe system will automatically index all files in this directory and provide semantic search capabilities.\n\n### JavaScript Functions\n\n- `greetUser(name)` - Greets a user by name\n- `UserManager` - Class for managing user data\n\n### Python Functions\n\n- `process_data(data)` - Cleans and processes input data\n- `DataProcessor` - Class for batch data processing\n\n## Search Examples\n\nTry searching for:\n- "greet user"\n- "process data"\n- "user management"\n- "batch processing"\n'
    },
    {
      path: 'config.json',
      content: '{\n  "app_name": "Demo Application",\n  "version": "1.0.0",\n  "settings": {\n    "debug": true,\n    "max_users": 1000,\n    "data_processing": {\n      "batch_size": 100,\n      "timeout": 30000\n    }\n  },\n  "features": {\n    "user_management": true,\n    "data_processing": true,\n    "search": true\n  }\n}\n'
    }
  ];

  for (const file of sampleFiles) {
    const filePath = path.join(demoFolder, file.path);
    const content = new TextEncoder().encode(file.content);
    await fileSystem.writeFile(filePath, content);
  }
}

export function createTUIApp(options: CliOptions) {
  const AppWithOptions: React.FC = () => {
    const [codeIndexManager, setCodeIndexManager] = React.useState<any>(null);
    const [dependencies, setDependencies] = React.useState<any>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
      async function initialize() {
        // Create workspace path - use demo subdirectory if --demo flag is set
        const workspacePath = options.demo 
          ? path.join(options.path, 'demo')
          : options.path;

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
          // Create demo files if requested
          if (options.demo) {
            const workspaceExists = await deps.fileSystem.exists(workspacePath);
            if (!workspaceExists) {
              fs.mkdirSync(workspacePath, { recursive: true });
              await createSampleFiles(deps.fileSystem, workspacePath);
              deps.logger.info('[tui-runner]📁 Demo files created in:', workspacePath);
            }
          }

          deps.logger.info('[tui-runner]⚙️ Loading configuration...');
          const config = await deps.configProvider.loadConfig();
          deps.logger.info('[tui-runner]📝 Configuration:', JSON.stringify(config, null, 2));

          deps.logger.info('[tui-runner]✅ Validating configuration...');
          const validation = await deps.configProvider.validateConfig();
          deps.logger.info('[tui-runner]📝 Validation result:', validation);

          if (!validation.isValid) {
            deps.logger.warn('[tui-runner]⚠️ Configuration validation warnings:', validation.errors);
            deps.logger.info('[tui-runner]⚠️ Continuing initialization (debug mode)');
          } else {
            deps.logger.info('[tui-runner]✅ Configuration validation passed');
          }

          setDependencies(deps);

          deps.logger.info('Creating CodeIndexManager with dependencies:', {
            hasFileSystem: !!deps.fileSystem,
            hasStorage: !!deps.storage,
            hasEventBus: !!deps.eventBus,
            hasWorkspace: !!deps.workspace,
            hasPathUtils: !!deps.pathUtils,
            hasConfigProvider: !!deps.configProvider,
            workspaceRootPath: deps.workspace.getRootPath()
          });

          const manager = CodeIndexManager.getInstance(deps);
          deps.logger.info('CodeIndexManager instance created:', !!manager);

          if (!manager) {
            setError('Failed to create CodeIndexManager - workspace root path may be invalid');
            return;
          }

          deps.logger.info('[tui-runner]⚙️ Initializing CodeIndexManager...');
          const initResult = await manager.initialize();
          deps.logger.info('[tui-runner]✅ CodeIndexManager initialization success:', initResult);
          deps.logger.info('[tui-runner]📝 Manager state:', {
            isInitialized: manager.isInitialized,
            isFeatureEnabled: manager.isFeatureEnabled,
            isFeatureConfigured: manager.isFeatureConfigured,
            state: manager.state
          });
          
          deps.logger.info('[tui-runner]🔄 Setting CodeIndexManager to state...');
          setCodeIndexManager(manager);
          deps.logger.info('[tui-runner]✅ CodeIndexManager set to state');

          // Start indexing in background
          deps.logger.info('[tui-runner]🚀 Preparing to start indexing...');
          manager.onProgressUpdate((progressInfo) => {
            deps.logger.info('[tui-runner]📊 Indexing progress:', progressInfo);
          });

          setTimeout(() => {
            if (manager.isFeatureEnabled && manager.isInitialized) {
              deps.logger.info('[tui-runner]🚀 Starting indexing process...');
              deps.logger.info('[tui-runner]📊 Current state:', manager.state);

              const indexingTimeout = setTimeout(() => {
                deps.logger.warn('[tui-runner]⚠️ Indexing process timeout (30s), may be stuck');
              }, 30000);

              manager.startIndexing()
                .then(() => {
                  clearTimeout(indexingTimeout);
                  deps.logger.info('[tui-runner]✅ Indexing completed');
                })
                .catch((err: any) => {
                  clearTimeout(indexingTimeout);
                  deps.logger.error('[tui-runner]❌ Indexing failed:', err);
                  deps.logger.error('[tui-runner]❌ Error stack:', err.stack);
                  setError(`Indexing failed: ${err.message}`);
                });
            } else {
              deps.logger.warn('[tui-runner]⚠️ Skipping indexing - feature not enabled or not initialized');
              deps.logger.error('[tui-runner]📊 Feature state:', {
                isFeatureEnabled: manager.isFeatureEnabled,
                isInitialized: manager.isInitialized,
                state: manager.state
              });
            }
          }, 1000);
          
          deps.logger.info('[tui-runner]✅ Initialization completed');

        } catch (err: any) {
          deps.logger.error('[tui-runner]❌ Initialization failed:', err);
          deps.logger.error('[tui-runner]❌ Error stack:', err.stack);
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

    return React.createElement(App, { codeIndexManager, dependencies });
  };

  return AppWithOptions;
}