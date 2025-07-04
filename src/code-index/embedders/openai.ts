import { OpenAI } from "openai"
import { ApiHandlerOptions } from "../../shared/api"
import { IEmbedder, EmbeddingResponse, EmbedderInfo } from "../interfaces/embedder"
import {
	MAX_BATCH_TOKENS,
	MAX_ITEM_TOKENS,
	MAX_BATCH_RETRIES as MAX_RETRIES,
	INITIAL_RETRY_DELAY_MS as INITIAL_DELAY_MS,
} from "../constants"
import { fetch, ProxyAgent } from "undici"

/**
 * OpenAI implementation of the embedder interface with batching and rate limiting
 */
export class OpenAiEmbedder implements IEmbedder {
	private embeddingsClient: OpenAI
	private readonly defaultModelId: string

	/**
	 * Creates a new OpenAI embedder
	 * @param options API handler options
	 */
	constructor(options: ApiHandlerOptions & { openAiEmbeddingModelId?: string }) {
		const apiKey = options.openAiNativeApiKey ?? "not-provided"

		// 检查环境变量中的代理设置
		const httpsProxy = process.env['HTTPS_PROXY'] || process.env['https_proxy']
		const httpProxy = process.env['HTTP_PROXY'] || process.env['http_proxy']

		// OpenAI API 使用 HTTPS，所以优先使用 HTTPS 代理
		const proxyUrl = httpsProxy || httpProxy

		let dispatcher: any = undefined
		if (proxyUrl) {
			try {
				dispatcher = new ProxyAgent(proxyUrl)
				console.log('✓ OpenAI using undici ProxyAgent:', proxyUrl)
			} catch (error) {
				console.error('✗ Failed to create undici ProxyAgent for OpenAI:', error)
			}
		} else {
			// console.log('ℹ No proxy configured for OpenAI')
		}

		const clientConfig: any = {
			apiKey,
			dangerouslyAllowBrowser: true,
		}
		if (dispatcher) {
			clientConfig.fetch = (url: string, init?: any) => {
				return fetch(url, {
					...init,
					dispatcher
				})
			}
			console.log('📝 调试: OpenAI客户端将使用 undici ProxyAgent 代理')
		} else {
			clientConfig.fetch = fetch
			// console.log('📝 调试: OpenAI客户端不使用代理 (undici)')
		}

		this.embeddingsClient = new OpenAI(clientConfig)
		this.defaultModelId = options.openAiEmbeddingModelId || "text-embedding-3-small"
	}

	/**
	 * Creates embeddings for the given texts with batching and rate limiting
	 * @param texts Array of text strings to embed
	 * @param model Optional model identifier
	 * @returns Promise resolving to embedding response
	 */
	async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
		const modelToUse = model || this.defaultModelId
		const allEmbeddings: number[][] = []
		const usage = { promptTokens: 0, totalTokens: 0 }
		const remainingTexts = [...texts]

		while (remainingTexts.length > 0) {
			const currentBatch: string[] = []
			let currentBatchTokens = 0
			const processedIndices: number[] = []

			for (let i = 0; i < remainingTexts.length; i++) {
				const text = remainingTexts[i]
				const itemTokens = Math.ceil(text.length / 4)

				if (itemTokens > MAX_ITEM_TOKENS) {
					console.warn(
						`Text at index ${i} exceeds maximum token limit (${itemTokens} > ${MAX_ITEM_TOKENS}). Skipping.`,
					)
					processedIndices.push(i)
					continue
				}

				if (currentBatchTokens + itemTokens <= MAX_BATCH_TOKENS) {
					currentBatch.push(text)
					currentBatchTokens += itemTokens
					processedIndices.push(i)
				} else {
					break
				}
			}

			// Remove processed items from remainingTexts (in reverse order to maintain correct indices)
			for (let i = processedIndices.length - 1; i >= 0; i--) {
				remainingTexts.splice(processedIndices[i], 1)
			}

			if (currentBatch.length > 0) {
				try {
					const batchResult = await this._embedBatchWithRetries(currentBatch, modelToUse)
					allEmbeddings.push(...batchResult.embeddings)
					usage.promptTokens += batchResult.usage.promptTokens
					usage.totalTokens += batchResult.usage.totalTokens
				} catch (error) {
					console.error("Failed to process batch:", error)
					throw new Error("Failed to create embeddings: batch processing error")
				}
			}
		}

		return { embeddings: allEmbeddings, usage }
	}

	/**
	 * Helper method to handle batch embedding with retries and exponential backoff
	 * @param batchTexts Array of texts to embed in this batch
	 * @param model Model identifier to use
	 * @returns Promise resolving to embeddings and usage statistics
	 */
	private async _embedBatchWithRetries(
		batchTexts: string[],
		model: string,
	): Promise<{ embeddings: number[][]; usage: { promptTokens: number; totalTokens: number } }> {
		for (let attempts = 0; attempts < MAX_RETRIES; attempts++) {
			try {
				const response = await this.embeddingsClient.embeddings.create({
					input: batchTexts,
					model: model,
				})

				return {
					embeddings: response.data.map((item) => item.embedding),
					usage: {
						promptTokens: response.usage?.prompt_tokens || 0,
						totalTokens: response.usage?.total_tokens || 0,
					},
				}
			} catch (error: any) {
				const isRateLimitError = error?.status === 429
				const hasMoreAttempts = attempts < MAX_RETRIES - 1

				if (isRateLimitError && hasMoreAttempts) {
					const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempts)
					await new Promise((resolve) => setTimeout(resolve, delayMs))
					continue
				}

				throw error
			}
		}

		throw new Error(`Failed to create embeddings after ${MAX_RETRIES} attempts`)
	}

	get embedderInfo(): EmbedderInfo {
		return {
			name: "openai",
		}
	}
}
