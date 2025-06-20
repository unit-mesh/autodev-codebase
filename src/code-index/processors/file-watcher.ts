import * as fs from "fs"
import * as path from "path"
import {
	QDRANT_CODE_BLOCK_NAMESPACE,
	MAX_FILE_SIZE_BYTES,
	BATCH_SEGMENT_THRESHOLD,
	MAX_BATCH_RETRIES,
	INITIAL_RETRY_DELAY_MS,
} from "../constants"
import { createHash } from "crypto"
import { RooIgnoreController } from "../../ignore/RooIgnoreController"
import { v5 as uuidv5 } from "uuid"
import { Ignore } from "ignore"
import { scannerExtensions } from "../shared/supported-extensions"
import {
	IFileWatcher,
	FileProcessingResult,
	IEmbedder,
	IVectorStore,
	PointStruct,
	BatchProcessingSummary,
} from "../interfaces"
import { codeParser } from "./parser"
import { CacheManager } from "../cache-manager"
import { generateNormalizedAbsolutePath, generateRelativeFilePath } from "../shared/get-relative-path"
import { IEventBus, IFileSystem } from "../../abstractions/core"

/**
 * Implementation of the file watcher interface
 */
export class FileWatcher implements IFileWatcher {
	private ignoreInstance?: Ignore
	private fileWatcher?: fs.FSWatcher
	private ignoreController: RooIgnoreController
	private accumulatedEvents: Map<string, { filePath: string; type: "create" | "change" | "delete" }> = new Map()
	private batchProcessDebounceTimer?: NodeJS.Timeout
	private readonly BATCH_DEBOUNCE_DELAY_MS = 500
	private readonly FILE_PROCESSING_CONCURRENCY_LIMIT = 10

	private eventBus: IEventBus
	private fileSystem: IFileSystem

	/**
	 * Event emitted when a batch of files begins processing
	 */
	public readonly onDidStartBatchProcessing: (handler: (data: string[]) => void) => () => void

	/**
	 * Event emitted to report progress during batch processing
	 */
	public readonly onBatchProgressUpdate: (handler: (data: {
		processedInBatch: number
		totalInBatch: number
		currentFile?: string
	}) => void) => () => void

	/**
	 * Event emitted when a batch of files has finished processing
	 */
	public readonly onDidFinishBatchProcessing: (handler: (data: BatchProcessingSummary) => void) => () => void

	/**
	 * Creates a new file watcher
	 * @param workspacePath Path to the workspace
	 * @param fileSystem File system abstraction
	 * @param eventBus Event bus for emitting events
	 * @param embedder Optional embedder
	 * @param vectorStore Optional vector store
	 * @param cacheManager Cache manager
	 */
	constructor(
		private workspacePath: string,
		fileSystem: IFileSystem,
		eventBus: IEventBus,
		private readonly cacheManager: CacheManager,
		private embedder?: IEmbedder,
		private vectorStore?: IVectorStore,
		ignoreInstance?: Ignore,
		ignoreController?: RooIgnoreController,
	) {
		this.eventBus = eventBus
		this.fileSystem = fileSystem
		this.ignoreController = ignoreController || new RooIgnoreController(workspacePath)
		if (ignoreInstance) {
			this.ignoreInstance = ignoreInstance
		}

		// Initialize event handlers
		this.onDidStartBatchProcessing = (handler) => this.eventBus.on('batch-start', handler)
		this.onBatchProgressUpdate = (handler) => this.eventBus.on('batch-progress', handler)
		this.onDidFinishBatchProcessing = (handler) => this.eventBus.on('batch-finish', handler)
	}

	/**
	 * Initializes the file watcher
	 */
	async initialize(): Promise<void> {
		// Create file watcher using Node.js fs.watch
		this.fileWatcher = fs.watch(this.workspacePath, { recursive: true }, (eventType, filename) => {
			if (!filename) return

			const fullPath = path.join(this.workspacePath, filename)

			// Check if file extension is supported
			const ext = path.extname(fullPath)
			if (!scannerExtensions.includes(ext)) return

			// Handle different event types
			if (eventType === 'rename') {
				// Check if file exists to determine if it's create or delete
				fs.access(fullPath, fs.constants.F_OK, (err) => {
					if (err) {
						// File doesn't exist, it was deleted
						this.handleFileDeleted(fullPath)
					} else {
						// File exists, it was created
						this.handleFileCreated(fullPath)
					}
				})
			} else if (eventType === 'change') {
				this.handleFileChanged(fullPath)
			}
		})
	}

	/**
	 * Disposes the file watcher
	 */
	dispose(): void {
		this.fileWatcher?.close()
		if (this.batchProcessDebounceTimer) {
			clearTimeout(this.batchProcessDebounceTimer)
		}
		// EventBus cleanup is handled by the platform implementation
		this.accumulatedEvents.clear()
	}

	/**
	 * Handles file creation events
	 * @param filePath Path of the created file
	 */
	private async handleFileCreated(filePath: string): Promise<void> {
		this.accumulatedEvents.set(filePath, { filePath, type: "create" })
		this.scheduleBatchProcessing()
	}

	/**
	 * Handles file change events
	 * @param filePath Path of the changed file
	 */
	private async handleFileChanged(filePath: string): Promise<void> {
		this.accumulatedEvents.set(filePath, { filePath, type: "change" })
		this.scheduleBatchProcessing()
	}

	/**
	 * Handles file deletion events
	 * @param filePath Path of the deleted file
	 */
	private async handleFileDeleted(filePath: string): Promise<void> {
		this.accumulatedEvents.set(filePath, { filePath, type: "delete" })
		this.scheduleBatchProcessing()
	}

	/**
	 * Schedules batch processing with debounce
	 */
	private scheduleBatchProcessing(): void {
		if (this.batchProcessDebounceTimer) {
			clearTimeout(this.batchProcessDebounceTimer)
		}
		this.batchProcessDebounceTimer = setTimeout(() => this.triggerBatchProcessing(), this.BATCH_DEBOUNCE_DELAY_MS)
	}

	/**
	 * Triggers processing of accumulated events
	 */
	private async triggerBatchProcessing(): Promise<void> {
		if (this.accumulatedEvents.size === 0) {
			return
		}

		const eventsToProcess = new Map(this.accumulatedEvents)
		this.accumulatedEvents.clear()

		const filePathsInBatch = Array.from(eventsToProcess.keys())
		this.eventBus.emit('batch-start', filePathsInBatch)

		await this.processBatch(eventsToProcess)
	}

	/**
	 * Processes a batch of accumulated events
	 * @param eventsToProcess Map of events to process
	 */
	private async _handleBatchDeletions(
		batchResults: FileProcessingResult[],
		processedCountInBatch: number,
		totalFilesInBatch: number,
		pathsToExplicitlyDelete: string[],
		filesToUpsertDetails: Array<{ path: string; filePath: string; originalType: "create" | "change" }>,
	): Promise<{ overallBatchError?: Error; clearedPaths: Set<string>; processedCount: number }> {
		let overallBatchError: Error | undefined
		const allPathsToClearFromDB = new Set<string>(pathsToExplicitlyDelete)

		for (const fileDetail of filesToUpsertDetails) {
			if (fileDetail.originalType === "change") {
				allPathsToClearFromDB.add(fileDetail.path)
			}
		}

		if (allPathsToClearFromDB.size > 0 && this.vectorStore) {
			try {
				await this.vectorStore.deletePointsByMultipleFilePaths(Array.from(allPathsToClearFromDB))

				for (const path of pathsToExplicitlyDelete) {
					this.cacheManager.deleteHash(path)
					batchResults.push({ path, status: "success" })
					processedCountInBatch++
					this.eventBus.emit('batch-progress', {
						processedInBatch: processedCountInBatch,
						totalInBatch: totalFilesInBatch,
						currentFile: path,
					})
				}
			} catch (error) {
				overallBatchError = error as Error
				for (const path of pathsToExplicitlyDelete) {
					batchResults.push({ path, status: "error", error: error as Error })
					processedCountInBatch++
					this.eventBus.emit('batch-progress', {
						processedInBatch: processedCountInBatch,
						totalInBatch: totalFilesInBatch,
						currentFile: path,
					})
				}
			}
		}

		return { overallBatchError, clearedPaths: allPathsToClearFromDB, processedCount: processedCountInBatch }
	}

	private async _processFilesAndPrepareUpserts(
		filesToUpsertDetails: Array<{ path: string; filePath: string; originalType: "create" | "change" }>,
		batchResults: FileProcessingResult[],
		processedCountInBatch: number,
		totalFilesInBatch: number,
		pathsToExplicitlyDelete: string[],
	): Promise<{
		pointsForBatchUpsert: PointStruct[]
		successfullyProcessedForUpsert: Array<{ path: string; newHash?: string }>
		processedCount: number
	}> {
		const pointsForBatchUpsert: PointStruct[] = []
		const successfullyProcessedForUpsert: Array<{ path: string; newHash?: string }> = []
		const filesToProcessConcurrently = [...filesToUpsertDetails]

		for (let i = 0; i < filesToProcessConcurrently.length; i += this.FILE_PROCESSING_CONCURRENCY_LIMIT) {
			const chunkToProcess = filesToProcessConcurrently.slice(i, i + this.FILE_PROCESSING_CONCURRENCY_LIMIT)

			const chunkProcessingPromises = chunkToProcess.map(async (fileDetail) => {
				this.eventBus.emit('batch-progress', {
					processedInBatch: processedCountInBatch,
					totalInBatch: totalFilesInBatch,
					currentFile: fileDetail.path,
				})
				try {
					const result = await this.processFile(fileDetail.path)
					return { path: fileDetail.path, result: result, error: undefined }
				} catch (e) {
					console.error(`[FileWatcher] Unhandled exception processing file ${fileDetail.path}:`, e)
					return { path: fileDetail.path, result: undefined, error: e as Error }
				}
			})

			const settledChunkResults = await Promise.allSettled(chunkProcessingPromises)

			for (const settledResult of settledChunkResults) {
				let resultPath: string | undefined

				if (settledResult.status === "fulfilled") {
					const { path, result, error: directError } = settledResult.value
					resultPath = path

					if (directError) {
						batchResults.push({ path, status: "error", error: directError })
					} else if (result) {
						if (result.status === "skipped" || result.status === "local_error") {
							batchResults.push(result)
						} else if (result.status === "processed_for_batching" && result.pointsToUpsert) {
							pointsForBatchUpsert.push(...result.pointsToUpsert)
							if (result.path && result.newHash) {
								successfullyProcessedForUpsert.push({ path: result.path, newHash: result.newHash })
							} else if (result.path && !result.newHash) {
								successfullyProcessedForUpsert.push({ path: result.path })
							}
						} else {
							batchResults.push({
								path,
								status: "error",
								error: new Error(
									`Unexpected result status from processFile: ${result.status} for file ${path}`,
								),
							})
						}
					} else {
						batchResults.push({
							path,
							status: "error",
							error: new Error(`Fulfilled promise with no result or error for file ${path}`),
						})
					}
				} else {
					console.error("[FileWatcher] A file processing promise was rejected:", settledResult.reason)
					batchResults.push({
						path: settledResult.reason?.path || "unknown",
						status: "error",
						error: settledResult.reason as Error,
					})
				}

				if (!pathsToExplicitlyDelete.includes(resultPath || "")) {
					processedCountInBatch++
				}
				this.eventBus.emit('batch-progress', {
					processedInBatch: processedCountInBatch,
					totalInBatch: totalFilesInBatch,
					currentFile: resultPath,
				})
			}
		}

		return { pointsForBatchUpsert, successfullyProcessedForUpsert, processedCount: processedCountInBatch }
	}

	private async _executeBatchUpsertOperations(
		pointsForBatchUpsert: PointStruct[],
		successfullyProcessedForUpsert: Array<{ path: string; newHash?: string }>,
		batchResults: FileProcessingResult[],
		overallBatchError?: Error,
	): Promise<Error | undefined> {
		if (pointsForBatchUpsert.length > 0 && this.vectorStore && !overallBatchError) {
			try {
				for (let i = 0; i < pointsForBatchUpsert.length; i += BATCH_SEGMENT_THRESHOLD) {
					const batch = pointsForBatchUpsert.slice(i, i + BATCH_SEGMENT_THRESHOLD)
					let retryCount = 0
					let upsertError: Error | undefined

					while (retryCount < MAX_BATCH_RETRIES) {
						try {
							await this.vectorStore.upsertPoints(batch)
							break
						} catch (error) {
							upsertError = error as Error
							retryCount++
							if (retryCount === MAX_BATCH_RETRIES) {
								throw new Error(
									`Failed to upsert batch after ${MAX_BATCH_RETRIES} retries: ${upsertError.message}`,
								)
							}
							await new Promise((resolve) =>
								setTimeout(resolve, INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount - 1)),
							)
						}
					}
				}

				for (const { path, newHash } of successfullyProcessedForUpsert) {
					if (newHash) {
						this.cacheManager.updateHash(path, newHash)
					}
					batchResults.push({ path, status: "success" })
				}
			} catch (error) {
				overallBatchError = overallBatchError || (error as Error)
				for (const { path } of successfullyProcessedForUpsert) {
					batchResults.push({ path, status: "error", error: error as Error })
				}
			}
		} else if (overallBatchError && pointsForBatchUpsert.length > 0) {
			for (const { path } of successfullyProcessedForUpsert) {
				batchResults.push({ path, status: "error", error: overallBatchError })
			}
		}

		return overallBatchError
	}

	private async processBatch(
		eventsToProcess: Map<string, { filePath: string; type: "create" | "change" | "delete" }>,
	): Promise<void> {
		const batchResults: FileProcessingResult[] = []
		let processedCountInBatch = 0
		const totalFilesInBatch = eventsToProcess.size
		let overallBatchError: Error | undefined

		// Initial progress update
		this.eventBus.emit('batch-progress', {
			processedInBatch: 0,
			totalInBatch: totalFilesInBatch,
			currentFile: undefined,
		})

		// Categorize events
		const pathsToExplicitlyDelete: string[] = []
		const filesToUpsertDetails: Array<{ path: string; filePath: string; originalType: "create" | "change" }> = []

		for (const event of eventsToProcess.values()) {
			if (event.type === "delete") {
				pathsToExplicitlyDelete.push(event.filePath)
			} else {
				filesToUpsertDetails.push({
					path: event.filePath,
					filePath: event.filePath,
					originalType: event.type,
				})
			}
		}

		// Phase 1: Handle deletions
		const { overallBatchError: deletionError, processedCount: deletionCount } = await this._handleBatchDeletions(
			batchResults,
			processedCountInBatch,
			totalFilesInBatch,
			pathsToExplicitlyDelete,
			filesToUpsertDetails,
		)
		overallBatchError = deletionError
		processedCountInBatch = deletionCount

		// Phase 2: Process files and prepare upserts
		const {
			pointsForBatchUpsert,
			successfullyProcessedForUpsert,
			processedCount: upsertCount,
		} = await this._processFilesAndPrepareUpserts(
			filesToUpsertDetails,
			batchResults,
			processedCountInBatch,
			totalFilesInBatch,
			pathsToExplicitlyDelete,
		)
		processedCountInBatch = upsertCount

		// Phase 3: Execute batch upsert
		overallBatchError = await this._executeBatchUpsertOperations(
			pointsForBatchUpsert,
			successfullyProcessedForUpsert,
			batchResults,
			overallBatchError,
		)

		// Finalize
		this.eventBus.emit('batch-finish', {
			processedFiles: batchResults,
			batchError: overallBatchError,
		})
		this.eventBus.emit('batch-progress', {
			processedInBatch: totalFilesInBatch,
			totalInBatch: totalFilesInBatch,
		})

		if (this.accumulatedEvents.size === 0) {
			this.eventBus.emit('batch-progress', {
				processedInBatch: 0,
				totalInBatch: 0,
				currentFile: undefined,
			})
		}
	}

	/**
	 * Processes a file
	 * @param filePath Path to the file to process
	 * @returns Promise resolving to processing result
	 */
	async processFile(filePath: string): Promise<FileProcessingResult> {
		try {
			// Check if file should be ignored
			const relativeFilePath = generateRelativeFilePath(filePath)
			if (
				!this.ignoreController.validateAccess(filePath) ||
				(this.ignoreInstance && this.ignoreInstance.ignores(relativeFilePath))
			) {
				return {
					path: filePath,
					status: "skipped" as const,
					reason: "File is ignored by .rooignore or .gitignore",
				}
			}

			// Check file size
			const fileStat = await this.fileSystem.stat(filePath)
			if (fileStat.size > MAX_FILE_SIZE_BYTES) {
				return {
					path: filePath,
					status: "skipped" as const,
					reason: "File is too large",
				}
			}

			// Read file content
			const fileContent = await this.fileSystem.readFile(filePath)
			const content = new TextDecoder().decode(fileContent)

			// Calculate hash
			const newHash = createHash("sha256").update(content).digest("hex")

			// Check if file has changed
			if (this.cacheManager.getHash(filePath) === newHash) {
				return {
					path: filePath,
					status: "skipped" as const,
					reason: "File has not changed",
				}
			}

			// Parse file
			const blocks = await codeParser.parseFile(filePath, { content, fileHash: newHash })

			// Prepare points for batch processing
			let pointsToUpsert: PointStruct[] = []
			if (this.embedder && blocks.length > 0) {
				const texts = blocks.map((block) => block.content)
				const { embeddings } = await this.embedder.createEmbeddings(texts)

				pointsToUpsert = blocks.map((block, index) => {
					const normalizedAbsolutePath = generateNormalizedAbsolutePath(block.file_path)
					const stableName = `${normalizedAbsolutePath}:${block.start_line}`
					const pointId = uuidv5(stableName, QDRANT_CODE_BLOCK_NAMESPACE)

					return {
						id: pointId,
						vector: embeddings[index],
						payload: {
							filePath: generateRelativeFilePath(normalizedAbsolutePath),
							codeChunk: block.content,
							startLine: block.start_line,
							endLine: block.end_line,
						},
					}
				})
			}

			return {
				path: filePath,
				status: "processed_for_batching" as const,
				newHash,
				pointsToUpsert,
			}
		} catch (error) {
			return {
				path: filePath,
				status: "local_error" as const,
				error: error as Error,
			}
		}
	}
}
