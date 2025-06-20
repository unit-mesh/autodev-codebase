#!/usr/bin/env node

/**
 * Demo script to monitor a local demo folder and index code using Ollama embeddings with Qdrant
 * This script demonstrates how to use the codebase library in a Node.js environment
 * with Ollama for embeddings and Qdrant for vector storage.
 */

import * as path from 'path'
import { fileURLToPath } from 'url'
import { createNodeDependencies } from '../adapters/nodejs'
import { CodeIndexManager } from '../code-index/manager'

// Configuration
const DEMO_FOLDER = path.join(process.cwd(), 'demo')
const OLLAMA_BASE_URL = 'http://localhost:11434'
const QDRANT_URL = 'http://localhost:6333'
const OLLAMA_MODEL = 'nomic-embed-text'  // Default embedding model for Ollama

async function main() {
  console.log('🚀 Starting Autodev Codebase Demo')
  console.log('📁 Demo folder:', DEMO_FOLDER)
  console.log('🤖 Ollama URL:', OLLAMA_BASE_URL)
  console.log('🔍 Qdrant URL:', QDRANT_URL)
  console.log('📊 Embedding Model:', OLLAMA_MODEL)
  console.log('=' .repeat(50))

  try {
    // 1. Create Node.js dependencies
    const dependencies = createNodeDependencies({
      workspacePath: DEMO_FOLDER,
      storageOptions: {
        globalStoragePath: path.join(process.cwd(), '.autodev-storage'),
        cacheBasePath: path.join(process.cwd(), '.autodev-cache')
      },
      loggerOptions: {
        name: 'Demo-Codebase',
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
    })

    // 2. Check if demo folder exists, create if not
    const demoFolderExists = await dependencies.fileSystem.exists(DEMO_FOLDER)
    if (!demoFolderExists) {
      console.log('📁 Creating demo folder...')
      // Create directory using Node.js mkdir since IFileSystem doesn't have createDirectory
      const fs = require('fs')
      fs.mkdirSync(DEMO_FOLDER, { recursive: true })

      // Create some sample files for demonstration
      await createSampleFiles(dependencies.fileSystem, DEMO_FOLDER)
    }

    // 3. Initialize configuration
    console.log('⚙️  Initializing configuration...')
    await dependencies.configProvider.loadConfig()

    // Validate configuration
    const validation = await dependencies.configProvider.validateConfig()
    if (!validation.isValid) {
      console.error('❌ Configuration validation failed:')
      validation.errors.forEach(error => console.error('  -', error))
      return
    }
    console.log('✅ Configuration valid')

    // 4. Create and initialize CodeIndexManager
    console.log('🏗️  Creating CodeIndexManager...')
    const codeIndexManager = CodeIndexManager.getInstance(dependencies)

    if (!codeIndexManager) {
      console.error('❌ Failed to create CodeIndexManager')
      return
    }

    // 5. Initialize the manager
    console.log('🔧 Initializing CodeIndexManager...')
    const { requiresRestart } = await codeIndexManager.initialize()

    if (requiresRestart) {
      console.log('🔄 Manager restart required')
    }

    // 6. Start monitoring for progress updates
    console.log('👀 Setting up progress monitoring...')
    const unsubscribeProgress = codeIndexManager.onProgressUpdate((progress) => {
      console.log(`📊 Progress: ${progress.systemStatus} - ${progress.message}`)
    })

    // 7. Start indexing
    console.log('🚀 Starting code indexing...')
    await codeIndexManager.startIndexing()

    // 8. Wait for indexing to complete
    console.log('⏳ Waiting for indexing to complete...')
    await waitForIndexingToComplete(codeIndexManager)

    // 9. Demonstrate search functionality
    console.log('🔍 Testing search functionality...')
    await demonstrateSearch(codeIndexManager)

    // 10. Show final status
    console.log('📈 Final Status Check...')
    const finalStatus = codeIndexManager.getCurrentStatus()
    console.log(`📊 System Status: ${finalStatus.systemStatus}`)
    console.log(`📦 Status Message: ${finalStatus.message}`)
    console.log(`🕒 Last Update: ${new Date().toLocaleTimeString()}`)

    // Clean up
    console.log('🧹 Cleaning up...')
    unsubscribeProgress()
    codeIndexManager.dispose()

    console.log('✅ Demo completed successfully!')
    console.log('Note: The codebase indexing system is working correctly.')
    console.log('For live file monitoring, the demo can be extended to run continuously.')

  } catch (error) {
    console.error('❌ Error in demo:', error)
    process.exit(1)
  }
}

async function createSampleFiles(fileSystem: any, demoFolder: string) {
  console.log('📝 Creating sample files...')

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
  ]

  for (const file of sampleFiles) {
    const filePath = path.join(demoFolder, file.path)
    const content = new TextEncoder().encode(file.content)
    await fileSystem.writeFile(filePath, content)
    console.log(`  ✅ Created: ${file.path}`)
  }
}

async function waitForIndexingToComplete(codeIndexManager: any) {
  return new Promise<void>((resolve) => {
    let checkCount = 0
    const maxChecks = 30 // Maximum 60 seconds

    const checkStatus = () => {
      const state = codeIndexManager.state
      console.log(`📊 Current state: ${state} (check ${checkCount + 1}/${maxChecks})`)

      checkCount++

      if (state === 'Standby' || state === 'Watching' || state === 'Indexed') {
        console.log('✅ Indexing completed')
        resolve()
      } else if (checkCount >= maxChecks) {
        console.log('⏰ Timeout waiting for indexing completion')
        resolve()
      } else {
        setTimeout(checkStatus, 2000) // Check every 2 seconds
      }
    }

    checkStatus()
  })
}

async function demonstrateSearch(codeIndexManager: any) {
  const searchQueries = [
    'greet user function',
    'process data',
    'user management',
    'batch processing',
    'configuration settings'
  ]

  for (const query of searchQueries) {
    console.log(`\n🔍 Searching for: "${query}"`)
    try {
      const results = await codeIndexManager.searchIndex(query, 3)

      if (results.length === 0) {
        console.log('  No results found')
      } else {
        results.forEach((result: any, index: number) => {
          console.log(`  ${index + 1}. ${result.payload?.filePath || 'Unknown file'}`)
          console.log(`     Score: ${result.score.toFixed(3)}`)
          console.log(`     Lines: ${result.payload?.startLine}-${result.payload?.endLine}`)
          console.log(`     Preview: ${(result.payload?.codeChunk || '').substring(0, 100)}...`)
        })
      }
    } catch (error) {
      console.error(`  Error searching for "${query}":`, error)
    }
  }
}


const __filename = fileURLToPath(import.meta.url)
if (process.argv[1] === __filename) {
  main().catch(console.error)
}
export { main as runDemo }
