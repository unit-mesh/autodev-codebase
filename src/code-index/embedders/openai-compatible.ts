import { OpenAI } from "openai"
import { IEmbedder, EmbeddingResponse, EmbedderInfo } from "../interfaces/embedder"
import {
	MAX_BATCH_TOKENS,
	MAX_ITEM_TOKENS,
	MAX_BATCH_RETRIES as MAX_RETRIES,
	INITIAL_RETRY_DELAY_MS as INITIAL_DELAY_MS,
} from "../constants"
import { getDefaultModelId } from "../../shared/embeddingModels"
import { fetch, ProxyAgent } from "undici"

interface EmbeddingItem {
	embedding: string | number[]
	[key: string]: any
}

interface OpenAIEmbeddingResponse {
	data: EmbeddingItem[]
	usage?: {
		prompt_tokens?: number
		total_tokens?: number
	}
}

/**
 * OpenAI Compatible implementation of the embedder interface with batching and rate limiting.
 * This embedder allows using any OpenAI-compatible API endpoint by specifying a custom baseURL.
 */
export class OpenAICompatibleEmbedder implements IEmbedder {
	private embeddingsClient: OpenAI
	private readonly defaultModelId: string

	/**
	 * Creates a new OpenAI Compatible embedder
	 * @param baseUrl The base URL for the OpenAI-compatible API endpoint
	 * @param apiKey The API key for authentication
	 * @param modelId Optional model identifier (defaults to "text-embedding-3-small")
	 */
	constructor(baseUrl: string, apiKey: string, modelId?: string) {
		if (!baseUrl) {
			throw new Error("Base URL is required for OpenAI Compatible embedder")
		}
		if (!apiKey) {
			throw new Error("API key is required for OpenAI Compatible embedder")
		}

		// 检查环境变量中的代理设置
		const httpsProxy = process.env['HTTPS_PROXY'] || process.env['https_proxy']
		const httpProxy = process.env['HTTP_PROXY'] || process.env['http_proxy']

		// 根据目标 URL 协议选择合适的代理
		const proxyUrl = baseUrl.startsWith('https:') ? httpsProxy : (httpProxy || httpsProxy)

		let dispatcher: any = undefined
		if (proxyUrl) {
			try {
				dispatcher = new ProxyAgent(proxyUrl)
				console.log('✓ OpenAI Compatible using undici ProxyAgent:', proxyUrl)
			} catch (error) {
				console.error('✗ Failed to create undici ProxyAgent for OpenAI Compatible:', error)
			}
		} else {
			// console.log('ℹ No proxy configured for OpenAI Compatible')
		}

		// 调试OpenAI客户端配置
		const clientConfig: any = {
			baseURL: baseUrl,
			apiKey: apiKey,
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
			console.log('📝 调试: OpenAI客户端不使用代理 (undici)')
		}

		this.embeddingsClient = new OpenAI(clientConfig)
		this.defaultModelId = modelId || getDefaultModelId("openai-compatible")
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
				const response = (await this.embeddingsClient.embeddings.create({
					input: batchTexts,
					model: model,
					// OpenAI package (as of v4.78.1) has a parsing issue that truncates embedding dimensions to 256
					// when processing numeric arrays, which breaks compatibility with models using larger dimensions.
					// By requesting base64 encoding, we bypass the package's parser and handle decoding ourselves.
					encoding_format: "base64",
				})) as OpenAIEmbeddingResponse

				// Convert base64 embeddings to float32 arrays
				const processedEmbeddings: EmbeddingItem[] = []
				const invalidIndices: number[] = []

				response.data.forEach((item: EmbeddingItem, index: number) => {
					if (typeof item.embedding === "string") {
						try {
							// Validate base64 format
							const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/
							if (!base64Pattern.test(item.embedding)) {
								throw new Error(`Invalid base64 format at index ${index}: ${item.embedding.substring(0, 100)}...`)
							}

							const buffer = Buffer.from(item.embedding, "base64")


							// Validate buffer length is divisible by 4 (Float32 size)
							if (buffer.length % 4 !== 0) {
								throw new Error(`Buffer length ${buffer.length} not divisible by 4 at index ${index}`)
							}

							// Create Float32Array view over the buffer
							const float32Array = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)


							// Check for NaN values
							const nanCount = Array.from(float32Array).filter(x => Number.isNaN(x)).length
							if (nanCount > 0) {
								console.warn(`[WARN] Invalid embedding data at index ${index}, using fallback`)

								invalidIndices.push(index)
								processedEmbeddings.push({
									...item,
									embedding: [], // Placeholder, will be replaced
								})
								return
							}

							processedEmbeddings.push({
								...item,
								embedding: Array.from(float32Array),
							})
						} catch (error) {
							console.error(`Base64 decoding error at embedding index ${index}:`, error)
							console.error(`Embedding data type:`, typeof item.embedding)
							console.error(`Embedding data length:`, item.embedding?.length)
							console.error(`Embedding preview:`, item.embedding?.substring(0, 200))
							invalidIndices.push(index)
							processedEmbeddings.push({
								...item,
								embedding: [], // Placeholder, will be replaced
							})
							return
						}
					} else {
						processedEmbeddings.push(item)
					}
				})

				// Handle invalid embeddings by generating fallbacks
				if (invalidIndices.length > 0) {
					console.warn(`[WARN] Generated ${invalidIndices.length} fallback embeddings for invalid data`)

					// Get dimension from first valid embedding
					const validEmbedding = processedEmbeddings.find(item =>
						Array.isArray(item.embedding) && item.embedding.length > 0
					)
					const dimension = validEmbedding?.embedding?.length || 1536 // Fallback to 1536

					for (const invalidIndex of invalidIndices) {
						const fallbackEmbedding = Array.from({ length: dimension }, () =>
							(Math.random() - 0.5) * 0.001
						)
						processedEmbeddings[invalidIndex].embedding = fallbackEmbedding
					}
				}

				// Replace the original data with processed embeddings
				response.data = processedEmbeddings

				const embeddings = response.data.map((item) => item.embedding as number[])
				return {
					embeddings: embeddings,
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
					console.warn(`Rate limit hit, retrying in ${delayMs}ms (attempt ${attempts + 1}/${MAX_RETRIES})`)
					await new Promise((resolve) => setTimeout(resolve, delayMs))
					continue
				}

				// Log the error for debugging
				console.error(`OpenAI Compatible embedder error (attempt ${attempts + 1}/${MAX_RETRIES}):`, error)

				if (!hasMoreAttempts) {
					throw new Error(
						`Failed to create embeddings after ${MAX_RETRIES} attempts: ${error.message || error}`,
					)
				}

				throw error
			}
		}

		throw new Error(`Failed to create embeddings after ${MAX_RETRIES} attempts`)
	}

	/**
	 * Returns information about this embedder
	 */
	get embedderInfo(): EmbedderInfo {
		return {
			name: "openai-compatible",
		}
	}
}
