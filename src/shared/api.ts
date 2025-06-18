// Stub implementation for API handler options
export interface ApiHandlerOptions {
  openAiNativeApiKey?: string
  ollamaBaseUrl?: string
  [key: string]: any
}

export interface BaseApiHandler {
  options: ApiHandlerOptions
}