#!/usr/bin/env node

// Set environment variables to disable react-devtools-core
process.env['NODE_ENV'] = process.env['NODE_ENV'] || 'production';

// Comprehensive browser globals polyfill for Node.js
global.self = global;
global.window = global;
global.document = {};
global.navigator = { userAgent: 'Node.js' };

import React from 'react';
import { render } from 'ink';
import { parseArgs, printHelp } from './cli/args-parser';

// CLI entry point
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Dynamic import to avoid loading TUI dependencies for library usage
  const { createTUIApp } = await import('./cli/tui-runner');
  const TUIApp = createTUIApp(options);
  
  render(React.createElement(TUIApp), {
    patchConsole: false,
    debug: false
  });
}

main().catch((error) => {
  console.error('Failed to start TUI:', error);
  process.exit(1);
});
