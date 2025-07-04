/**
 * Node.js Storage Adapter
 * Implements IStorage using file system for cache management
 */
import * as path from 'path'
import * as os from 'os'
import { IStorage } from '../../abstractions/core'

// 🎯 DEFAULT CACHE LOCATION - Change this line to modify cache location globally
const DEFAULT_CACHE_BASE = path.join(os.homedir(), '.autodev-cache')  // Change to your preferred default location

export interface NodeStorageOptions {
  globalStoragePath?: string
  cacheBasePath?: string
}

export class NodeStorage implements IStorage {
  private globalStoragePath: string
  private cacheBasePath: string

  constructor(options: NodeStorageOptions = {}) {
    this.globalStoragePath = options.globalStoragePath || path.join(os.homedir(), '.autodev', 'codebase')
    this.cacheBasePath = options.cacheBasePath || DEFAULT_CACHE_BASE
  }

  getGlobalStorageUri(): string {
    return this.globalStoragePath
  }

  createCachePath(workspacePath: string): string {
    // Create a safe cache path based on workspace path
    const workspaceHash = this.hashWorkspacePath(workspacePath)
    return path.join(this.cacheBasePath, 'workspaces', workspaceHash)
  }

  getCacheBasePath(): string {
    return this.cacheBasePath
  }

  private hashWorkspacePath(workspacePath: string): string {
    // Simple hash function to create unique directory names
    // Replace this with a proper hash function if needed
    return workspacePath
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 100) + '_' + this.simpleHash(workspacePath)
  }

  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16)
  }
}