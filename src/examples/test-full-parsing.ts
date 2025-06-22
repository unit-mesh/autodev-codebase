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
    
    // Test 2: Create dependencies and parser
    console.log('\n2️⃣ Creating CodeParser...')
    const deps = createNodeDependencies('/Users/anrgct/workspace/autodev-workbench/packages/codebase/demo')
    const codeParser = new CodeParser(deps)
    
    // Test 3: Parse each file
    console.log('\n3️⃣ Parsing individual files...')
    for (const filePath of testFiles) {
      try {
        console.log(`\n📄 Parsing ${filePath.split('/').pop()}...`)
        const content = fs.readFileSync(filePath, 'utf-8')
        console.log(`   Content length: ${content.length} chars`)
        
        const result = await codeParser.parseContent(filePath, content)
        console.log(`   ✅ Parsed successfully:`, {
          definitions: result.definitions.length,
          blocks: result.blocks.length
        })
        
        if (result.definitions.length > 0) {
          console.log(`   📝 First definition:`, result.definitions[0])
        }
      } catch (error) {
        console.error(`   ❌ Error parsing ${filePath}:`, error.message)
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error('Stack:', error.stack)
  }
}

testFullParsing().catch(console.error)