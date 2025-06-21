import * as vscode from 'vscode'
import { IFileWatcher, FileWatchEvent } from '../../abstractions/core'

/**
 * VSCode file watcher adapter implementing IFileWatcher interface
 */
export class VSCodeFileWatcher implements IFileWatcher {
  private readonly watchers = new Set<vscode.FileSystemWatcher>()

  watchFile(uri: string, callback: (event: FileWatchEvent) => void): () => void {
    const pattern = new vscode.RelativePattern(vscode.Uri.parse(uri).fsPath, '*')
    const watcher = vscode.workspace.createFileSystemWatcher(pattern)

    const disposables = [
      watcher.onDidCreate((vscodeUri) => {
        callback({
          type: 'created',
          uri: vscodeUri.toString()
        })
      }),
      watcher.onDidChange((vscodeUri) => {
        callback({
          type: 'changed',
          uri: vscodeUri.toString()
        })
      }),
      watcher.onDidDelete((vscodeUri) => {
        callback({
          type: 'deleted',
          uri: vscodeUri.toString()
        })
      })
    ]

    this.watchers.add(watcher)

    return () => {
      this.watchers.delete(watcher)
      disposables.forEach(d => d.dispose())
      watcher.dispose()
    }
  }

  watchDirectory(uri: string, callback: (event: FileWatchEvent) => void): () => void {
    const pattern = new vscode.RelativePattern(vscode.Uri.parse(uri).fsPath, '**/*')
    const watcher = vscode.workspace.createFileSystemWatcher(pattern)

    const disposables = [
      watcher.onDidCreate((vscodeUri) => {
        callback({
          type: 'created',
          uri: vscodeUri.toString()
        })
      }),
      watcher.onDidChange((vscodeUri) => {
        callback({
          type: 'changed',
          uri: vscodeUri.toString()
        })
      }),
      watcher.onDidDelete((vscodeUri) => {
        callback({
          type: 'deleted',
          uri: vscodeUri.toString()
        })
      })
    ]

    this.watchers.add(watcher)

    return () => {
      this.watchers.delete(watcher)
      disposables.forEach(d => d.dispose())
      watcher.dispose()
    }
  }

  /**
   * Dispose all watchers
   */
  dispose(): void {
    this.watchers.forEach(watcher => watcher.dispose())
    this.watchers.clear()
  }
}