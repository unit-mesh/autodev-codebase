#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createNodeDependencies } from '../adapters/nodejs';
import { CodeIndexManager } from '../code-index/manager';
import { App } from './tui/App';

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
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function initialize() {
      try {
        const dependencies = createNodeDependencies({
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

        const demoFolderExists = await dependencies.fileSystem.exists(DEMO_FOLDER);
        if (!demoFolderExists) {
          const fs = require('fs');
          fs.mkdirSync(DEMO_FOLDER, { recursive: true });
          await createSampleFiles(dependencies.fileSystem, DEMO_FOLDER);
        }

        await dependencies.configProvider.loadConfig();
        const validation = await dependencies.configProvider.validateConfig();

        if (!validation.isValid) {
          setError(`Configuration validation failed: ${validation.errors.join(', ')}`);
          return;
        }

        const manager = CodeIndexManager.getInstance(dependencies);
        if (!manager) {
          setError('Failed to create CodeIndexManager');
          return;
        }

        await manager.initialize();
        setCodeIndexManager(manager);

        // Start indexing in background
        setTimeout(() => {
          manager.startIndexing().catch((err: any) => {
            setError(`Indexing failed: ${err.message}`);
          });
        }, 1000);

      } catch (err: any) {
        setError(`Initialization failed: ${err.message}`);
      }
    }

    initialize();
  }, []);

  if (error) {
    return (
      <App codeIndexManager={null} />
    );
  }

  return <App codeIndexManager={codeIndexManager} />;
};


if (import.meta.url === `file://${process.argv[1]}`) {
  render(<AppWithData />);
}

export default AppWithData;
