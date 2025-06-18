# Codebase Library - Development Context

## Project Overview

This is a platform-agnostic code analysis library extracted from the roo-code VSCode plugin. The goal is to create a standalone, cross-platform library that can be integrated into various development tools and environments.

## Architecture

The project follows a layered architecture with dependency injection:

```
Application Layer    (VSCode Plugin / Node.js App)
     ↓
Adapter Layer       (Platform-specific implementations)
     ↓
Core Library        (Platform-agnostic business logic)
```

## Key Abstractions

### Core Interfaces (`src/abstractions/`)
- **IFileSystem** - File operations (readFile, writeFile, exists)
- **IStorage** - Cache and storage management
- **IEventBus** - Event emission and subscription
- **IWorkspace** - Workspace and path utilities
- **IConfigProvider** - Configuration management
- **ILogger** - Logging abstraction
- **IFileWatcher** - File system monitoring

### Platform Adapters
- **VSCode Adapters** (`src/adapters/vscode/`) - VSCode API implementations
- **Node.js Adapters** (`src/examples/nodejs-usage.ts`) - Node.js implementations

## Core Components

### Code Index System
- **CodeIndexManager** (`src/code-index/manager.ts`) - Main entry point and orchestrator
- **CacheManager** (`src/code-index/cache-manager.ts`) - Vector embedding cache management
- **StateManager** (`src/code-index/state-manager.ts`) - Progress and state tracking
- **DirectoryScanner** (`src/code-index/processors/scanner.ts`) - File discovery and indexing
- **FileWatcher** (`src/code-index/processors/file-watcher.ts`) - File system change monitoring

### Supporting Systems
- **Tree-sitter Parser** (`src/tree-sitter/`) - Code parsing and definition extraction
- **Glob File Listing** (`src/glob/list-files.ts`) - Pattern-based file discovery
- **Search Tools** (`src/codebaseSearchTool.ts`) - Advanced code search capabilities

## Development Guidelines

### Testing
- Run tests: `npm test`
- Integration tests verify cross-platform compatibility
- Mock implementations for all external dependencies

### Building
- Build library: `npm run build`
- Generates both ESM and CommonJS outputs
- TypeScript declarations included
- VSCode dependency is optional (peer dependency)

### Code Style
- TypeScript strict mode
- Dependency injection pattern throughout
- Interface-based abstractions
- Platform-agnostic core logic

## Usage Examples

### VSCode Integration
```typescript
import { CodeIndexManager } from '@autodev/codebase'
import { VSCodeAdapters } from '@autodev/codebase/adapters/vscode'

const manager = new CodeIndexManager({
  fileSystem: new VSCodeAdapters.FileSystem(),
  storage: new VSCodeAdapters.Storage(context),
  eventBus: new VSCodeAdapters.EventBus(),
  workspace: new VSCodeAdapters.Workspace(),
  config: new VSCodeAdapters.ConfigProvider()
})
```

### Node.js Usage
```typescript
import { createNodeJSCodebase } from '@autodev/codebase/examples/nodejs-usage'

const codebase = createNodeJSCodebase('/path/to/project')
await codebase.initialize()
```

## Project Status

✅ **Completed Phases:**
- Day 1-2: Core abstractions and VSCode adapters
- Day 3-4: CacheManager decoupling
- Day 5: Event system abstraction
- Day 6: Configuration and workspace abstraction
- Day 7: External dependency removal
- Day 8: Build configuration
- Day 9: Usage examples and integration tests

The library is now platform-agnostic and ready for distribution as a standalone package.

## Key Files to Understand

- `src/index.ts` - Main library exports
- `src/abstractions/index.ts` - Core interface definitions
- `src/code-index/manager.ts` - Primary API entry point
- `src/adapters/vscode/index.ts` - VSCode integration layer
- `examples/nodejs-usage.ts` - Node.js integration examples

## Commands

### Development
- `npm run dev` - Watch mode development
- `npm run build` - Production build
- `npm run type-check` - TypeScript validation
- `npm run test` - Vitest validation

### Testing
- `npm test` - Run all tests
- Tests include unit tests and integration tests for cross-platform compatibility

## Notes for AI Assistants

1. **Dependency Injection**: All core components use dependency injection - never directly import platform-specific modules
2. **Interface First**: Always program against interfaces (I*) rather than concrete implementations
3. **Platform Agnostic**: Core library code should work in any JavaScript environment
4. **Optional VSCode**: VSCode is a peer dependency - the library works without it
5. **Testing Strategy**: Use mock implementations of interfaces for testing
6. **Build Target**: Library supports both ESM and CommonJS for maximum compatibility

This codebase demonstrates enterprise-level abstraction patterns and clean architecture principles for creating truly portable JavaScript libraries.
