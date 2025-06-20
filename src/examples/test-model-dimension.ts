#!/usr/bin/env node

/**
 * Test script to check model dimension function
 */

import { getModelDimension } from '../shared/embeddingModels'

async function main() {
  console.log('🧪 Testing getModelDimension function...')
  
  const testCases = [
    { provider: 'ollama' as const, modelId: 'nomic-embed-text' },
    { provider: 'ollama' as const, modelId: 'nomic-embed-text:latest' },
    { provider: 'openai' as const, modelId: 'text-embedding-ada-002' },
  ]
  
  for (const testCase of testCases) {
    const dimension = getModelDimension(testCase.provider, testCase.modelId)
    console.log(`${testCase.provider}/${testCase.modelId}: ${dimension}`)
  }
}

// Run the test
if (require.main === module) {
  main().catch(console.error)
}

export { main as testModelDimension }