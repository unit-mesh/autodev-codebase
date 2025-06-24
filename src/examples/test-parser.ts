import { loadRequiredLanguageParsers } from '../tree-sitter/languageParser'

async function testParserLoading() {
  console.log('🧪 Testing parser loading...')
  
  const testFiles = [
    '/Users/anrgct/workspace/autodev-workbench/packages/codebase/demo/config.json',
    '/Users/anrgct/workspace/autodev-workbench/packages/codebase/demo/hello.js', 
    '/Users/anrgct/workspace/autodev-workbench/packages/codebase/demo/utils.py'
  ]
  
  console.log('📁 Test files:', testFiles)
  
  try {
    const parsers = await loadRequiredLanguageParsers(testFiles)
    console.log('✅ Success! Loaded parsers:', Object.keys(parsers))
    
    // Test each parser
    for (const [ext, parser] of Object.entries(parsers)) {
      console.log(`🔍 Parser for ${ext}:`, {
        hasParser: !!parser.parser,
        hasQuery: !!parser.query
      })
    }
  } catch (error) {
    console.error('❌ Error loading parsers:', error instanceof Error ? error.message : String(error))
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace available')
  }
}

testParserLoading().catch(console.error)