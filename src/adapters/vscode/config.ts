import * as vscode from 'vscode'
import { IConfigProvider, EmbedderConfig, VectorStoreConfig, SearchConfig, CodeIndexConfig, ConfigSnapshot } from '../../abstractions/config'
import { EmbedderProvider } from '../../code-index/interfaces/manager'

/**
 * VSCode configuration adapter implementing IConfigProvider interface
 */
export class VSCodeConfigProvider implements IConfigProvider {
  constructor(
    private readonly workspace: typeof vscode.workspace = vscode.workspace,
    private readonly configSection: string = 'autodev'
  ) {}

  async getEmbedderConfig(): Promise<EmbedderConfig> {
    const config = this.workspace.getConfiguration(this.configSection)
    
    return {
      provider: config.get<EmbedderProvider>('embedder.provider', 'openai'),
      modelId: config.get<string>('embedder.modelId'),
      openAiOptions: config.get('embedder.openAi'),
      ollamaOptions: config.get('embedder.ollama'),
      openAiCompatibleOptions: config.get('embedder.openAiCompatible')
    }
  }

  async getVectorStoreConfig(): Promise<VectorStoreConfig> {
    const config = this.workspace.getConfiguration(this.configSection)
    
    return {
      qdrantUrl: config.get<string>('vectorStore.qdrant.url'),
      qdrantApiKey: config.get<string>('vectorStore.qdrant.apiKey')
    }
  }

  isCodeIndexEnabled(): boolean {
    const config = this.workspace.getConfiguration(this.configSection)
    return config.get<boolean>('codeIndex.enabled', false)
  }

  async getSearchConfig(): Promise<SearchConfig> {
    const config = this.workspace.getConfiguration(this.configSection)
    
    return {
      minScore: config.get<number>('search.minScore', 0.5),
      maxResults: config.get<number>('search.maxResults', 10)
    }
  }

  async getConfig(): Promise<CodeIndexConfig> {
    return this.getFullConfig()
  }

  onConfigChange(callback: (config: CodeIndexConfig) => void): () => void {
    const disposable = this.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration(this.configSection)) {
        const config = await this.getFullConfig()
        callback(config)
      }
    })

    return () => disposable.dispose()
  }

  /**
   * Get complete configuration object
   */
  async getFullConfig(): Promise<CodeIndexConfig> {
    const [embedderConfig, vectorStoreConfig, searchConfig] = await Promise.all([
      this.getEmbedderConfig(),
      this.getVectorStoreConfig(),
      this.getSearchConfig()
    ])

    return {
      isEnabled: this.isCodeIndexEnabled(),
      isConfigured: this.isConfigured(embedderConfig, vectorStoreConfig),
      embedderProvider: embedderConfig.provider,
      modelId: embedderConfig.modelId,
      openAiOptions: embedderConfig.openAiOptions,
      ollamaOptions: embedderConfig.ollamaOptions,
      openAiCompatibleOptions: embedderConfig.openAiCompatibleOptions,
      qdrantUrl: vectorStoreConfig.qdrantUrl,
      qdrantApiKey: vectorStoreConfig.qdrantApiKey,
      searchMinScore: searchConfig.minScore
    }
  }

  /**
   * Create configuration snapshot for restart detection
   */
  async getConfigSnapshot(): Promise<ConfigSnapshot> {
    const config = await this.getFullConfig()
    
    return {
      enabled: config.isEnabled,
      configured: config.isConfigured,
      embedderProvider: config.embedderProvider,
      modelId: config.modelId,
      openAiKey: config.openAiOptions?.apiKey,
      ollamaBaseUrl: config.ollamaOptions?.baseUrl,
      openAiCompatibleBaseUrl: config.openAiCompatibleOptions?.baseUrl,
      openAiCompatibleApiKey: config.openAiCompatibleOptions?.apiKey,
      openAiCompatibleModelDimension: config.openAiCompatibleOptions?.modelDimension,
      qdrantUrl: config.qdrantUrl,
      qdrantApiKey: config.qdrantApiKey
    }
  }

  private isConfigured(embedderConfig: EmbedderConfig, vectorStoreConfig: VectorStoreConfig): boolean {
    // Check if embedder is configured
    const embedderConfigured = this.isEmbedderConfigured(embedderConfig)
    
    // Check if vector store is configured (if using external vector store)
    const vectorStoreConfigured = vectorStoreConfig.qdrantUrl ? !!vectorStoreConfig.qdrantUrl : true
    
    return embedderConfigured && vectorStoreConfigured
  }

  private isEmbedderConfigured(config: EmbedderConfig): boolean {
    switch (config.provider) {
      case 'openai':
        return !!(config.openAiOptions?.apiKey)
      case 'ollama':
        return !!(config.ollamaOptions?.baseUrl)
      case 'openai-compatible':
        return !!(config.openAiCompatibleOptions?.baseUrl && config.openAiCompatibleOptions?.apiKey)
      default:
        return false
    }
  }
}