import * as path from "path"
import { CodeIndexConfigManager } from "./config-manager"
import { CodeIndexStateManager, IndexingState } from "./state-manager"
import { IFileWatcher, IVectorStore, BatchProcessingSummary } from "./interfaces"
import { DirectoryScanner } from "./processors"
import { CacheManager } from "./cache-manager"

/**
 * Manages the code indexing workflow, coordinating between different services and managers.
 */
export class CodeIndexOrchestrator {
	private _fileWatcherSubscriptions: (() => void)[] = []
	private _isProcessing: boolean = false

	constructor(
		private readonly configManager: CodeIndexConfigManager,
		private readonly stateManager: CodeIndexStateManager,
		private readonly workspacePath: string,
		private readonly cacheManager: CacheManager,
		private readonly vectorStore: IVectorStore,
		private readonly scanner: DirectoryScanner,
		private readonly fileWatcher: IFileWatcher,
	) {}

	/**
	 * Starts the file watcher if not already running.
	 */
	private async _startWatcher(): Promise<void> {
		if (!this.configManager.isFeatureConfigured) {
			throw new Error("Cannot start watcher: Service not configured.")
		}

		this.stateManager.setSystemState("Indexing", "Initializing file watcher...")

		try {
			await this.fileWatcher.initialize()

			this._fileWatcherSubscriptions = [
				this.fileWatcher.onDidStartBatchProcessing((filePaths: string[]) => {}),
				this.fileWatcher.onBatchProgressUpdate(({ processedInBatch, totalInBatch, currentFile }) => {
					if (totalInBatch > 0 && this.stateManager.state !== "Indexing") {
						this.stateManager.setSystemState("Indexing", "Processing file changes...")
					}
					this.stateManager.reportFileQueueProgress(
						processedInBatch,
						totalInBatch,
						currentFile ? path.basename(currentFile) : undefined,
					)
					if (processedInBatch === totalInBatch) {
						// Covers (N/N) and (0/0)
						if (totalInBatch > 0) {
							// Batch with items completed
							this.stateManager.setSystemState("Indexed", "File changes processed. Index up-to-date.")
						} else {
							if (this.stateManager.state === "Indexing") {
								// Only transition if it was "Indexing"
								this.stateManager.setSystemState("Indexed", "Index up-to-date. File queue empty.")
							}
						}
					}
				}),
				this.fileWatcher.onDidFinishBatchProcessing((summary: BatchProcessingSummary) => {
					if (summary.batchError) {
						console.error(`[CodeIndexOrchestrator] Batch processing failed:`, summary.batchError)
					} else {
						const successCount = summary.processedFiles.filter(
							(f: { status: string }) => f.status === "success",
						).length
						const errorCount = summary.processedFiles.filter(
							(f: { status: string }) => f.status === "error" || f.status === "local_error",
						).length
					}
				}),
			]
		} catch (error) {
			console.error("[CodeIndexOrchestrator] Failed to start file watcher:", error)
			throw error
		}
	}

	/**
	 * Updates the status of a file in the state manager.
	 */

	/**
	 * Initiates the indexing process (initial scan and starts watcher).
	 */
	public async startIndexing(): Promise<void> {
		if (!this.configManager.isFeatureConfigured) {
			this.stateManager.setSystemState("Standby", "Missing configuration. Save your settings to start indexing.")
			console.warn("[CodeIndexOrchestrator] Start rejected: Missing configuration.")
			return
		}

		if (
			this._isProcessing ||
			(this.stateManager.state !== "Standby" &&
				this.stateManager.state !== "Error" &&
				this.stateManager.state !== "Indexed")
		) {
			console.warn(
				`[CodeIndexOrchestrator] Start rejected: Already processing or in state ${this.stateManager.state}.`,
			)
			return
		}

		this._isProcessing = true
		this.stateManager.setSystemState("Indexing", "Initializing services...")
		console.log('[CodeIndexOrchestrator] 🚀 开始索引进程...')

		try {
			console.log('[CodeIndexOrchestrator] 💾 初始化向量存储...')
			const collectionCreated = await this.vectorStore.initialize()
			console.log('[CodeIndexOrchestrator] ✅ 向量存储初始化完成, 新集合创建:', collectionCreated)

			if (collectionCreated) {
				console.log('[CodeIndexOrchestrator] 🗑️ 清理缓存文件...')
				await this.cacheManager.clearCacheFile()
				console.log('[CodeIndexOrchestrator] ✅ 缓存文件已清理')
			}

			this.stateManager.setSystemState("Indexing", "Services ready. Starting workspace scan...")
			console.log('[CodeIndexOrchestrator] 📁 开始扫描工作区:', this.workspacePath)

			let cumulativeBlocksIndexed = 0
			let cumulativeBlocksFoundSoFar = 0

			const handleFileParsed = (fileBlockCount: number) => {
				cumulativeBlocksFoundSoFar += fileBlockCount
				this.stateManager.reportBlockIndexingProgress(cumulativeBlocksIndexed, cumulativeBlocksFoundSoFar)
			}

			const handleBlocksIndexed = (indexedCount: number) => {
				cumulativeBlocksIndexed += indexedCount
				this.stateManager.reportBlockIndexingProgress(cumulativeBlocksIndexed, cumulativeBlocksFoundSoFar)
			}

			console.log('[CodeIndexOrchestrator] 🔍 开始扫描目录...')
			const result = await this.scanner.scanDirectory(
				this.workspacePath,
				(batchError: Error) => {
					console.error(
						`[CodeIndexOrchestrator] ❌ 扫描批次错误: ${batchError.message}`,
						batchError,
					)
				},
				handleBlocksIndexed,
				handleFileParsed,
			)
			console.log('[CodeIndexOrchestrator] ✅ 目录扫描完成')

			if (!result) {
				console.error('[CodeIndexOrchestrator] ❌ 扫描结果为空')
				throw new Error("Scan failed, is scanner initialized?")
			}

			const { stats } = result
			console.log('[CodeIndexOrchestrator] 📊 扫描统计:', stats)

			// 提供更详细的状态消息
			let statusMessage = "File watcher started."
			if (stats.processed === 0 && stats.skipped > 0) {
				statusMessage = `All files cached (${stats.skipped} files skipped). Index up-to-date.`
			} else if (stats.processed > 0 && stats.skipped > 0) {
				statusMessage = `Indexed ${stats.processed} new/changed files, ${stats.skipped} cached files skipped.`
			} else if (stats.processed > 0) {
				statusMessage = `Indexed ${stats.processed} files.`
			}

			console.log('[CodeIndexOrchestrator] 👀 开始文件监控...')
			await this._startWatcher()
			console.log('[CodeIndexOrchestrator] ✅ 文件监控已启动')

			this.stateManager.setSystemState("Indexed", statusMessage)
			console.log('[CodeIndexOrchestrator] ✨ 索引进程全部完成!')
		} catch (error: any) {
			console.error("[CodeIndexOrchestrator] ❌ 索引过程中发生错误:", error)
			console.error("[CodeIndexOrchestrator] ❌ 错误堆栈:", error.stack)
			try {
				await this.vectorStore.clearCollection()
			} catch (cleanupError) {
				console.error("[CodeIndexOrchestrator] Failed to clean up after error:", cleanupError)
			}

			await this.cacheManager.clearCacheFile()

			this.stateManager.setSystemState("Error", `Failed during initial scan: ${error.message || "Unknown error"}`)
			this.stopWatcher()
		} finally {
			this._isProcessing = false
		}
	}

	/**
	 * Stops the file watcher and cleans up resources.
	 */
	public stopWatcher(): void {
		this.fileWatcher.dispose()
		this._fileWatcherSubscriptions.forEach((unsubscribe) => unsubscribe())
		this._fileWatcherSubscriptions = []

		if (this.stateManager.state !== "Error") {
			this.stateManager.setSystemState("Standby", "File watcher stopped.")
		}
		this._isProcessing = false
	}

	/**
	 * Clears all index data by stopping the watcher, clearing the vector store,
	 * and resetting the cache file.
	 */
	public async clearIndexData(): Promise<void> {
		this._isProcessing = true

		try {
			await this.stopWatcher()

			try {
				if (this.configManager.isFeatureConfigured) {
					await this.vectorStore.deleteCollection()
				} else {
					console.warn("[CodeIndexOrchestrator] Service not configured, skipping vector collection clear.")
				}
			} catch (error: any) {
				console.error("[CodeIndexOrchestrator] Failed to clear vector collection:", error)
				this.stateManager.setSystemState("Error", `Failed to clear vector collection: ${error.message}`)
			}

			await this.cacheManager.clearCacheFile()

			if (this.stateManager.state !== "Error") {
				this.stateManager.setSystemState("Standby", "Index data cleared successfully.")
			}
		} finally {
			this._isProcessing = false
		}
	}

	/**
	 * Gets the current state of the indexing system.
	 */
	public get state(): IndexingState {
		return this.stateManager.state
	}
}
