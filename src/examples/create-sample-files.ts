import * as path from 'path';
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
export default createSampleFiles;