/**
 * VSCode adapters for platform-specific implementations
 * 
 * These adapters implement the core abstractions using VSCode APIs,
 * allowing the codebase library to work within VSCode extensions.
 */

export { VSCodeFileSystem } from './file-system'
export { VSCodeStorage } from './storage'
export { VSCodeEventBus } from './event-bus'
export { VSCodeWorkspace, NodePathUtils } from './workspace'
export { VSCodeConfigProvider } from './config'
export { VSCodeLogger } from './logger'
export { VSCodeFileWatcher } from './file-watcher'

// Re-export types for convenience
export type {
  IFileSystem,
  IStorage,
  IEventBus,
  ILogger,
  IFileWatcher,
  IPlatformDependencies
} from '../../abstractions/core'

export type {
  IWorkspace,
  IPathUtils,
  WorkspaceFolder
} from '../../abstractions/workspace'

export type {
  IConfigProvider,
  EmbedderConfig,
  VectorStoreConfig,
  SearchConfig,
  CodeIndexConfig,
  ConfigSnapshot
} from '../../abstractions/config'