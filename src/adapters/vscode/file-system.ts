import * as vscode from 'vscode'
import { IFileSystem } from '../../abstractions/core'

/**
 * VSCode file system adapter implementing IFileSystem interface
 */
export class VSCodeFileSystem implements IFileSystem {
  constructor(private readonly fs = vscode.workspace.fs) {}

  async readFile(uri: string): Promise<Uint8Array> {
    try {
      return await this.fs.readFile(vscode.Uri.parse(uri))
    } catch (error) {
      throw new Error(`Failed to read file ${uri}: ${error}`)
    }
  }

  async writeFile(uri: string, content: Uint8Array): Promise<void> {
    try {
      await this.fs.writeFile(vscode.Uri.parse(uri), content)
    } catch (error) {
      throw new Error(`Failed to write file ${uri}: ${error}`)
    }
  }

  async exists(uri: string): Promise<boolean> {
    try {
      await this.fs.stat(vscode.Uri.parse(uri))
      return true
    } catch {
      return false
    }
  }

  async stat(uri: string): Promise<{ isFile: boolean; isDirectory: boolean; size: number; mtime: number }> {
    try {
      const stat = await this.fs.stat(vscode.Uri.parse(uri))
      return {
        isFile: stat.type === vscode.FileType.File,
        isDirectory: stat.type === vscode.FileType.Directory,
        size: stat.size,
        mtime: stat.mtime
      }
    } catch (error) {
      throw new Error(`Failed to stat ${uri}: ${error}`)
    }
  }

  async readdir(uri: string): Promise<string[]> {
    try {
      const entries = await this.fs.readDirectory(vscode.Uri.parse(uri))
      return entries.map(([name]) => name)
    } catch (error) {
      throw new Error(`Failed to read directory ${uri}: ${error}`)
    }
  }

  async mkdir(uri: string): Promise<void> {
    try {
      await this.fs.createDirectory(vscode.Uri.parse(uri))
    } catch (error) {
      throw new Error(`Failed to create directory ${uri}: ${error}`)
    }
  }

  async delete(uri: string): Promise<void> {
    try {
      await this.fs.delete(vscode.Uri.parse(uri), { recursive: true, useTrash: false })
    } catch (error) {
      throw new Error(`Failed to delete ${uri}: ${error}`)
    }
  }
}