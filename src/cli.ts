import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

// Get the directory of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, 'index.js');

// Build the command with polyfills
const cliArgs = process.argv.slice(2);
const command = `
import { fileURLToPath } from 'url';
import { dirname } from 'path';
global.self = global;
global.window = global;
global.document = { createElement: () => ({}), addEventListener: () => {}, removeEventListener: () => {} };
// Fix for Ink color detection - provide proper navigator object for Node.js
Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Node.js',
    userAgentData: {
      brands: [{ brand: 'Chromium', version: '100' }]
    }
  },
  writable: true,
  configurable: true
});

global.HTMLElement = class HTMLElement {};
global.Element = class Element {};
global.addEventListener = () => {};
global.removeEventListener = () => {};
// Set up __dirname for ESM modules
global.__dirname = dirname(fileURLToPath(import.meta.url));
process.env['NODE_ENV'] = process.env['NODE_ENV'] || 'production';
process.env['REACT_EDITOR'] = 'none';
process.env['DISABLE_REACT_DEVTOOLS'] = 'true';

process.argv = [process.argv[0], '${indexPath}', ...${JSON.stringify(cliArgs)}];
await import('${indexPath}').then(({ main }) => main());
`;

// Execute the command with Node.js
const child = spawn('node', ['--input-type=module', '-e', command], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: process.env['NODE_ENV'] || 'production',
    REACT_EDITOR: 'none',
    DISABLE_REACT_DEVTOOLS: 'true'
  }
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error('Failed to start CLI:', error);
  process.exit(1);
});
