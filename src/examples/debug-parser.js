import { loadRequiredLanguageParsers } from '../../dist/index.js';

async function test() {
  console.log('Testing parser loading...');
  
  const testFiles = [
    '/Users/anrgct/workspace/autodev-workbench/packages/codebase/demo/config.json',
    '/Users/anrgct/workspace/autodev-workbench/packages/codebase/demo/hello.js',
    '/Users/anrgct/workspace/autodev-workbench/packages/codebase/demo/utils.py'
  ];
  
  try {
    const parsers = await loadRequiredLanguageParsers(testFiles);
    console.log('Success! Loaded parsers:', Object.keys(parsers));
  } catch (error) {
    console.error('Error loading parsers:', error.message);
    console.error('Stack:', error.stack);
  }
}

test().catch(console.error);