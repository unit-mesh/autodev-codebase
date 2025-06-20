import { IEmbedder, IVectorStore, PointStruct } from "../interfaces"
import { CacheManager } from "../cache-manager"
import { 
	BATCH_SEGMENT_THRESHOLD, 
	MAX_BATCH_RETRIES, 
	INITIAL_RETRY_DELAY_MS 
} from "../constants"

export interface BatchProcessingResult {
	processed: number
	failed: number
	errors: Error[]
}

export interface BatchProcessorOptions<T> {
	embedder: IEmbedder
	vectorStore: IVectorStore
	cacheManager: CacheManager
	
	// Strategy functions for converting input data
	itemToText: (item: T) => string
	itemToPoint: (item: T, embedding: number[], index: number) => PointStruct
	itemToFilePath: (item: T) => string
	getFileHash?: (item: T) => string
	
	// Optional callbacks
	onProgress?: (processed: number, total: number, currentItem?: string) => void
	onError?: (error: Error) => void
	
	// Optional file deletion logic
	getFilesToDelete?: (items: T[]) => string[]
}

/**
 * Generic batch processor for handling common batch operations:
 * - File deletion from vector store
 * - Embedding generation
 * - Vector store upserts
 * - Cache updates
 * - Retry logic
 */
export class BatchProcessor<T> {
	
	async processBatch(
		items: T[], 
		options: BatchProcessorOptions<T>
	): Promise<BatchProcessingResult> {
		if (items.length === 0) {
			return { processed: 0, failed: 0, errors: [] }
		}

		const result: BatchProcessingResult = { processed: 0, failed: 0, errors: [] }
		
		// Report initial progress
		options.onProgress?.(0, items.length)

		try {
			// Phase 1: Handle deletions if needed
			if (options.getFilesToDelete) {
				const filesToDelete = options.getFilesToDelete(items)
				if (filesToDelete.length > 0) {
					await this.handleDeletions(filesToDelete, options, result)
				}
			}

			// Phase 2: Process items in batches
			await this.processItemsInBatches(items, options, result)

			return result
		} catch (error) {
			const err = error as Error
			result.errors.push(err)
			options.onError?.(err)
			return result
		}
	}

	private async handleDeletions<T>(
		filesToDelete: string[],
		options: BatchProcessorOptions<T>,
		result: BatchProcessingResult
	): Promise<void> {
		try {
			await options.vectorStore.deletePointsByMultipleFilePaths(filesToDelete)
			
			// Clear cache for deleted files
			for (const filePath of filesToDelete) {
				options.cacheManager.deleteHash(filePath)
			}
		} catch (error) {
			const err = error as Error
			result.errors.push(err)
			options.onError?.(err)
			throw err
		}
	}

	private async processItemsInBatches<T>(
		items: T[],
		options: BatchProcessorOptions<T>,
		result: BatchProcessingResult
	): Promise<void> {
		// Process items in segments to avoid memory issues and respect batch limits
		for (let i = 0; i < items.length; i += BATCH_SEGMENT_THRESHOLD) {
			const batchItems = items.slice(i, i + BATCH_SEGMENT_THRESHOLD)
			await this.processSingleBatch(batchItems, options, result, i)
		}
	}

	private async processSingleBatch<T>(
		batchItems: T[],
		options: BatchProcessorOptions<T>,
		result: BatchProcessingResult,
		startIndex: number
	): Promise<void> {
		let attempts = 0
		let success = false
		let lastError: Error | null = null

		while (attempts < MAX_BATCH_RETRIES && !success) {
			attempts++
			
			try {
				// Extract texts for embedding
				const texts = batchItems.map(item => options.itemToText(item))
				
				// Create embeddings
				const { embeddings } = await options.embedder.createEmbeddings(texts)
				
				// Convert to points
				const points = batchItems.map((item, index) => 
					options.itemToPoint(item, embeddings[index], startIndex + index)
				)

				// Upsert to vector store
				await options.vectorStore.upsertPoints(points)

				// Update cache for successfully processed items
				for (const item of batchItems) {
					const filePath = options.itemToFilePath(item)
					const fileHash = options.getFileHash?.(item)
					if (fileHash) {
						options.cacheManager.updateHash(filePath, fileHash)
					}
					
					result.processed++
					options.onProgress?.(result.processed, result.processed + result.failed, filePath)
				}

				success = true
			} catch (error) {
				lastError = error as Error
				console.error(`[BatchProcessor] Error processing batch (attempt ${attempts}):`, error)

				if (attempts < MAX_BATCH_RETRIES) {
					const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempts - 1)
					await new Promise(resolve => setTimeout(resolve, delay))
				}
			}
		}

		if (!success && lastError) {
			result.failed += batchItems.length
			result.errors.push(lastError)
			
			const errorMessage = `Failed to process batch after ${MAX_BATCH_RETRIES} attempts: ${lastError.message}`
			const batchError = new Error(errorMessage)
			result.errors.push(batchError)
			options.onError?.(batchError)
			
			// Still report progress for failed items
			for (const item of batchItems) {
				const filePath = options.itemToFilePath(item)
				options.onProgress?.(result.processed, result.processed + result.failed, filePath)
			}
		}
	}
}