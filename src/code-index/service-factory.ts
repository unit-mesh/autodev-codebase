import { OpenAiEmbedder } from "./embedders/openai"
import { CodeIndexOllamaEmbedder } from "./embedders/ollama"
import { OpenAICompatibleEmbedder } from "./embedders/openai-compatible"
import { EmbedderProvider, getDefaultModelId, getModelDimension } from "../shared/embeddingModels"
import { QdrantVectorStore } from "./vector-store/qdrant-client"
import { codeParser, DirectoryScanner, FileWatcher } from "./processors"
import { ICodeParser, IEmbedder, IFileWatcher, IVectorStore } from "./interfaces"
import { CodeIndexConfigManager } from "./config-manager"
import { CacheManager } from "./cache-manager"
import { Ignore } from "ignore"
import { IEventBus, IFileSystem, ILogger } from "../abstractions/core"
import { IWorkspace, IPathUtils } from "../abstractions/workspace"

/**
 * Factory class responsible for creating and configuring code indexing service dependencies.
 */
export class CodeIndexServiceFactory {
	constructor(
		private readonly configManager: CodeIndexConfigManager,
		private readonly workspacePath: string,
		private readonly cacheManager: CacheManager,
		private readonly logger?: ILogger,
	) {}

	/**
	 * Logging helper methods - only log if logger is available
	 */
	private debug(message: string, ...args: any[]): void {
		this.logger?.debug(message, ...args)
	}

	private info(message: string, ...args: any[]): void {
		this.logger?.info(message, ...args)
	}

	private warn(message: string, ...args: any[]): void {
		this.logger?.warn(message, ...args)
	}

	private error(message: string, ...args: any[]): void {
		this.logger?.error(message, ...args)
	}

	/**
	 * Creates an embedder instance based on the current configuration.
	 */
	public createEmbedder(): IEmbedder {
		const config = this.configManager.getConfig()

		const provider = config.embedderProvider as EmbedderProvider

		if (provider === "openai") {
			if (!config.openAiOptions?.openAiNativeApiKey) {
				throw new Error("OpenAI configuration missing for embedder creation")
			}
			return new OpenAiEmbedder({
				...config.openAiOptions,
				openAiEmbeddingModelId: config.modelId,
			})
		} else if (provider === "ollama") {
			if (!config.ollamaOptions?.ollamaBaseUrl) {
				throw new Error("Ollama configuration missing for embedder creation")
			}
			return new CodeIndexOllamaEmbedder({
				...config.ollamaOptions,
				ollamaModelId: config.modelId,
			})
		} else if (provider === "openai-compatible") {
			if (!config.openAiCompatibleOptions?.baseUrl || !config.openAiCompatibleOptions?.apiKey) {
				throw new Error("OpenAI Compatible configuration missing for embedder creation")
			}
			return new OpenAICompatibleEmbedder(
				config.openAiCompatibleOptions.baseUrl,
				config.openAiCompatibleOptions.apiKey,
				config.modelId,
			)
		}

		throw new Error(`Invalid embedder type configured: ${config.embedderProvider}`)
	}

	/**
	 * Creates a vector store instance using the current configuration.
	 */
	public createVectorStore(): IVectorStore {
		const config = this.configManager.getConfig()
		this.debug(`Debug createVectorStore config:`, JSON.stringify(config, null, 2))

		const provider = config.embedderProvider as EmbedderProvider
		const defaultModel = getDefaultModelId(provider)
		// Use the embedding model ID from config, not the chat model IDs
		const modelId = config.modelId ?? defaultModel
		this.debug(`Debug: provider=${provider}, defaultModel=${defaultModel}, modelId=${modelId}`)

		let vectorSize: number | undefined

		if (provider === "openai-compatible") {
			if (config.openAiCompatibleOptions?.modelDimension && config.openAiCompatibleOptions.modelDimension > 0) {
				vectorSize = config.openAiCompatibleOptions.modelDimension
			} else {
				// Fallback if not provided or invalid in openAiCompatibleOptions
				vectorSize = getModelDimension(provider, modelId)
			}
		} else {
			this.debug(`About to call getModelDimension with provider=${provider}, modelId=${modelId}`)
			vectorSize = getModelDimension(provider, modelId)
			this.debug(`After getModelDimension call: vectorSize=${vectorSize}`)
			this.debug(`Debug: provider=${provider}, modelId=${modelId}, vectorSize=${vectorSize}`)
		}

		if (vectorSize === undefined) {
			let errorMessage = `Could not determine vector dimension for model '${modelId}' with provider '${provider}'. `
			if (provider === "openai-compatible") {
				errorMessage += `Please ensure the 'Embedding Dimension' is correctly set in the OpenAI-Compatible provider settings.`
			} else {
				errorMessage += `Check model profiles or configuration.`
			}
			throw new Error(errorMessage)
		}

		if (!config.qdrantUrl) {
			// This check remains important
			throw new Error("Qdrant URL missing for vector store creation")
		}

		// Assuming constructor is updated: new QdrantVectorStore(workspacePath, url, vectorSize, apiKey?)
		return new QdrantVectorStore(this.workspacePath, config.qdrantUrl, vectorSize, config.qdrantApiKey)
	}

	/**
	 * Creates a directory scanner instance with its required dependencies.
	 */
	public createDirectoryScanner(
		embedder: IEmbedder,
		vectorStore: IVectorStore,
		parser: ICodeParser,
		ignoreInstance: Ignore,
		fileSystem: IFileSystem,
		workspace: IWorkspace,
		pathUtils: IPathUtils
	): DirectoryScanner {
		return new DirectoryScanner({
			embedder,
			qdrantClient: vectorStore,
			codeParser: parser,
			cacheManager: this.cacheManager,
			ignoreInstance,
			fileSystem,
			workspace,
			pathUtils,
			logger: this.logger
		})
	}

	/**
	 * Creates a file watcher instance with its required dependencies.
	 */
	public createFileWatcher(
		fileSystem: IFileSystem,
		eventBus: IEventBus,
		embedder: IEmbedder,
		vectorStore: IVectorStore,
		cacheManager: CacheManager,
		ignoreInstance: Ignore,
	): IFileWatcher {
		return new FileWatcher(this.workspacePath, fileSystem, eventBus, cacheManager, embedder, vectorStore, ignoreInstance)
	}

	/**
	 * Creates all required service dependencies if the service is properly configured.
	 * @throws Error if the service is not properly configured
	 */
	public createServices(
		fileSystem: IFileSystem,
		eventBus: IEventBus,
		cacheManager: CacheManager,
		ignoreInstance: Ignore,
		workspace: IWorkspace,
		pathUtils: IPathUtils
	): {
		embedder: IEmbedder
		vectorStore: IVectorStore
		parser: ICodeParser
		scanner: DirectoryScanner
		fileWatcher: IFileWatcher
	} {
		if (!this.configManager.isFeatureConfigured) {
			throw new Error("Cannot create services: Code indexing is not properly configured")
		}

		const embedder = this.createEmbedder()
		const vectorStore = this.createVectorStore()
		const parser = codeParser
		const scanner = this.createDirectoryScanner(embedder, vectorStore, parser, ignoreInstance, fileSystem, workspace, pathUtils)
		const fileWatcher = this.createFileWatcher(fileSystem, eventBus, embedder, vectorStore, cacheManager, ignoreInstance)

		return {
			embedder,
			vectorStore,
			parser,
			scanner,
			fileWatcher,
		}
	}
}
