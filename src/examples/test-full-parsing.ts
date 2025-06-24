import { loadRequiredLanguageParsers } from '../tree-sitter/languageParser'
import { CodeParser } from '../code-index/processors/parser'
import { createNodeDependencies } from '../adapters/nodejs'
import * as fs from 'fs'

async function testFullParsing() {
  console.log('🧪 Testing full parsing pipeline...')
  
  const testFiles = [
    '/Users/anrgct/workspace/autodev-workbench/packages/codebase/demo/config.json',
    '/Users/anrgct/workspace/autodev-workbench/packages/codebase/demo/hello.js', 
    '/Users/anrgct/workspace/autodev-workbench/packages/codebase/demo/utils.py'
  ]
  
  try {
    // Test 1: Load parsers
    console.log('1️⃣ Loading parsers...')
    const parsers = await loadRequiredLanguageParsers(testFiles)
    console.log('✅ Parsers loaded:', Object.keys(parsers))
    
    // Test 2: Create parser
    console.log('\n2️⃣ Creating CodeParser...')
    const codeParser = new CodeParser()
    
    // Test 3: Parse each file
    console.log('\n3️⃣ Parsing individual files...')
    for (const filePath of testFiles) {
      try {
        console.log(`\n📄 Parsing ${filePath.split('/').pop()}...`)
        
        const result = await codeParser.parseFile(filePath, {
          // 可添加解析选项
        })
        console.log(`   ✅ Parsed successfully:`, {
          blocks: result.length
        })
        
        if (result.length > 0) {
          console.log(`   📝 First block:`, result[0])
        }
      } catch (error) {
        console.error(`   ❌ Error parsing ${filePath}:`, error instanceof Error ? error.message : String(error))
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : String(error))
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace available')
  }
}

testFullParsing().catch(console.error)