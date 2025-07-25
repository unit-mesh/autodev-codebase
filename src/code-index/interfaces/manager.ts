import { VectorStoreSearchResult, SearchFilter } from "./vector-store"
import type { IndexingState } from "../state-manager"

// Re-export IndexingState for external use
export { IndexingState }

/**
 * Interface for the code index manager
 */
export interface ICodeIndexManager {
	/**
	 * Event emitted when progress is updated
	 */
	onProgressUpdate: (handler: (data: {
		systemStatus: IndexingState
		fileStatuses: Record<string, string>
		message?: string
	}) => void) => () => void

	/**
	 * Current state of the indexing process
	 */
	readonly state: IndexingState

	/**
	 * Whether the code indexing feature is enabled
	 */
	readonly isFeatureEnabled: boolean

	/**
	 * Whether the code indexing feature is configured
	 */
	readonly isFeatureConfigured: boolean

	/**
	 * Loads configuration from storage
	 */
	loadConfiguration(): Promise<void>

	/**
	 * Starts the indexing process
	 */
	startIndexing(): Promise<void>

	/**
	 * Stops the file watcher
	 */
	stopWatcher(): void

	/**
	 * Clears the index data
	 */
	clearIndexData(): Promise<void>

	/**
	 * Searches the index
	 * @param query Query string
	 * @param filter Search filter options
	 * @returns Promise resolving to search results
	 */
	searchIndex(query: string, filter?: SearchFilter): Promise<VectorStoreSearchResult[]>

	/**
	 * Gets the current status of the indexing system
	 * @returns Current status information
	 */
	getCurrentStatus(): { systemStatus: IndexingState; fileStatuses: Record<string, string>; message?: string }

	/**
	 * Disposes of resources used by the manager
	 */
	dispose(): void
}

export type EmbedderProvider = "openai" | "ollama" | "openai-compatible"

export interface IndexProgressUpdate {
	systemStatus: IndexingState
	message?: string
	processedBlockCount?: number
	totalBlockCount?: number
}
