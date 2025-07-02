/**
 * Node.js Config Provider Adapter
 * Implements IConfigProvider using JSON configuration files
 */
import * as path from 'path'
import { IConfigProvider, EmbedderConfig, VectorStoreConfig, SearchConfig } from '../../abstractions/config'
import { CodeIndexConfig } from '../../code-index/interfaces/config'
import { EmbedderProvider } from '../../code-index/interfaces/manager'
import { IFileSystem, IEventBus } from '../../abstractions/core'

export interface NodeConfigOptions {
  configPath?: string
  defaultConfig?: Partial<CodeIndexConfig>
}

export class NodeConfigProvider implements IConfigProvider {
  private configPath: string
  private config: CodeIndexConfig | null = null
  private changeCallbacks: Array<(config: CodeIndexConfig) => void> = []

  constructor(
    private fileSystem: IFileSystem,
    private eventBus: IEventBus,
    options: NodeConfigOptions = {}
  ) {
    this.configPath = options.configPath || './autodev-config.json'

    // Set default configuration
    this.config = {
      isEnabled: false,
      isConfigured: false,
      embedder: {
        provider: "openai",
        apiKey: "",
        model: "text-embedding-3-small",
        dimension: 1536
      },
      ...options.defaultConfig
    }
  }

  async getEmbedderConfig(): Promise<EmbedderConfig> {
    const config = await this.loadConfig()
    // Convert new config structure to legacy format for compatibility
    if (config.embedder.provider === "openai") {
      return {
        provider: "openai",
        modelId: config.embedder.model,
        openAiOptions: {
          apiKey: config.embedder.apiKey,
          openAiNativeApiKey: config.embedder.apiKey
        }
      }
    } else if (config.embedder.provider === "ollama") {
      return {
        provider: "ollama",
        modelId: config.embedder.model,
        ollamaOptions: {
          ollamaBaseUrl: config.embedder.baseUrl
        }
      }
    } else if (config.embedder.provider === "openai-compatible") {
      return {
        provider: "openai-compatible",
        modelId: config.embedder.model,
        openAiCompatibleOptions: {
          baseUrl: config.embedder.baseUrl,
          apiKey: config.embedder.apiKey,
          modelDimension: config.embedder.dimension
        }
      }
    }
    
    // Fallback
    return {
      provider: "ollama",
      modelId: "nomic-embed-text"
    }
  }

  async getVectorStoreConfig(): Promise<VectorStoreConfig> {
    const config = await this.loadConfig()
    return {
      qdrantUrl: config.qdrantUrl,
      qdrantApiKey: config.qdrantApiKey
    }
  }

  isCodeIndexEnabled(): boolean {
    return this.config?.isEnabled || false
  }

  async getSearchConfig(): Promise<SearchConfig> {
    const config = await this.loadConfig()
    return {
      minScore: config.searchMinScore,
      maxResults: 50 // Default max results
    }
  }

  async getConfig(): Promise<CodeIndexConfig> {
    return this.loadConfig()
  }

  onConfigChange(callback: (config: CodeIndexConfig) => void): () => void {
    this.changeCallbacks.push(callback)

    // Return unsubscribe function
    return () => {
      const index = this.changeCallbacks.indexOf(callback)
      if (index > -1) {
        this.changeCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Load configuration from file
   */
  async loadConfig(): Promise<CodeIndexConfig> {
    try {
      if (await this.fileSystem.exists(this.configPath)) {
        const content = await this.fileSystem.readFile(this.configPath)
        const text = new TextDecoder().decode(content)
        const fileConfig = JSON.parse(text)

        // Handle legacy configuration format migration
        if (fileConfig.embedderProvider && !fileConfig.embedder) {
          fileConfig.embedder = this.migrateLegacyConfig(fileConfig)
        }

        this.config = {
          isEnabled: false,
          isConfigured: false,
          embedder: {
            provider: "ollama",
            apiKey: "",
            model: "nomic-embed-text",
            dimension: 768
          },
          ...fileConfig
        }

        // Auto-determine isConfigured based on provider requirements
        this.config!.isConfigured = this.isConfigured()
      }
    } catch (error) {
      console.warn(`Failed to load config from ${this.configPath}:`, error)
    }

    return this.config || {
      isEnabled: false,
      isConfigured: false,
      embedder: {
        provider: "ollama",
        apiKey: "",
        model: "nomic-embed-text",
        dimension: 768
      }
    }
  }

  /**
   * Migrate legacy configuration format to new structure
   */
  private migrateLegacyConfig(oldConfig: any): any {
    const provider = oldConfig.embedderProvider

    if (provider === "ollama") {
      return {
        provider: "ollama",
        baseUrl: oldConfig.ollamaOptions?.ollamaBaseUrl || "http://localhost:11434",
        model: oldConfig.modelId || oldConfig.ollamaModel || "nomic-embed-text",
        dimension: oldConfig.modelDimension || 768
      }
    } else if (provider === "openai") {
      return {
        provider: "openai",
        apiKey: oldConfig.openAiOptions?.openAiNativeApiKey || "",
        model: oldConfig.modelId || "text-embedding-3-small",
        dimension: oldConfig.modelDimension || 1536
      }
    } else if (provider === "openai-compatible") {
      return {
        provider: "openai-compatible",
        baseUrl: oldConfig.openAiCompatibleOptions?.baseUrl || "",
        apiKey: oldConfig.openAiCompatibleOptions?.apiKey || "",
        model: oldConfig.modelId || "text-embedding-3-small",
        dimension: oldConfig.openAiCompatibleOptions?.modelDimension || 1536
      }
    }

    // Default fallback
    return {
      provider: "ollama",
      apiKey: "",
      model: "nomic-embed-text",
      dimension: 768
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig(config: Partial<CodeIndexConfig>): Promise<void> {
    try {
      const newConfig: CodeIndexConfig = { 
        isEnabled: true,
        isConfigured: true,
        embedder: {
          provider: "ollama",
          apiKey: "",
          model: "nomic-embed-text",
          dimension: 768
        },
        ...this.config, 
        ...config 
      }
      const content = JSON.stringify(newConfig, null, 2)
      const encoded = new TextEncoder().encode(content)

      await this.fileSystem.writeFile(this.configPath, encoded)
      this.config = newConfig

      // Notify listeners
      this.changeCallbacks.forEach(callback => {
        try {
          callback(newConfig)
        } catch (error) {
          console.error('Error in config change callback:', error)
        }
      })

      // Emit event
      this.eventBus.emit('config:changed', newConfig)

    } catch (error) {
      throw new Error(`Failed to save config to ${this.configPath}: ${error}`)
    }
  }

  /**
   * Update a specific configuration value
   */
  async updateConfig<K extends keyof CodeIndexConfig>(
    key: K,
    value: CodeIndexConfig[K]
  ): Promise<void> {
    await this.saveConfig({ [key]: value })
  }

  /**
   * Reset configuration to defaults
   */
  async resetConfig(): Promise<void> {
    const defaultConfig: CodeIndexConfig = {
      isEnabled: false,
      isConfigured: false,
      embedder: {
        provider: "ollama",
        apiKey: "",
        model: "nomic-embed-text",
        dimension: 768
      }
    }

    await this.saveConfig(defaultConfig)
  }

  /**
   * Get the current configuration without reloading
   */
  getCurrentConfig(): CodeIndexConfig | null {
    return this.config
  }

  /**
   * Check if the configuration is complete based on the embedder provider
   */
  private isConfigured(): boolean {
    if (!this.config) {
      return false
    }

    const { embedder, qdrantUrl } = this.config

    // Check embedder configuration
    if (embedder.provider === "openai") {
      if (!embedder.apiKey || !embedder.model || !embedder.dimension) {
        return false
      }
    } else if (embedder.provider === "ollama") {
      if (!embedder.baseUrl || !embedder.model || !embedder.dimension) {
        return false
      }
    } else if (embedder.provider === "openai-compatible") {
      if (!embedder.baseUrl || !embedder.apiKey || !embedder.model || !embedder.dimension) {
        return false
      }
    }

    // Check Qdrant configuration
    if (!qdrantUrl) {
      return false
    }

    return true
  }

  /**
   * Validate configuration completeness
   */
  async validateConfig(): Promise<{ isValid: boolean; errors: string[] }> {
    const config = await this.loadConfig()
    const errors: string[] = []

    if (!config.isEnabled) {
      return { isValid: true, errors: [] } // Disabled config is valid
    }

    // Validate embedder configuration
    const { embedder } = config
    switch (embedder.provider) {
      case "openai":
        if (!embedder.apiKey) {
          errors.push('OpenAI API key is required')
        }
        if (!embedder.model) {
          errors.push('OpenAI model is required')
        }
        if (!embedder.dimension || embedder.dimension <= 0) {
          errors.push('OpenAI model dimension is required and must be positive')
        }
        break
      case "ollama":
        if (!embedder.baseUrl) {
          errors.push('Ollama base URL is required')
        }
        if (!embedder.model) {
          errors.push('Ollama model is required')
        }
        if (!embedder.dimension || embedder.dimension <= 0) {
          errors.push('Ollama model dimension is required and must be positive')
        }
        break
      case "openai-compatible":
        if (!embedder.baseUrl) {
          errors.push('OpenAI Compatible base URL is required')
        }
        if (!embedder.apiKey) {
          errors.push('OpenAI Compatible API key is required')
        }
        if (!embedder.model) {
          errors.push('OpenAI Compatible model is required')
        }
        if (!embedder.dimension || embedder.dimension <= 0) {
          errors.push('OpenAI Compatible model dimension is required and must be positive')
        }
        break
    }

    // Validate vector store configuration
    if (!config.qdrantUrl) {
      errors.push('Qdrant URL is required')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }
}
