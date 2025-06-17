/**
 * Factory for creating VSCode adapters
 * This file handles optional VSCode dependency gracefully
 */

import type { 
  IFileSystem, 
  IStorage, 
  IEventBus, 
  IWorkspace, 
  IConfigProvider, 
  ILogger,
  IFileWatcher
} from '../../abstractions'

export interface VSCodeAdapters {
  fileSystem: IFileSystem
  storage: IStorage
  eventBus: IEventBus
  workspace: IWorkspace
  configProvider: IConfigProvider
  logger: ILogger
  fileWatcher: IFileWatcher
}

/**
 * Creates VSCode adapters if VSCode is available
 * @param context VSCode extension context
 * @returns Adapter implementations or throws if VSCode not available
 */
export function createVSCodeAdapters(context: any): VSCodeAdapters {
  try {
    // Dynamically import VSCode adapters
    const { VSCodeFileSystem } = require('./file-system')
    const { VSCodeStorage } = require('./storage') 
    const { VSCodeEventBus } = require('./event-bus')
    const { VSCodeWorkspace } = require('./workspace')
    const { VSCodeConfigProvider } = require('./config')
    const { VSCodeLogger } = require('./logger')
    const { VSCodeFileWatcher } = require('./file-watcher')

    return {
      fileSystem: new VSCodeFileSystem(),
      storage: new VSCodeStorage(context),
      eventBus: new VSCodeEventBus(),
      workspace: new VSCodeWorkspace(),
      configProvider: new VSCodeConfigProvider(),
      logger: new VSCodeLogger('codebase'),
      fileWatcher: new VSCodeFileWatcher()
    }
  } catch (error) {
    throw new Error('VSCode adapters are not available. Make sure this code is running in a VSCode extension context and vscode module is installed.')
  }
}

/**
 * Check if VSCode adapters are available
 */
export function isVSCodeAvailable(): boolean {
  try {
    require('vscode')
    return true
  } catch {
    return false
  }
}