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
	ICodeFileWatcher,
	FileProcessingResult,
	IEmbedder,
	IVectorStore,
	PointStruct,
	BatchProcessingSummary,
	CodeBlock,
} from "../interfaces"
import { BatchProcessor, BatchProcessorOptions } from "./batch-processor"
import { codeParser } from "./parser"
import { CacheManager } from "../cache-manager"
import { IEventBus, IFileSystem } from "../../abstractions/core"
import { IWorkspace, IPathUtils } from "../../abstractions/workspace"

/**
 * Implementation of the file watcher interface
 */
export class FileWatcher implements ICodeFileWatcher {
	private ignoreInstance?: Ignore
	private fileWatcher?: fs.FSWatcher
	private ignoreController: RooIgnoreController
	private accumulatedEvents: Map<string, { filePath: string; type: "create" | "change" | "delete" }> = new Map()
	private batchProcessDebounceTimer?: NodeJS.Timeout
	private readonly BATCH_DEBOUNCE_DELAY_MS = 500
	private readonly FILE_PROCESSING_CONCURRENCY_LIMIT = 10

	private eventBus: IEventBus
	private fileSystem: IFileSystem
	private workspace: IWorkspace
	private pathUtils: IPathUtils
	private batchProcessor: BatchProcessor<CodeBlock>

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
		workspace: IWorkspace,
		pathUtils: IPathUtils,
		private readonly cacheManager: CacheManager,
		private embedder?: IEmbedder,
		private vectorStore?: IVectorStore,
		ignoreInstance?: Ignore,
		ignoreController?: RooIgnoreController,
	) {
		this.eventBus = eventBus
		this.fileSystem = fileSystem
		this.workspace = workspace
		this.pathUtils = pathUtils
		this.ignoreController = ignoreController || new RooIgnoreController(fileSystem, workspace, pathUtils)
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
			// console.log(`[FileWatcher] Detected ${eventType} on file: ${filename}`)
			const fullPath = path.join(this.workspacePath, filename)

			// Check if file extension is supported
			const ext = path.extname(fullPath)
			if (!scannerExtensions.includes(ext)) return

			// Handle different event types
			if (eventType === 'rename') {
				// Use synchronous check for more reliable file existence detection
				try {
					fs.accessSync(fullPath, fs.constants.F_OK)
					// File exists, it was created or moved here
					// console.log(`[FileWatcher] File exists, treating as create: ${fullPath}`)
					this.handleFileCreated(fullPath)
				} catch (err) {
					// File doesn't exist, it was deleted or moved away
					// console.log(`[FileWatcher] File doesn't exist, treating as delete: ${fullPath}`)
					this.handleFileDeleted(fullPath)
				}
			} else if (eventType === 'change') {
				// console.log(`[FileWatcher] File changed: ${fullPath}`)
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
		console.log(`[FileWatcher] Processing batch of ${events.length} events`, JSON.stringify(events))
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

		// Parse files into code blocks and separate deletions
		const blocksToUpsert: CodeBlock[] = []
		const filesToDelete: string[] = []
		const fileInfoMap: Map<string, { fileHash: string; isNew: boolean }> = new Map()

		for (const event of eventsWithContent) {
			if (event.type === "delete") {
				filesToDelete.push(event.filePath)
			} else if (event.content && event.newHash) {
				// Parse the file to get code blocks like DirectoryScanner does
				try {
					const blocks = await codeParser.parseFile(event.filePath, {
						content: event.content,
						fileHash: event.newHash
					})
					
					// Add all blocks from this file to the batch
					blocks.forEach(block => {
						if (block.content.trim()) {
							blocksToUpsert.push(block)
						}
					})
					
					// Store file info for later use
					fileInfoMap.set(event.filePath, {
						fileHash: event.newHash,
						isNew: event.type === "create"
					})
				} catch (error) {
					console.error(`[FileWatcher] Failed to parse file ${event.filePath}:`, error)
					batchResults.push({
						path: event.filePath,
						status: "error",
						error: error as Error
					})
				}
			}
		}

		// Deletions will be handled by BatchProcessor

		// Use BatchProcessor for both deletions and upserting blocks (like DirectoryScanner)
		if (this.embedder && this.vectorStore && (blocksToUpsert.length > 0 || filesToDelete.length > 0)) {
			console.log(`[FileWatcher] Processing batch of ${blocksToUpsert.length} Upserts and ${filesToDelete.length} deletions`)
			const options: BatchProcessorOptions<CodeBlock> = {
				embedder: this.embedder,
				vectorStore: this.vectorStore,
				cacheManager: this.cacheManager,

				itemToText: (block) => block.content,
				itemToFilePath: (block) => block.file_path,
				getFileHash: (block) => {
					// Find the corresponding file info for this block
					const fileInfo = fileInfoMap.get(block.file_path)
					return fileInfo?.fileHash || ""
				},

				itemToPoint: (block, embedding) => {
					// Use the same logic as DirectoryScanner
					const normalizedAbsolutePath = this.pathUtils.normalize(this.pathUtils.resolve(block.file_path))
					const stableName = `${normalizedAbsolutePath}:${block.start_line}`
					const pointId = uuidv5(stableName, QDRANT_CODE_BLOCK_NAMESPACE)

					return {
						id: pointId,
						vector: embedding,
						payload: {
							filePath: this.workspace.getRelativePath(normalizedAbsolutePath),
							codeChunk: block.content,
							startLine: block.start_line,
							endLine: block.end_line,
							chunkSource: block.chunkSource,
							type: block.type,
							identifier: block.identifier,
							parentChain: block.parentChain,
							hierarchyDisplay: block.hierarchyDisplay,
						},
					}
				},

				getFilesToDelete: (blocks) => {
					// Get files that need to be deleted (modified files, not new ones) + explicit deletions
					const uniqueFilePaths = Array.from(new Set(
						blocks
							.map(block => block.file_path)
							.filter(filePath => {
								const fileInfo = fileInfoMap.get(filePath)
								return fileInfo && !fileInfo.isNew // Only modified files (not new)
							})
					))
					// Convert all paths to relative paths for deletion
					const relativeDeletePaths = filesToDelete.map(path => this.workspace.getRelativePath(path))
					const relativeUpdatePaths = uniqueFilePaths.map(path => this.workspace.getRelativePath(path))
					return [...relativeDeletePaths, ...relativeUpdatePaths]
				},

				onProgress: (processed, total) => {
					this.eventBus.emit('batch-progress', {
						processedInBatch: processed,
						totalInBatch: total,
					})
				},

				onError: (error) => {
					console.error("[FileWatcher] Batch processing error:", error)
				}
			}

			const result = await this.batchProcessor.processBatch(
				blocksToUpsert,
				options
			)

			// Add BatchProcessor results to our batch results
			batchResults.push(...result.processedFiles)
		} else if (this.vectorStore && filesToDelete.length > 0) {
			console.log(`[FileWatcher] Processing batch of ${filesToDelete.length} deletions without embedder`)
			// Handle deletions even without embedder - convert to relative paths
			const relativeDeletePaths = filesToDelete.map(path => this.workspace.getRelativePath(path))
			try {
				await this.vectorStore.deletePointsByMultipleFilePaths(relativeDeletePaths)
				for (const filePath of filesToDelete) {
					this.cacheManager.deleteHash(filePath)
					batchResults.push({ path: filePath, status: "success" })
				}
			} catch (error) {
				console.error("[FileWatcher] Error deleting points for files:", filesToDelete, error)
				for (const filePath of filesToDelete) {
					batchResults.push({ path: filePath, status: "error", error: error as Error })
				}
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
			const relativeFilePath = this.workspace.getRelativePath(filePath)
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
					const normalizedAbsolutePath = this.pathUtils.normalize(this.pathUtils.resolve(block.file_path))
					const stableName = `${normalizedAbsolutePath}:${block.start_line}`
					const pointId = uuidv5(stableName, QDRANT_CODE_BLOCK_NAMESPACE)

					return {
						id: pointId,
						vector: embeddings[index],
						payload: {
							filePath: this.workspace.getRelativePath(normalizedAbsolutePath),
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
