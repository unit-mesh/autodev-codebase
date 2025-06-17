import { VectorStoreSearchResult } from "./interfaces"
import { IndexingState, ICodeIndexManager } from "./interfaces/manager"
import { CodeIndexConfigManager } from "./config-manager"
import { CodeIndexStateManager } from "./state-manager"
import { CodeIndexServiceFactory } from "./service-factory"
import { CodeIndexSearchService } from "./search-service"
import { CodeIndexOrchestrator } from "./orchestrator"
import { CacheManager } from "./cache-manager"
import { IConfigProvider } from "../abstractions/config"
import { IFileSystem, IStorage, IEventBus } from "../abstractions/core"
import { IWorkspace, IPathUtils } from "../abstractions/workspace"
import ignore from "ignore"

export interface CodeIndexManagerDependencies {
	fileSystem: IFileSystem
	storage: IStorage
	eventBus: IEventBus
	workspace: IWorkspace
	pathUtils: IPathUtils
	configProvider: IConfigProvider
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
		for (const instance of CodeIndexManager.instances.values()) {
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
			)

			const ignoreInstance = ignore()
			const ignoreRules = this.dependencies.workspace.getIgnoreRules()
			ignoreInstance.add(ignoreRules)

			// (Re)Create shared service instances  
			// Note: Service factory still needs to be refactored to remove VSCode dependencies
			// For now, we'll pass null as context - this will need to be updated when service factory is refactored
			const { embedder, vectorStore, scanner, fileWatcher } = this._serviceFactory.createServices(
				null as any, // TODO: Remove when service factory is refactored
				this._cacheManager,
				ignoreInstance,
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
			)

			// (Re)Initialize search service
			this._searchService = new CodeIndexSearchService(
				this._configManager,
				this._stateManager,
				embedder,
				vectorStore,
			)
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

	public async searchIndex(query: string, limit: number = 10): Promise<VectorStoreSearchResult[]> {
		if (!this.isFeatureEnabled) {
			return []
		}
		this.assertInitialized()
		return this._searchService!.searchIndex(query, undefined, limit)
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
