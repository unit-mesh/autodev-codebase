/**
 * Core abstractions for platform-agnostic file system operations
 */
export interface IFileSystem {
  readFile(uri: string): Promise<Uint8Array>
  writeFile(uri: string, content: Uint8Array): Promise<void>
  exists(uri: string): Promise<boolean>
  stat(uri: string): Promise<{ isFile: boolean; isDirectory: boolean; size: number; mtime: number }>
  readdir(uri: string): Promise<string[]>
  mkdir(uri: string): Promise<void>
  delete(uri: string): Promise<void>
}

/**
 * Core abstractions for platform-agnostic storage operations
 */
export interface IStorage {
  getGlobalStorageUri(): string
  createCachePath(workspacePath: string): string
  getCacheBasePath(): string
}

/**
 * Core abstractions for platform-agnostic event system
 */
export interface IEventBus<T = any> {
  emit(event: string, data: T): void
  on(event: string, handler: (data: T) => void): () => void
  off(event: string, handler: (data: T) => void): void
  once(event: string, handler: (data: T) => void): () => void
}

/**
 * Core abstractions for logging
 */
export interface ILogger {
  debug(message: string, ...args: any[]): void
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
}

/**
 * File system watcher abstraction
 */
export interface IFileWatcher {
  watchFile(uri: string, callback: (event: FileWatchEvent) => void): () => void
  watchDirectory(uri: string, callback: (event: FileWatchEvent) => void): () => void
}

export interface FileWatchEvent {
  type: 'created' | 'changed' | 'deleted'
  uri: string
}

/**
 * Core platform dependencies container
 */
export interface IPlatformDependencies {
  fileSystem: IFileSystem
  storage: IStorage
  eventBus: IEventBus
  logger?: ILogger
  fileWatcher?: IFileWatcher
}