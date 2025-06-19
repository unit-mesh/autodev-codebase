import * as vscode from 'vscode'
import * as path from 'path'
import { IWorkspace, WorkspaceFolder, IPathUtils } from '../../abstractions/workspace'

/**
 * VSCode workspace adapter implementing IWorkspace interface
 */
export class VSCodeWorkspace implements IWorkspace {
  constructor(
    private readonly workspace: typeof vscode.workspace = vscode.workspace,
    private readonly pathUtils: IPathUtils = new NodePathUtils()
  ) {}

  getRootPath(): string | undefined {
    const workspaceFolders = this.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined
    }
    return workspaceFolders[0].uri.fsPath
  }

  getRelativePath(fullPath: string): string {
    const rootPath = this.getRootPath()
    if (!rootPath) {
      return fullPath
    }
    return this.pathUtils.relative(rootPath, fullPath)
  }

  getIgnoreRules(): string[] {
    // TODO: Implement .gitignore and .rooignore parsing
    // For now, return basic ignore patterns
    return [
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      '*.log',
      '.DS_Store',
      'Thumbs.db'
    ]
  }

  async shouldIgnore(path: string): Promise<boolean> {
    const ignoreRules = this.getIgnoreRules()
    const relativePath = this.getRelativePath(path)
    
    // Simple pattern matching - could be enhanced with minimatch
    return ignoreRules.some(rule => {
      const pattern = rule.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
      const regex = new RegExp(`^${pattern}$`)
      return regex.test(relativePath)
    })
  }

  getName(): string {
    const workspaceFolders = this.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return 'Untitled Workspace'
    }
    return workspaceFolders[0].name
  }

  getWorkspaceFolders(): WorkspaceFolder[] {
    const workspaceFolders = this.workspace.workspaceFolders
    if (!workspaceFolders) {
      return []
    }
    
    return workspaceFolders.map((folder, index) => ({
      name: folder.name,
      uri: folder.uri.toString(),
      index
    }))
  }

  async findFiles(pattern: string, exclude?: string): Promise<string[]> {
    try {
      const files = await this.workspace.findFiles(pattern, exclude)
      return files.map(uri => uri.fsPath)
    } catch (error) {
      throw new Error(`Failed to find files with pattern ${pattern}: ${error}`)
    }
  }
}

/**
 * Node.js path utilities implementation
 */
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