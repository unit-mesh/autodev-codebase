#!/usr/bin/env node

/**
 * Test script to check if the scanner functionality works
 */

import path from 'path'

async function main() {
  console.log('🧪 Testing p-limit import...')
  
  try {
    const { default: pLimit } = await import('p-limit')
    console.log('✅ p-limit import successful')
    
    const limiter = pLimit(2)
    
    const tasks = [
      limiter(() => Promise.resolve('task 1')),
      limiter(() => Promise.resolve('task 2')),
      limiter(() => Promise.resolve('task 3'))
    ]
    
    const results = await Promise.all(tasks)
    console.log('✅ p-limit functionality works:', results)
    
  } catch (error) {
    console.error('❌ p-limit test failed:', error)
  }
}

// Run the test
if (require.main === module) {
  main().catch(console.error)
}

export { main as testScanner }