import ignore, { Ignore } from "ignore"
import { IFileWatcher, FileWatchEvent, IFileSystem } from "../abstractions/core"
import { IWorkspace, IPathUtils } from "../abstractions/workspace"

export const LOCK_TEXT_SYMBOL = "\u{1F512}"

/**
 * Controls LLM access to files by enforcing ignore patterns.
 * Designed to be instantiated once in Cline.ts and passed to file manipulation services.
 * Uses the 'ignore' library to support standard .gitignore syntax in .rooignore files.
 */
export class RooIgnoreController {
	private ignoreInstance: Ignore
	private cleanupFunctions: (() => void)[] = []
	private fileWatcher?: IFileWatcher
	private fileSystem: IFileSystem
	private workspace: IWorkspace
	private pathUtils: IPathUtils
	rooIgnoreContent: string | undefined

	constructor(
		fileSystem: IFileSystem,
		workspace: IWorkspace,
		pathUtils: IPathUtils,
		fileWatcher?: IFileWatcher
	) {
		this.fileSystem = fileSystem
		this.workspace = workspace
		this.pathUtils = pathUtils
		this.ignoreInstance = ignore()
		this.rooIgnoreContent = undefined
		this.fileWatcher = fileWatcher
		// Set up file watcher for .rooignore if available
		if (this.fileWatcher) {
			this.setupFileWatcher()
		}
	}

	/**
	 * Initialize the controller by loading custom patterns
	 * Must be called after construction and before using the controller
	 */
	async initialize(): Promise<void> {
		await this.loadRooIgnore()
	}

	/**
	 * Set up the file watcher for .rooignore changes
	 */
	private setupFileWatcher(): void {
		if (!this.fileWatcher) {
			return
		}

		const rootPath = this.workspace.getRootPath()
		if (!rootPath) {
			return
		}

		const rooignorePath = this.pathUtils.join(rootPath, ".rooignore")

		// Watch for changes to the .rooignore file
		const cleanup = this.fileWatcher.watchFile(rooignorePath, (event: FileWatchEvent) => {
			// Reload .rooignore on any file system event
			this.loadRooIgnore()
		})

		this.cleanupFunctions.push(cleanup)
	}

	/**
	 * Load custom patterns from .rooignore if it exists
	 */
	private async loadRooIgnore(): Promise<void> {
		try {
			// Reset ignore instance to prevent duplicate patterns
			this.ignoreInstance = ignore()
			const rootPath = this.workspace.getRootPath()
			if (!rootPath) {
				this.rooIgnoreContent = undefined
				return
			}
			const ignorePath = this.pathUtils.join(rootPath, ".rooignore")
			try {
				const buffer = await this.fileSystem.readFile(ignorePath)
				const content = new TextDecoder().decode(buffer)
				this.rooIgnoreContent = content
				this.ignoreInstance.add(content)
				this.ignoreInstance.add(".rooignore")
			} catch (fileError) {
				// File doesn't exist or can't be read
				this.rooIgnoreContent = undefined
			}
		} catch (error) {
			// Should never happen: reading file failed even though it exists
			console.error("Unexpected error loading .rooignore:", error)
		}
	}

	/**
	 * Check if a file should be accessible to the LLM
	 * @param filePath - Path to check (can be absolute or relative)
	 * @returns true if file is accessible, false if ignored
	 */
	validateAccess(filePath: string): boolean {
		// Always allow access if .rooignore does not exist
		if (!this.rooIgnoreContent) {
			return true
		}
		try {
			// Get relative path using workspace abstraction
			const relativePath = this.workspace.getRelativePath(filePath)
			
			// Ignore expects paths to be relative and use forward slashes
			return !this.ignoreInstance.ignores(relativePath)
		} catch (error) {
			// console.error(`Error validating access for ${filePath}:`, error)
			// Ignore is designed to work with relative file paths, so will throw error for paths outside workspace. We are allowing access to all files outside workspace.
			return true
		}
	}

	/**
	 * Check if a terminal command should be allowed to execute based on file access patterns
	 * @param command - Terminal command to validate
	 * @returns path of file that is being accessed if it is being accessed, undefined if command is allowed
	 */
	validateCommand(command: string): string | undefined {
		// Always allow if no .rooignore exists
		if (!this.rooIgnoreContent) {
			return undefined
		}

		// Split command into parts and get the base command
		const parts = command.trim().split(/\s+/)
		const baseCommand = parts[0].toLowerCase()

		// Commands that read file contents
		const fileReadingCommands = [
			// Unix commands
			"cat",
			"less",
			"more",
			"head",
			"tail",
			"grep",
			"awk",
			"sed",
			// PowerShell commands and aliases
			"get-content",
			"gc",
			"type",
			"select-string",
			"sls",
		]

		if (fileReadingCommands.includes(baseCommand)) {
			// Check each argument that could be a file path
			for (let i = 1; i < parts.length; i++) {
				const arg = parts[i]
				// Skip command flags/options (both Unix and PowerShell style)
				if (arg.startsWith("-") || arg.startsWith("/")) {
					continue
				}
				// Ignore PowerShell parameter names
				if (arg.includes(":")) {
					continue
				}
				// Validate file access
				if (!this.validateAccess(arg)) {
					return arg
				}
			}
		}

		return undefined
	}

	/**
	 * Filter an array of paths, removing those that should be ignored
	 * @param paths - Array of paths to filter (relative to cwd)
	 * @returns Array of allowed paths
	 */
	filterPaths(paths: string[]): string[] {
		try {
			return paths
				.map((p) => ({
					path: p,
					allowed: this.validateAccess(p),
				}))
				.filter((x) => x.allowed)
				.map((x) => x.path)
		} catch (error) {
			console.error("Error filtering paths:", error)
			return [] // Fail closed for security
		}
	}

	/**
	 * Clean up resources when the controller is no longer needed
	 */
	dispose(): void {
		this.cleanupFunctions.forEach((cleanup) => cleanup())
		this.cleanupFunctions = []
	}

	/**
	 * Get formatted instructions about the .rooignore file for the LLM
	 * @returns Formatted instructions or undefined if .rooignore doesn't exist
	 */
	getInstructions(): string | undefined {
		if (!this.rooIgnoreContent) {
			return undefined
		}

		return `# .rooignore\n\n(The following is provided by a root-level .rooignore file where the user has specified files and directories that should not be accessed. When using list_files, you'll notice a ${LOCK_TEXT_SYMBOL} next to files that are blocked. Attempting to access the file's contents e.g. through read_file will result in an error.)\n\n${this.rooIgnoreContent}\n.rooignore`
	}
}
