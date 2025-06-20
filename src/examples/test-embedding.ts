#!/usr/bin/env node

/**
 * Test script to check if embedding functionality works
 */

import { CodeIndexOllamaEmbedder } from '../code-index/embedders/ollama'

async function main() {
  console.log('🧪 Testing Ollama embedding...')
  
  try {
    const embedder = new CodeIndexOllamaEmbedder({
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaModelId: 'nomic-embed-text'
    })
    
    console.log('✅ Embedder created')
    
    const texts = ['Hello world', 'This is a test']
    const response = await embedder.createEmbeddings(texts)
    
    console.log('✅ Embedding successful')
    console.log('Number of embeddings:', response.embeddings.length)
    console.log('First embedding dimensions:', response.embeddings[0].length)
    
  } catch (error) {
    console.error('❌ Embedding test failed:', error)
  }
}

// Run the test
if (require.main === module) {
  main().catch(console.error)
}

export { main as testEmbedding }