/**
 * Node.js Config Provider Adapter
 * Implements IConfigProvider using JSON configuration files
 */
import * as path from 'path'
import { IConfigProvider, EmbedderConfig, VectorStoreConfig, SearchConfig, CodeIndexConfig } from '../../abstractions/config'
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
      embedderProvider: "openai",
      ...options.defaultConfig
    }
  }

  async getEmbedderConfig(): Promise<EmbedderConfig> {
    const config = await this.loadConfig()
    return {
      provider: config.embedderProvider,
      modelId: config.modelId,
      openAiOptions: config.openAiOptions,
      ollamaOptions: config.ollamaOptions,
      openAiCompatibleOptions: config.openAiCompatibleOptions
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

        this.config = {
          isEnabled: false,
          isConfigured: false,
          embedderProvider: "openai",
          ...fileConfig
        }
      }
    } catch (error) {
      console.warn(`Failed to load config from ${this.configPath}:`, error)
    }

    return this.config!
  }

  /**
   * Save configuration to file
   */
  async saveConfig(config: Partial<CodeIndexConfig>): Promise<void> {
    try {
      const newConfig: CodeIndexConfig = { 
        isEnabled: true,
        isConfigured: true,
        embedderProvider: 'openai' as const,
        modelId: 'text-embedding-ada-002',
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
      embedderProvider: "openai"
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
   * Validate configuration completeness
   */
  async validateConfig(): Promise<{ isValid: boolean; errors: string[] }> {
    const config = await this.loadConfig()
    const errors: string[] = []

    if (!config.isEnabled) {
      return { isValid: true, errors: [] } // Disabled config is valid
    }

    // Validate embedder configuration
    switch (config.embedderProvider) {
      case "openai":
        if (!config.openAiOptions?.apiKey) {
          errors.push('OpenAI API key is required')
        }
        break
      case "ollama":
        if (!config.ollamaOptions?.ollamaBaseUrl) {
          errors.push('Ollama base URL is required')
        }
        break
      case "openai-compatible":
        if (!config.openAiCompatibleOptions?.baseUrl) {
          errors.push('OpenAI Compatible base URL is required')
        }
        if (!config.openAiCompatibleOptions?.apiKey) {
          errors.push('OpenAI Compatible API key is required')
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
