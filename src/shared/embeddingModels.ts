// Stub implementation for embedding models
export type EmbedderProvider = 'openai' | 'ollama' | 'openai-compatible'

export function getDefaultModelId(): string {
  return 'text-embedding-ada-002'
}

export function getModelDimension(modelId: string): number {
  // Default dimension for most embedding models
  return 1536
}