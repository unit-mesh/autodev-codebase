import { VectorStoreSearchResult, SearchFilter, IVectorStore, IDirectoryScanner } from "./interfaces"
import { IndexingState, ICodeIndexManager } from "./interfaces/manager"
import { CodeIndexConfigManager } from "./config-manager"
import { CodeIndexStateManager } from "./state-manager"
import { CodeIndexServiceFactory } from "./service-factory"
import { CodeIndexSearchService } from "./search-service"
import { CodeIndexOrchestrator } from "./orchestrator"
import { CacheManager } from "./cache-manager"
import { IConfigProvider } from "../abstractions/config"
import { IFileSystem, IStorage, IEventBus, ILogger } from "../abstractions/core"
import { IWorkspace, IPathUtils } from "../abstractions/workspace"
import ignore from "ignore"

export interface CodeIndexManagerDependencies {
	fileSystem: IFileSystem
	storage: IStorage
	eventBus: IEventBus
	workspace: IWorkspace
	pathUtils: IPathUtils
	configProvider: IConfigProvider
	logger?: ILogger
}

export class CodeIndexManager implements ICodeIndexManager {
	// --- Singleton Implementation ---
	private static instances = new Map<string, CodeIndexManager>() // Map workspace path to instance

	// Specialized class instances
	private _configManager: CodeIndexConfigManager | undefined
	private readonly _stateManager: CodeIndexStateManager
	private _serviceFactory: CodeIndexServiceFactory | undefined
	private _orchestrator: CodeIndexOrchestrator | undefined
	private _searchService: CodeIndexSearchService | undefined
	private _cacheManager: CacheManager | undefined

	public static getInstance(dependencies: CodeIndexManagerDependencies): CodeIndexManager | undefined {
		const workspacePath = dependencies.workspace.getRootPath()

		if (!workspacePath) {
			return undefined
		}

		if (!CodeIndexManager.instances.has(workspacePath)) {
			CodeIndexManager.instances.set(workspacePath, new CodeIndexManager(workspacePath, dependencies))
		}
		return CodeIndexManager.instances.get(workspacePath)!
	}

	public static disposeAll(): void {
		for (const instance of Array.from(CodeIndexManager.instances.values())) {
			instance.dispose()
		}
		CodeIndexManager.instances.clear()
	}

	private readonly workspacePath: string
	private readonly dependencies: CodeIndexManagerDependencies

	// Private constructor for singleton pattern
	private constructor(workspacePath: string, dependencies: CodeIndexManagerDependencies) {
		this.workspacePath = workspacePath
		this.dependencies = dependencies
		this._stateManager = new CodeIndexStateManager(dependencies.eventBus)
	}

	// --- Public API ---

	public get workspacePathValue(): string {
		return this.workspacePath
	}

	public get onProgressUpdate() {
		return this._stateManager.onProgressUpdate
	}

	private assertInitialized() {
		if (!this._configManager || !this._orchestrator || !this._searchService || !this._cacheManager) {
			throw new Error("CodeIndexManager not initialized. Call initialize() first.")
		}
	}

	public get state(): IndexingState {
		if (!this.isFeatureEnabled) {
			return "Standby"
		}
		this.assertInitialized()
		return this._orchestrator!.state
	}

	public get isFeatureEnabled(): boolean {
		return this._configManager?.isFeatureEnabled ?? false
	}

	public get isFeatureConfigured(): boolean {
		return this._configManager?.isFeatureConfigured ?? false
	}

	public get isInitialized(): boolean {
		try {
			this.assertInitialized()
			return true
		} catch (error) {
			return false
		}
	}

	/**
	 * Initializes the manager with configuration and dependent services.
	 * Must be called before using any other methods.
	 * @returns Object indicating if a restart is needed
	 */
	public async initialize(): Promise<{ requiresRestart: boolean }> {
		// 1. ConfigManager Initialization and Configuration Loading
		if (!this._configManager) {
			this._configManager = new CodeIndexConfigManager(this.dependencies.configProvider)
			await this._configManager.initialize()
		}
		// Load configuration once to get current state and restart requirements
		const { requiresRestart } = await this._configManager.loadConfiguration()

		// 2. Check if feature is enabled
		if (!this.isFeatureEnabled) {
			if (this._orchestrator) {
				this._orchestrator.stopWatcher()
			}
			return { requiresRestart }
		}

		// 3. CacheManager Initialization
		if (!this._cacheManager) {
			this._cacheManager = new CacheManager(
				this.dependencies.fileSystem, 
				this.dependencies.storage, 
				this.workspacePath
			)
			await this._cacheManager.initialize()
		}
		// console.log(`[CodeIndexManager] Cache initialized at ${this._cacheManager.getCachePath}`)
		// 4. Determine if Core Services Need Recreation
		const needsServiceRecreation = !this._serviceFactory || requiresRestart

		if (needsServiceRecreation) {
			// Stop watcher if it exists
			if (this._orchestrator) {
				this.stopWatcher()
			}

			// (Re)Initialize service factory
			this._serviceFactory = new CodeIndexServiceFactory(
				this._configManager,
				this.workspacePath,
				this._cacheManager,
				this.dependencies.logger,
			)

			const ignoreInstance = ignore()
			const ignoreRules = this.dependencies.workspace.getIgnoreRules()
			ignoreInstance.add(ignoreRules)

			// (Re)Create shared service instances  
			const { embedder, vectorStore, scanner, fileWatcher } = this._serviceFactory.createServices(
				this.dependencies.fileSystem,
				this.dependencies.eventBus,
				this._cacheManager,
				ignoreInstance,
				this.dependencies.workspace,
				this.dependencies.pathUtils
			)

			// (Re)Initialize orchestrator
			this._orchestrator = new CodeIndexOrchestrator(
				this._configManager,
				this._stateManager,
				this.workspacePath,
				this._cacheManager,
				vectorStore,
				scanner,
				fileWatcher,
				this.dependencies.logger,
			)

			// (Re)Initialize search service
			this._searchService = new CodeIndexSearchService(
				this._configManager,
				this._stateManager,
				embedder,
				vectorStore,
			)

			// Add the new reconciliation step
			await this.reconcileIndex(vectorStore, scanner)
		}

		// 5. Handle Indexing Start/Restart
		// The enhanced vectorStore.initialize() in startIndexing() now handles dimension changes automatically
		// by detecting incompatible collections and recreating them, so we rely on that for dimension changes
		const shouldStartOrRestartIndexing =
			requiresRestart ||
			(needsServiceRecreation && (!this._orchestrator || this._orchestrator.state !== "Indexing"))

		if (shouldStartOrRestartIndexing) {
			this._orchestrator?.startIndexing() // This method is async, but we don't await it here
		}

		return { requiresRestart }
	}

	/**
	 * Loads configuration from storage (interface implementation)
	 */
	public async loadConfiguration(): Promise<void> {
		if (this._configManager) {
			await this._configManager.loadConfiguration()
		}
	}

	/**
	 * Initiates the indexing process (initial scan and starts watcher).
	 */

	public async startIndexing(): Promise<void> {
		if (!this.isFeatureEnabled) {
			return
		}
		this.assertInitialized()
		await this._orchestrator!.startIndexing()
	}

	/**
	 * Stops the file watcher and potentially cleans up resources.
	 */
	public stopWatcher(): void {
		if (!this.isFeatureEnabled) {
			return
		}
		if (this._orchestrator) {
			this._orchestrator.stopWatcher()
		}
	}

	/**
	 * Cleans up the manager instance.
	 */
	public dispose(): void {
		if (this._orchestrator) {
			this.stopWatcher()
		}
		this._stateManager.dispose()
	}

	/**
	 * Clears all index data by stopping the watcher, clearing the Qdrant collection,
	 * and deleting the cache file.
	 */
	public async clearIndexData(): Promise<void> {
		if (!this.isFeatureEnabled) {
			return
		}
		this.assertInitialized()
		await this._orchestrator!.clearIndexData()
		await this._cacheManager!.clearCacheFile()
	}

	// --- Private Helpers ---

	public getCurrentStatus() {
		return this._stateManager.getCurrentStatus()
	}

	private async reconcileIndex(vectorStore: IVectorStore, scanner: IDirectoryScanner) {
		const logger = this.dependencies.logger
		logger?.info("Reconciling index with filesystem...")

		// 1. Get all file paths from the vector store (these are relative paths)
		const indexedRelativePaths = await vectorStore.getAllFilePaths()
		if (indexedRelativePaths.length === 0) {
			logger?.info("No files found in vector store. Skipping reconciliation.")
			return
		}

		// 2. Get all file paths from the local filesystem (these are absolute paths)
		const localAbsolutePaths = await scanner.getAllFilePaths(this.workspacePath)
		const localRelativePathSet = new Set(
			localAbsolutePaths.map((p) => this.dependencies.workspace.getRelativePath(p)),
		)

		// 3. Determine which files are stale
		const staleRelativePaths = indexedRelativePaths.filter((p) => !localRelativePathSet.has(p))

		if (staleRelativePaths.length > 0) {
			logger?.info(`Found ${staleRelativePaths.length} stale files to remove.`)

			// 4. Delete stale entries from vector store (using relative paths)
			await vectorStore.deletePointsByMultipleFilePaths(staleRelativePaths)

			// 5. Delete stale entries from cache (using absolute paths)
			const staleAbsolutePaths = staleRelativePaths.map((p) =>
				this.dependencies.pathUtils.resolve(this.workspacePath, p),
			)
			this._cacheManager!.deleteHashes(staleAbsolutePaths)
		} else {
			logger?.info("Index is already up-to-date.")
		}
	}

	public async searchIndex(query: string, filter?: SearchFilter): Promise<VectorStoreSearchResult[]> {
		if (!this.isFeatureEnabled) {
			return []
		}
		this.assertInitialized()
		return this._searchService!.searchIndex(query, filter)
	}

	/**
	 * Handles external settings changes by reloading configuration.
	 * This method should be called when API provider settings are updated
	 * to ensure the CodeIndexConfigManager picks up the new configuration.
	 * If the configuration changes require a restart, the service will be restarted.
	 */
	public async handleExternalSettingsChange(): Promise<void> {
		if (this._configManager) {
			const { requiresRestart } = await this._configManager.loadConfiguration()

			const isFeatureEnabled = this.isFeatureEnabled
			const isFeatureConfigured = this.isFeatureConfigured

			// If configuration changes require a restart and the manager is initialized, restart the service
			if (requiresRestart && isFeatureEnabled && isFeatureConfigured && this.isInitialized) {
				this.stopWatcher()
				await this.startIndexing()
			}
		}
	}
}
