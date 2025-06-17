import * as vscode from 'vscode'
import * as path from 'path'
import { IStorage } from '../../abstractions/core'

/**
 * VSCode storage adapter implementing IStorage interface
 */
export class VSCodeStorage implements IStorage {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getGlobalStorageUri(): string {
    return this.context.globalStorageUri.fsPath
  }

  createCachePath(workspacePath: string): string {
    // Create a unique cache path based on workspace path
    const workspaceHash = this.hashString(workspacePath)
    const cachePath = path.join(this.getGlobalStorageUri(), 'codebase-cache', workspaceHash)
    return cachePath
  }

  getCacheBasePath(): string {
    return path.join(this.getGlobalStorageUri(), 'codebase-cache')
  }

  /**
   * Create a simple hash of a string for cache directory naming
   */
  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }
}