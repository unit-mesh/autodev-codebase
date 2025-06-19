#!/usr/bin/env node

/**
 * Simple demo runner that can be executed directly
 * This compiles and runs the TypeScript demo
 */

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

async function main() {
  console.log('🚀 AutoDev Codebase Demo Runner')
  console.log('=' .repeat(40))

  // Check if we need to build first
  const distExists = fs.existsSync('./dist')
  if (!distExists) {
    console.log('📦 Building project first...')
    await runCommand('npm', ['run', 'build'])
    console.log('✅ Build complete')
  }

  // Check dependencies
  console.log('🔍 Checking dependencies...')
  
  // Check if Ollama is running
  try {
    const response = await fetch('http://localhost:11434/api/tags')
    if (response.ok) {
      const data = await response.json()
      console.log('✅ Ollama is running')
      console.log('📋 Available models:', data.models?.map(m => m.name).join(', ') || 'None')
    }
  } catch (error) {
    console.log('❌ Ollama not accessible at http://localhost:11434')
    console.log('   Please start Ollama: ollama serve')
    console.log('   And install embedding model: ollama pull nomic-embed-text')
  }

  // Check if Qdrant is running
  try {
    const response = await fetch('http://localhost:6333/collections')
    if (response.ok) {
      console.log('✅ Qdrant is running')
    }
  } catch (error) {
    console.log('❌ Qdrant not accessible at http://localhost:6333')
    console.log('   Please start Qdrant with Docker:')
    console.log('   docker run -p 6333:6333 qdrant/qdrant')
  }

  console.log('\n🎯 Starting demo...')
  console.log('=' .repeat(40))

  // Run the compiled demo
  const demoPath = './dist/src/examples/run-demo.js'
  if (fs.existsSync(demoPath)) {
    await runCommand('node', [demoPath], { stdio: 'inherit' })
  } else {
    console.error('❌ Demo file not found. Please run: npm run build')
    process.exit(1)
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: options.stdio || 'pipe',
      shell: true,
      ...options
    })

    let stdout = ''
    let stderr = ''

    if (proc.stdout) {
      proc.stdout.on('data', (data) => {
        stdout += data.toString()
        if (options.stdio !== 'inherit') {
          process.stdout.write(data)
        }
      })
    }

    if (proc.stderr) {
      proc.stderr.on('data', (data) => {
        stderr += data.toString()
        if (options.stdio !== 'inherit') {
          process.stderr.write(data)
        }
      })
    }

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`))
      }
    })

    proc.on('error', reject)
  })
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Demo stopped')
  process.exit(0)
})

main().catch(error => {
  console.error('❌ Demo failed:', error)
  process.exit(1)
})