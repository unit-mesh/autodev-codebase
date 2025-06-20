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
import { BatchProcessor, BatchProcessorOptions } from "./batch-processor"
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
	private batchProcessor: BatchProcessor<{ filePath: string; type: "create" | "change" | "delete"; content?: string; newHash?: string }>

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
		this.batchProcessor = new BatchProcessor()
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

		await this.processBatch(Array.from(eventsToProcess.values()))
	}

	/**
	 * Processes a batch of accumulated events using the BatchProcessor
	 * @param events Array of events to process
	 */
	private async processBatch(
		events: Array<{ filePath: string; type: "create" | "change" | "delete" }>,
	): Promise<void> {
		const batchResults: FileProcessingResult[] = []
		const totalFilesInBatch = events.length
		
		// Initial progress update
		this.eventBus.emit('batch-progress', {
			processedInBatch: 0,
			totalInBatch: totalFilesInBatch,
			currentFile: undefined,
		})

		// Prepare events with content for non-delete operations
		const eventsWithContent: Array<{ filePath: string; type: "create" | "change" | "delete"; content?: string; newHash?: string }> = []
		
		for (const event of events) {
			if (event.type === "delete") {
				eventsWithContent.push(event)
			} else {
				// For create/change events, we need to read the file content
				try {
					const fileContent = await this.fileSystem.readFile(event.filePath)
					const content = new TextDecoder().decode(fileContent)
					const newHash = createHash("sha256").update(content).digest("hex")
					
					eventsWithContent.push({
						...event,
						content,
						newHash
					})
				} catch (error) {
					console.error(`[FileWatcher] Failed to read file ${event.filePath}:`, error)
					batchResults.push({
						path: event.filePath,
						status: "error",
						error: error as Error
					})
				}
			}
		}

		// Use BatchProcessor for the actual processing
		if (this.embedder && this.vectorStore) {
			const options: BatchProcessorOptions<typeof eventsWithContent[0]> = {
				embedder: this.embedder,
				vectorStore: this.vectorStore,
				cacheManager: this.cacheManager,
				
				itemToText: (item) => item.content || "",
				itemToFilePath: (item) => item.filePath,
				getFileHash: (item) => item.newHash,
				
				itemToPoint: (item, embedding) => {
					if (!item.content) {
						throw new Error(`No content available for ${item.filePath}`)
					}
					
					// Parse the file to get code blocks
					const blocks = codeParser.parseFile(item.filePath, { 
						content: item.content, 
						fileHash: item.newHash || "" 
					})
					
					// For simplicity, create a single point per file
					// In a real implementation, you might want to create multiple points for multiple blocks
					const normalizedAbsolutePath = generateNormalizedAbsolutePath(item.filePath)
					const stableName = `${normalizedAbsolutePath}:0`
					const pointId = uuidv5(stableName, QDRANT_CODE_BLOCK_NAMESPACE)
					
					return {
						id: pointId,
						vector: embedding,
						payload: {
							filePath: generateRelativeFilePath(normalizedAbsolutePath),
							codeChunk: item.content,
							startLine: 1,
							endLine: item.content.split('\n').length,
						},
					}
				},
				
				getFilesToDelete: (items) => {
					const filesToDelete: string[] = []
					for (const item of items) {
						if (item.type === "delete") {
							filesToDelete.push(item.filePath)
						} else if (item.type === "change") {
							// For change events, we need to delete old points first
							filesToDelete.push(item.filePath)
						}
					}
					return filesToDelete
				},
				
				onProgress: (processed, total, currentFile) => {
					this.eventBus.emit('batch-progress', {
						processedInBatch: processed,
						totalInBatch: total,
						currentFile,
					})
				},
				
				onError: (error) => {
					console.error("[FileWatcher] Batch processing error:", error)
				}
			}
			
			const result = await this.batchProcessor.processBatch(
				eventsWithContent.filter(e => e.type !== "delete" && e.content),
				options
			)
			
			// Convert BatchProcessor results to FileProcessingResult format
			for (const event of eventsWithContent) {
				if (event.type === "delete" || !event.content) {
					// Handle delete events and files that couldn't be read
					batchResults.push({
						path: event.filePath,
						status: "success"
					})
				}
			}
			
			// Add any errors from batch processing
			for (const error of result.errors) {
				batchResults.push({
					path: "unknown",
					status: "error",
					error
				})
			}
		}

		// Finalize
		this.eventBus.emit('batch-finish', {
			processedFiles: batchResults,
			batchError: batchResults.some(r => r.status === "error") ? 
				new Error("Some files failed to process") : undefined,
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
