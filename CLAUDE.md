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
- `npm run test` - Vitest validation, Temporarily not needed


## Notes for AI Assistants

1. **Dependency Injection**: All core components use dependency injection - never directly import platform-specific modules
2. **Interface First**: Always program against interfaces (I*) rather than concrete implementations
3. **Platform Agnostic**: Core library code should work in any JavaScript environment
4. **Optional VSCode**: VSCode is a peer dependency - the library works without it
5. **Testing Strategy**: Use mock implementations of interfaces for testing
6. **Build Target**: Library supports both ESM and CommonJS for maximum compatibility

This codebase demonstrates enterprise-level abstraction patterns and clean architecture principles for creating truly portable JavaScript libraries.

## TUI Debug Experience - CodeIndexManager Initialization Flow

### Critical Discovery: React State Synchronization Issues

During debugging of the TUI demo (`src/examples/run-demo-tui.tsx` + `src/examples/tui/App.tsx`), we discovered a critical React state synchronization issue that affects any React-based integration of the CodeIndexManager.

#### Problem Pattern
```typescript
// ❌ BROKEN: Initial state only
const [state, setState] = useState({
  codeIndexManager: initialManager  // Only sets once, never updates
});

// Later when parent updates codeIndexManager prop...
// Child component never receives the update!
```

#### Solution Pattern  
```typescript
// ✅ FIXED: Add useEffect to sync prop changes
useEffect(() => {
  setState(prev => ({ ...prev, codeIndexManager }));
}, [codeIndexManager]);
```

### CodeIndexManager Initialization Call Flow

**Critical Path Discovery:**
1. `createNodeDependencies()` → Creates platform adapters
2. `deps.configProvider.loadConfig()` → Loads configuration  
3. `deps.configProvider.validateConfig()` → **CRITICAL CHECKPOINT**
4. `CodeIndexManager.getInstance(deps)` → **REQUIRES: workspace.getRootPath()**
5. `manager.initialize()` → Initializes internal services
6. `manager.startIndexing()` → Triggers orchestrator

**Key Insight:** Step 4 silently fails if `workspace.getRootPath()` returns `undefined`, causing `getInstance()` to return `undefined` without error logging.

### Indexing Process Debugging Points

**Orchestrator Flow (`src/code-index/orchestrator.ts`):**
1. `vectorStore.initialize()` - Vector database connection
2. `cacheManager.clearCacheFile()` - Cache cleanup (if needed)  
3. `scanner.scanDirectory()` - File discovery and parsing
4. `_startWatcher()` - File change monitoring setup

**Common Hang Points:**
- Vector store connection timeout (Qdrant not running)
- Scanner getting stuck on large directories
- File watcher initialization failing

### React Component Debug Patterns

**For any React integration with CodeIndexManager:**

```typescript
// Always add debug logging in child components
console.log('Component received codeIndexManager:', {
  exists: !!codeIndexManager,
  type: typeof codeIndexManager,
  isInitialized: codeIndexManager?.isInitialized,
  isFeatureEnabled: codeIndexManager?.isFeatureEnabled,
  state: codeIndexManager?.state
});

// Always handle different initialization states
if (!codeIndexManager) {
  return <ErrorDisplay message="Manager not provided" />;
}
if (!codeIndexManager.isInitialized) {
  return <ErrorDisplay message="Manager not initialized" details={...} />;
}
```

### Configuration Validation Strategy

**Learned Pattern:** Configuration validation should be warning-based for development, not blocking:

```typescript
// ❌ Blocks development when services are down
if (!validation.isValid) {
  throw new Error(`Validation failed: ${errors}`);
}

// ✅ Allows development with warnings
if (!validation.isValid) {
  console.warn('Config validation warnings:', errors);
  // Continue with reduced functionality
}
```

### Debugging Commands for Future Reference

```bash
# Always run type check after React state changes
npm run type-check

# For TUI debugging, look for these console patterns:
# "🚀 开始索引进程..." → "✨ 索引进程全部完成!"
# Any gap indicates hang point in orchestrator
```

This debugging experience revealed critical React integration patterns that apply to any UI framework integration with CodeIndexManager.
