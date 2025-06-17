/**
 * Platform-agnostic abstractions for the codebase library
 * 
 * This module exports all the core abstractions that allow the codebase library
 * to work across different platforms (VSCode, Node.js, Web, etc.) without
 * being tightly coupled to any specific platform implementation.
 */

// Core platform abstractions
export type {
  IFileSystem,
  IStorage,
  IEventBus,
  ILogger,
  IFileWatcher,
  FileWatchEvent,
  IPlatformDependencies
} from './core'

// Workspace-related abstractions
export type {
  IWorkspace,
  IPathUtils,
  WorkspaceFolder
} from './workspace'

// Configuration abstractions
export type {
  IConfigProvider,
  EmbedderConfig,
  VectorStoreConfig,
  SearchConfig,
  CodeIndexConfig,
  ConfigSnapshot
} from './config'