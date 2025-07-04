/**
 * Node.js Config Provider Adapter
 * Implements IConfigProvider using JSON configuration files
 */
import * as path from 'path'
import { IConfigProvider, EmbedderConfig, VectorStoreConfig, SearchConfig } from '../../abstractions/config'
import { CodeIndexConfig, OllamaEmbedderConfig } from '../../code-index/interfaces/config'
import { EmbedderProvider } from '../../code-index/interfaces/manager'
import { IFileSystem, IEventBus } from '../../abstractions/core'

export interface NodeConfigOptions {
  configPath?: string
  defaultConfig?: Partial<CodeIndexConfig>
  cliOverrides?: {
    ollamaUrl?: string
    model?: string
    qdrantUrl?: string
  }
}

// Default configuration constants
const DEFAULT_CONFIG: CodeIndexConfig = {
  isEnabled: true,
  isConfigured: true,
  embedder: {
    provider: "ollama",
    model: "dengcao/Qwen3-Embedding-0.6B:Q8_0",
    dimension: 1024,
    baseUrl: "http://localhost:11434",
  }
}


export class NodeConfigProvider implements IConfigProvider {
  private configPath: string
  private config: CodeIndexConfig | null = null
  private changeCallbacks: Array<(config: CodeIndexConfig) => void> = []
  private cliOverrides: NodeConfigOptions['cliOverrides']

  constructor(
    private fileSystem: IFileSystem,
    private eventBus: IEventBus,
    options: NodeConfigOptions = {}
  ) {
    this.configPath = options.configPath || './autodev-config.json'
    this.cliOverrides = options.cliOverrides

    // Set default configuration
    this.config = {
      ...DEFAULT_CONFIG,
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
      modelId: DEFAULT_CONFIG.embedder.model
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
    // console.log(`Attempting to load config from: ${this.configPath}`)
    try {
      if (await this.fileSystem.exists(this.configPath)) {
        const content = await this.fileSystem.readFile(this.configPath)
        const text = new TextDecoder().decode(content)
        const fileConfig = JSON.parse(text)


        this.config = {
          ...DEFAULT_CONFIG,
          ...fileConfig
        }

        // Apply CLI overrides
        if (this.cliOverrides && this.config) {
          if (this.cliOverrides.ollamaUrl && 'baseUrl' in this.config.embedder) {
            this.config.embedder.baseUrl = this.cliOverrides.ollamaUrl
          }
          if (this.cliOverrides.model && this.cliOverrides.model.trim()) {
            this.config.embedder.model = this.cliOverrides.model
          }
          if (this.cliOverrides.qdrantUrl) {
            this.config.qdrantUrl = this.cliOverrides.qdrantUrl
          }
        }

        // Auto-determine isConfigured based on provider requirements
        this.config!.isConfigured = this.isConfigured()
      }
    } catch (error) {
      console.warn(`Failed to load config from ${this.configPath}:`, error)
    }

    // Apply CLI overrides even if config file doesn't exist
    if (this.cliOverrides && this.config) {
      if (this.cliOverrides.ollamaUrl && 'baseUrl' in this.config.embedder) {
        this.config.embedder.baseUrl = this.cliOverrides.ollamaUrl
      }
      if (this.cliOverrides.model && this.cliOverrides.model.trim()) {
        this.config.embedder.model = this.cliOverrides.model
      }
      if (this.cliOverrides.qdrantUrl) {
        this.config.qdrantUrl = this.cliOverrides.qdrantUrl
      }
    }

    // console.log(`Current configuration:`, this.config, DEFAULT_CONFIG)
    return this.config || { ...DEFAULT_CONFIG }
  }


  /**
   * Save configuration to file
   */
  async saveConfig(config: Partial<CodeIndexConfig>): Promise<void> {
    try {
      const newConfig: CodeIndexConfig = {
        ...DEFAULT_CONFIG,
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
    await this.saveConfig({ ...DEFAULT_CONFIG })
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
