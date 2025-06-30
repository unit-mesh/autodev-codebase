import { describe, it, expect, beforeEach } from "vitest"
import { OpenAICompatibleEmbedder } from "../openai-compatible"

/**
 * Integration tests for OpenAI Compatible Embedder with real API calls
 * These tests make actual HTTP requests to the SiliconFlow API
 *
 * Note: These tests are skipped by default to avoid making unnecessary API calls
 * during regular test runs. To run these tests, use: npx vitest run --reporter=verbose
 * and remove the .skip from describe.skip
 */
describe.skip("OpenAICompatibleEmbedder Integration Tests", () => {
	let embedder: OpenAICompatibleEmbedder

	const testBaseUrl = "https://api.siliconflow.cn/v1"
	const testApiKey = "sk-xxxxx"
	const testModelId = "Qwen/Qwen3-Embedding-4B"

	beforeEach(() => {
		embedder = new OpenAICompatibleEmbedder(testBaseUrl, testApiKey, testModelId)
	})

	describe("Real API calls", () => {
		it("should create embeddings for a single text", async () => {
			const testTexts = ["Hello, world! This is a test sentence for embedding."]

			const result = await embedder.createEmbeddings(testTexts)

			expect(result).toBeDefined()
			expect(result.embeddings).toHaveLength(1)
			expect(result.embeddings[0]).toBeInstanceOf(Array)
			expect(result.embeddings[0].length).toBeGreaterThan(0)
			expect(result.usage).toBeDefined()
			expect(result.usage.promptTokens).toBeGreaterThan(0)
			expect(result.usage.totalTokens).toBeGreaterThan(0)

			// Log the results for manual verification
			console.log("Single text embedding result:")
			console.log(`- Embedding dimensions: ${result.embeddings[0].length}`)
			console.log(`- Usage: ${JSON.stringify(result.usage)}`)
			console.log(`- First 5 embedding values: [${result.embeddings[0].slice(0, 5).join(", ")}...]`)
		}, 10000) // 10 second timeout for API call

		it("should create embeddings for multiple texts", async () => {
			const testTexts = [
				"This is the first test sentence.",
				"This is the second test sentence with different content.",
				"A third sentence to test batch processing."
			]

			const result = await embedder.createEmbeddings(testTexts)

			expect(result).toBeDefined()
			expect(result.embeddings).toHaveLength(3)

			// Check that all embeddings have the same dimensions
			const firstEmbeddingLength = result.embeddings[0].length
			expect(firstEmbeddingLength).toBeGreaterThan(0)

			result.embeddings.forEach((embedding, index) => {
				expect(embedding).toBeInstanceOf(Array)
				expect(embedding.length).toBe(firstEmbeddingLength)
				expect(embedding.every(val => typeof val === 'number')).toBe(true)
			})

			expect(result.usage).toBeDefined()
			expect(result.usage.promptTokens).toBeGreaterThan(0)
			expect(result.usage.totalTokens).toBeGreaterThan(0)

			// Log the results for manual verification
			console.log("Multiple texts embedding result:")
			console.log(`- Number of embeddings: ${result.embeddings.length}`)
			console.log(`- Embedding dimensions: ${firstEmbeddingLength}`)
			console.log(`- Usage: ${JSON.stringify(result.usage)}`)

			result.embeddings.forEach((embedding, index) => {
				console.log(`- Text ${index + 1} first 3 values: [${embedding.slice(0, 3).join(", ")}...]`)
			})
		}, 15000) // 15 second timeout for API call

		it("should handle Chinese text correctly", async () => {
			const testTexts = [
				"你好，世界！这是一个中文测试句子。",
				"人工智能是未来科技发展的重要方向。"
			]

			const result = await embedder.createEmbeddings(testTexts)

			expect(result).toBeDefined()
			expect(result.embeddings).toHaveLength(2)
			expect(result.embeddings[0].length).toBeGreaterThan(0)
			expect(result.embeddings[1].length).toBe(result.embeddings[0].length)
			expect(result.usage.promptTokens).toBeGreaterThan(0)

			// Log the results for manual verification
			console.log("Chinese text embedding result:")
			console.log(`- Embedding dimensions: ${result.embeddings[0].length}`)
			console.log(`- Usage: ${JSON.stringify(result.usage)}`)
		}, 10000)

		it("should handle mixed language text", async () => {
			const testTexts = [
				"Hello world, 你好世界, Bonjour le monde, こんにちは世界"
			]

			const result = await embedder.createEmbeddings(testTexts)

			expect(result).toBeDefined()
			expect(result.embeddings).toHaveLength(1)
			expect(result.embeddings[0].length).toBeGreaterThan(0)
			expect(result.usage.promptTokens).toBeGreaterThan(0)

			console.log("Mixed language embedding result:")
			console.log(`- Embedding dimensions: ${result.embeddings[0].length}`)
			console.log(`- Usage: ${JSON.stringify(result.usage)}`)
		}, 10000)

		it("should handle code snippets", async () => {
			const testTexts = [
				`function fibonacci(n) {
					if (n <= 1) return n;
					return fibonacci(n - 1) + fibonacci(n - 2);
				}`,
				`def quicksort(arr):
					if len(arr) <= 1:
						return arr
					pivot = arr[len(arr) // 2]
					left = [x for x in arr if x < pivot]
					middle = [x for x in arr if x == pivot]
					right = [x for x in arr if x > pivot]
					return quicksort(left) + middle + quicksort(right)`
			]

			const result = await embedder.createEmbeddings(testTexts)

			expect(result).toBeDefined()
			expect(result.embeddings).toHaveLength(2)
			expect(result.embeddings[0].length).toBeGreaterThan(0)
			expect(result.embeddings[1].length).toBe(result.embeddings[0].length)

			console.log("Code snippets embedding result:")
			console.log(`- Embedding dimensions: ${result.embeddings[0].length}`)
			console.log(`- Usage: ${JSON.stringify(result.usage)}`)
		}, 15000)

		it("should use custom model when specified", async () => {
			const testTexts = ["Test sentence for custom model."]
			const customModel = "BAAI/bge-large-zh-v1.5" // Alternative model available on SiliconFlow

			try {
				const result = await embedder.createEmbeddings(testTexts, customModel)

				expect(result).toBeDefined()
				expect(result.embeddings).toHaveLength(1)
				expect(result.embeddings[0].length).toBeGreaterThan(0)

				console.log("Custom model embedding result:")
				console.log(`- Model used: ${customModel}`)
				console.log(`- Embedding dimensions: ${result.embeddings[0].length}`)
				console.log(`- Usage: ${JSON.stringify(result.usage)}`)
			} catch (error) {
				// If the custom model is not available, log the error but don't fail the test
				console.log(`Custom model ${customModel} may not be available:`, error)
				expect(error).toBeDefined()
			}
		}, 10000)

		it("should handle longer text content", async () => {
			const longText = `
				Artificial Intelligence (AI) is intelligence demonstrated by machines,
				in contrast to the natural intelligence displayed by humans and animals.
				Leading AI textbooks define the field as the study of "intelligent agents":
				any device that perceives its environment and takes actions that maximize
				its chance of achieving its goals. Colloquially, the term "artificial intelligence"
				is often used to describe machines that mimic "cognitive" functions that humans
				associate with the human mind, such as "learning" and "problem solving".

				As machines become increasingly capable, tasks considered to require "intelligence"
				are often removed from the definition of AI, a phenomenon known as the AI effect.
				A quip in Tesler's Theorem says "AI is whatever hasn't been done yet."
				For instance, optical character recognition is frequently excluded from things
				considered to be AI, having become a routine technology.
			`.trim()

			const result = await embedder.createEmbeddings([longText])

			expect(result).toBeDefined()
			expect(result.embeddings).toHaveLength(1)
			expect(result.embeddings[0].length).toBeGreaterThan(0)
			expect(result.usage.promptTokens).toBeGreaterThan(50) // Should have many tokens for long text

			console.log("Long text embedding result:")
			console.log(`- Text length: ${longText.length} characters`)
			console.log(`- Embedding dimensions: ${result.embeddings[0].length}`)
			console.log(`- Usage: ${JSON.stringify(result.usage)}`)
		}, 10000)

		it("should handle empty text gracefully", async () => {
			const result = await embedder.createEmbeddings([])

			expect(result).toBeDefined()
			expect(result.embeddings).toHaveLength(0)
			expect(result.usage.promptTokens).toBe(0)
			expect(result.usage.totalTokens).toBe(0)
		})
	})

	describe("Error handling with real API", () => {
		it("should handle invalid API key", async () => {
			const invalidEmbedder = new OpenAICompatibleEmbedder(
				testBaseUrl,
				"invalid-api-key",
				testModelId
			)

			await expect(invalidEmbedder.createEmbeddings(["test"]))
				.rejects.toThrow()
		}, 10000)

		it("should handle invalid model", async () => {
			const testTexts = ["Test sentence."]
			const invalidModel = "non-existent-model"

			await expect(embedder.createEmbeddings(testTexts, invalidModel))
				.rejects.toThrow()
		}, 10000)

		it("should handle invalid base URL", async () => {
			const invalidEmbedder = new OpenAICompatibleEmbedder(
				"https://invalid-api-endpoint.com/v1",
				testApiKey,
				testModelId
			)

			await expect(invalidEmbedder.createEmbeddings(["test"]))
				.rejects.toThrow()
		}, 10000)
	})
})
