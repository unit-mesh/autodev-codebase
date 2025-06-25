import React from 'react';
import { render } from 'ink';
import { parseArgs, printHelp } from './cli/args-parser';

// CLI entry point - exported for use by cli.ts
export async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // console.log('CLI options: ', options);
  
  if (options.mcpServer) {
    // Pure MCP server mode - no TUI interaction to avoid stdin conflicts
    const { startMCPServerMode } = await import('./cli/tui-runner');
    await startMCPServerMode(options);
  } else {
    // Traditional TUI-only mode
    const { createTUIApp } = await import('./cli/tui-runner');
    const TUIApp = createTUIApp(options);

    render(React.createElement(TUIApp), {
      patchConsole: true, 
      debug: false
    });
  }
}
if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
     main();
}

// Library exports
export * from './code-index';
export * from './abstractions';
export * from './adapters/nodejs';
export * from './glob';
export * from './search';
export * from './tree-sitter';
export * from './lib/codebase';
