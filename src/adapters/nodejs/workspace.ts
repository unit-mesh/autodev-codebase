/**
 * Node.js Workspace Adapter
 * Implements IWorkspace using Node.js file system operations
 */
import * as path from 'path'
import { promises as fs } from 'fs'
import { IWorkspace, WorkspaceFolder, IPathUtils } from '../../abstractions/workspace'
import { IFileSystem } from '../../abstractions/core'

export interface NodeWorkspaceOptions {
  rootPath: string
  ignoreFiles?: string[]
}

export class NodeWorkspace implements IWorkspace {
  private rootPath: string
  private ignoreFiles: string[]
  private ignoreRules: string[] = []
  private ignoreRulesLoaded = false

  constructor(private fileSystem: IFileSystem, options: NodeWorkspaceOptions) {
    this.rootPath = options.rootPath
    this.ignoreFiles = options.ignoreFiles || ['.gitignore', '.rooignore', '.codebaseignore']
  }

  getRootPath(): string | undefined {
    return this.rootPath
  }

  getRelativePath(fullPath: string): string {
    if (!this.rootPath) return fullPath
    return path.relative(this.rootPath, fullPath)
  }

  getIgnoreRules(): string[] {
    return this.ignoreRules
  }

  async shouldIgnore(filePath: string): Promise<boolean> {
    await this.loadIgnoreRules()
    
    const relativePath = this.getRelativePath(filePath)
    
    // Basic ignore patterns
    const defaultIgnores = [
      'node_modules',
      '.git',
      '.svn',
      '.hg',
      'dist',
      'build',
      'coverage',
      '*.log',
      '.env',
      '.env.local',
      '.DS_Store',
      'Thumbs.db'
    ]

    const allIgnores = [...defaultIgnores, ...this.ignoreRules]
    
    return allIgnores.some(pattern => {
      return this.matchPattern(relativePath, pattern)
    })
  }

  getName(): string {
    return path.basename(this.rootPath) || 'workspace'
  }

  getWorkspaceFolders(): WorkspaceFolder[] {
    return [{
      name: this.getName(),
      uri: this.rootPath,
      index: 0
    }]
  }

  async findFiles(pattern: string, exclude?: string): Promise<string[]> {
    const files: string[] = []
    
    await this.walkDirectory(this.rootPath, async (filePath) => {
      const relativePath = this.getRelativePath(filePath)
      
      if (this.matchPattern(relativePath, pattern)) {
        if (!exclude || !this.matchPattern(relativePath, exclude)) {
          if (!(await this.shouldIgnore(filePath))) {
            files.push(filePath)
          }
        }
      }
    })
    
    return files
  }

  private async loadIgnoreRules(): Promise<void> {
    if (this.ignoreRulesLoaded) return

    this.ignoreRules = []
    
    for (const ignoreFile of this.ignoreFiles) {
      const ignoreFilePath = path.join(this.rootPath, ignoreFile)
      
      try {
        if (await this.fileSystem.exists(ignoreFilePath)) {
          const content = await this.fileSystem.readFile(ignoreFilePath)
          const text = new TextDecoder().decode(content)
          const rules = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
          
          this.ignoreRules.push(...rules)
        }
      } catch (error) {
        // Ignore errors when reading ignore files
        console.warn(`Failed to read ignore file ${ignoreFilePath}:`, error)
      }
    }
    
    this.ignoreRulesLoaded = true
  }

  private matchPattern(filePath: string, pattern: string): boolean {
    // Simple glob pattern matching
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    
    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(filePath) || regex.test(path.basename(filePath))
  }

  private async walkDirectory(dir: string, callback: (filePath: string) => Promise<void>): Promise<void> {
    try {
      const entries = await this.fileSystem.readdir(dir)
      
      for (const entry of entries) {
        const stat = await this.fileSystem.stat(entry)
        
        if (stat.isDirectory) {
          await this.walkDirectory(entry, callback)
        } else if (stat.isFile) {
          await callback(entry)
        }
      }
    } catch (error) {
      // Ignore errors when walking directories
      console.warn(`Failed to walk directory ${dir}:`, error)
    }
  }
}

export class NodePathUtils implements IPathUtils {
  join(...paths: string[]): string {
    return path.join(...paths)
  }

  dirname(filePath: string): string {
    return path.dirname(filePath)
  }

  basename(filePath: string, ext?: string): string {
    return path.basename(filePath, ext)
  }

  extname(filePath: string): string {
    return path.extname(filePath)
  }

  resolve(...paths: string[]): string {
    return path.resolve(...paths)
  }

  isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath)
  }

  relative(from: string, to: string): string {
    return path.relative(from, to)
  }

  normalize(filePath: string): string {
    return path.normalize(filePath)
  }
}