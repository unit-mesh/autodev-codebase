#!/usr/bin/env node

import React from 'react';
import { render, Box, Text } from 'ink';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createNodeDependencies } from '../adapters/nodejs';
import { CodeIndexManager } from '../code-index/manager';
import { App } from './tui/App';
import fs from 'fs';

const DEMO_FOLDER = path.join(process.cwd(), 'demo');
const OLLAMA_BASE_URL = 'http://localhost:11434';
const QDRANT_URL = 'http://localhost:6333';
const OLLAMA_MODEL = 'nomic-embed-text';

async function createSampleFiles(fileSystem: any, demoFolder: string) {
  const sampleFiles = [
    {
      path: 'hello.js',
      content: `// Sample JavaScript file
function greetUser(name) {
  console.log(\`Hello, \${name}!\`);
  return \`Welcome, \${name}\`;
}

class UserManager {
  constructor() {
    this.users = [];
  }

  addUser(user) {
    this.users.push(user);
    console.log('User added:', user.name);
  }

  getUsers() {
    return this.users;
  }
}

module.exports = { greetUser, UserManager };
`
    },
    {
      path: 'utils.py',
      content: `"""
Utility functions for data processing
"""

def process_data(data):
    """Process input data and return cleaned version"""
    if not data:
        return []

    # Clean and filter data
    cleaned = [item.strip() for item in data if item.strip()]
    return cleaned

class DataProcessor:
    def __init__(self, config=None):
        self.config = config or {}
        self.processed_count = 0

    def process_batch(self, batch):
        """Process a batch of data items"""
        results = []
        for item in batch:
            processed = self._process_item(item)
            results.append(processed)
            self.processed_count += 1
        return results

    def _process_item(self, item):
        """Process individual item"""
        # Apply transformations
        return item.upper() if isinstance(item, str) else item
`
    },
    {
      path: 'README.md',
      content: `# Demo Project

This is a sample project for demonstrating the Autodev Codebase indexing system.

## Features

- JavaScript utilities
- Python data processing
- Markdown documentation
- Automated code indexing

## Usage

The system will automatically index all files in this directory and provide semantic search capabilities.

### JavaScript Functions

- \`greetUser(name)\` - Greets a user by name
- \`UserManager\` - Class for managing user data

### Python Functions

- \`process_data(data)\` - Cleans and processes input data
- \`DataProcessor\` - Class for batch data processing

## Search Examples

Try searching for:
- "greet user"
- "process data"
- "user management"
- "batch processing"
`
    },
    {
      path: 'config.json',
      content: `{
  "app_name": "Demo Application",
  "version": "1.0.0",
  "settings": {
    "debug": true,
    "max_users": 1000,
    "data_processing": {
      "batch_size": 100,
      "timeout": 30000
    }
  },
  "features": {
    "user_management": true,
    "data_processing": true,
    "search": true
  }
}
`
    }
  ];

  for (const file of sampleFiles) {
    const filePath = path.join(demoFolder, file.path);
    const content = new TextEncoder().encode(file.content);
    await fileSystem.writeFile(filePath, content);
  }
}

const AppWithData: React.FC = () => {
  const [codeIndexManager, setCodeIndexManager] = React.useState<any>(null);
  const [dependencies, setDependencies] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function initialize() {
      try {
        const deps = createNodeDependencies({
          workspacePath: DEMO_FOLDER,
          storageOptions: {
            globalStoragePath: path.join(process.cwd(), '.autodev-storage'),
            cacheBasePath: path.join(process.cwd(), '.autodev-cache')
          },
          loggerOptions: {
            name: 'Demo-Codebase-TUI',
            level: 'info',
            timestamps: true,
            colors: true
          },
          configOptions: {
            configPath: path.join(process.cwd(), '.autodev-config.json'),
            defaultConfig: {
              isEnabled: true,
              isConfigured: true,
              embedderProvider: "ollama",
              modelId: OLLAMA_MODEL,
              ollamaOptions: {
                ollamaBaseUrl: OLLAMA_BASE_URL,
                apiKey: '',
              },
              qdrantUrl: QDRANT_URL
            }
          }
        });

        const demoFolderExists = await deps.fileSystem.exists(DEMO_FOLDER);
        if (!demoFolderExists) {
          fs.mkdirSync(DEMO_FOLDER, { recursive: true });
          await createSampleFiles(deps.fileSystem, DEMO_FOLDER);
        }

        console.log('[run-demo]⚙️ 加载配置...');
        const config = await deps.configProvider.loadConfig();
        console.log('[run-demo]📝 配置内容:', JSON.stringify(config, null, 2));

        console.log('[run-demo]✅ 验证配置...');
        const validation = await deps.configProvider.validateConfig();
        console.log('[run-demo]📝 验证结果:', validation);

        if (!validation.isValid) {
          console.warn('[run-demo]⚠️ 配置验证警告:', validation.errors);
          console.log('[run-demo]⚠️ 继续初始化（调试模式）');
          // 在调试模式下，我们允许配置验证失败但继续初始化
        } else {
          console.log('[run-demo]✅ 配置验证通过');
        }

        setDependencies(deps);

        console.log('Creating CodeIndexManager with dependencies:', {
          hasFileSystem: !!deps.fileSystem,
          hasStorage: !!deps.storage,
          hasEventBus: !!deps.eventBus,
          hasWorkspace: !!deps.workspace,
          hasPathUtils: !!deps.pathUtils,
          hasConfigProvider: !!deps.configProvider,
          workspaceRootPath: deps.workspace.getRootPath()
        });

        const manager = CodeIndexManager.getInstance(deps);
        console.log('CodeIndexManager instance created:', !!manager);

        if (!manager) {
          setError('Failed to create CodeIndexManager - workspace root path may be invalid');
          return;
        }

        console.log('[run-demo]⚙️ 初始化 CodeIndexManager...');
        const initResult = await manager.initialize();
        console.log('[run-demo]✅ CodeIndexManager 初始化成功:', initResult);
        console.log('[run-demo]📝 管理器状态:', {
          isInitialized: manager.isInitialized,
          isFeatureEnabled: manager.isFeatureEnabled,
          isFeatureConfigured: manager.isFeatureConfigured,
          state: manager.state
        });
        console.log('[run-demo]🔄 设置 CodeIndexManager 到状态中...');
        setCodeIndexManager(manager);
        console.log('[run-demo]✅ CodeIndexManager 已设置到状态');

        // Start indexing in background
        console.log('[run-demo]🚀 准备开始索引...');
        // 设置进度监控
        manager.onProgressUpdate((progressInfo) => {
          console.log('[run-demo]📊 索引进度:', progressInfo);
        });

        setTimeout(() => {
          if (manager.isFeatureEnabled && manager.isInitialized) {
            console.log('[run-demo]🚀 开始索引进程...');
            console.log('[run-demo]📊 当前状态:', manager.state);

            // 添加超时保护
            const indexingTimeout = setTimeout(() => {
              console.warn('[run-demo]⚠️ 索引进程超时（30秒），可能卡住了');
            }, 30000);

            manager.startIndexing()
              .then(() => {
                clearTimeout(indexingTimeout);
                console.log('[run-demo]✅ 索引完成');
              })
              .catch((err: any) => {
                clearTimeout(indexingTimeout);
                console.error('[run-demo]❌ 索引失败:', err);
                console.error('[run-demo]❌ 错误堆栈:', err.stack);
                setError(`Indexing failed: ${err.message}`);
              });
          } else {
            console.log('[run-demo]⚠️ 跳过索引 - 功能未启用或未初始化');
            console.log('[run-demo]📊 功能状态:', {
              isFeatureEnabled: manager.isFeatureEnabled,
              isInitialized: manager.isInitialized,
              state: manager.state
            });
          }
        }, 1000);
        console.log('[run-demo]✅ 初始化完成');

      } catch (err: any) {
        console.error('[run-demo]❌ 初始化失败:', err);
        console.error('[run-demo]❌ 错误堆栈:', err.stack);
        setError(`Initialization failed: ${err.message}`);
      }
    }

    initialize();
  }, []);

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="red">❌ 初始化失败</Text>
        <Text color="white">{error}</Text>
        <Text color="gray">请检查配置或服务连接状态</Text>
      </Box>
    );
  }

  return <App codeIndexManager={codeIndexManager} dependencies={dependencies} />;
};


if (import.meta.url === `file://${process.argv[1]}`) {
  render(<AppWithData />);
}

export default AppWithData;
