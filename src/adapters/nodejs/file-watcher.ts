/**
 * Node.js File Watcher Adapter
 * Implements IFileWatcher using Node.js fs.watch API
 */
import { watch, FSWatcher } from 'fs'
import { IFileWatcher, FileWatchEvent } from '../../abstractions/core'

export class NodeFileWatcher implements IFileWatcher {
  private watchers = new Map<string, FSWatcher>()

  watchFile(uri: string, callback: (event: FileWatchEvent) => void): () => void {
    try {
      const watcher = watch(uri, (eventType, filename) => {
        const event: FileWatchEvent = {
          type: this.mapEventType(eventType),
          uri: filename ? uri : uri
        }
        callback(event)
      })

      const watchKey = `file:${uri}`
      this.watchers.set(watchKey, watcher)

      // Return cleanup function
      return () => {
        watcher.close()
        this.watchers.delete(watchKey)
      }
    } catch (error) {
      throw new Error(`Failed to watch file ${uri}: ${error}`)
    }
  }

  watchDirectory(uri: string, callback: (event: FileWatchEvent) => void): () => void {
    try {
      const watcher = watch(uri, { recursive: true }, (eventType, filename) => {
        if (filename) {
          const event: FileWatchEvent = {
            type: this.mapEventType(eventType),
            uri: `${uri}/${filename}`
          }
          callback(event)
        }
      })

      const watchKey = `dir:${uri}`
      this.watchers.set(watchKey, watcher)

      // Return cleanup function
      return () => {
        watcher.close()
        this.watchers.delete(watchKey)
      }
    } catch (error) {
      throw new Error(`Failed to watch directory ${uri}: ${error}`)
    }
  }

  /**
   * Clean up all watchers
   */
  dispose(): void {
    for (const watcher of Array.from(this.watchers.values())) {
      watcher.close()
    }
    this.watchers.clear()
  }

  /**
   * Get the number of active watchers for debugging
   */
  getWatcherCount(): number {
    return this.watchers.size
  }

  private mapEventType(eventType: string): 'created' | 'changed' | 'deleted' {
    switch (eventType) {
      case 'rename':
        // In Node.js, 'rename' can mean created or deleted
        // We'll default to 'changed' as it's the safest assumption
        return 'changed'
      case 'change':
        return 'changed'
      default:
        return 'changed'
    }
  }
}