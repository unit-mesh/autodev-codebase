import React from 'react';
import { render } from 'ink';
import { parseArgs, printHelp } from './cli/args-parser';
import { CodeIndexManager } from './code-index/manager';

// CLI entry point - exported for use by cli.ts
export async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Add cleanup on process exit to dispose singleton instances
  const cleanup = () => {
    try {
      CodeIndexManager.disposeAll();
    } catch (error) {
      // Ignore cleanup errors during exit
    }
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    cleanup();
    process.exit(1);
  });

  // console.log('CLI options: ', options);

  if (options.mcpServer) {
    // Pure MCP server mode - no TUI interaction to avoid stdin conflicts
    const { startMCPServerMode } = await import('./cli/tui-runner');
    await startMCPServerMode(options);
  } else if (options.stdioAdapter) {
    // Stdio adapter mode - bridge stdio to HTTP/SSE
    const { startStdioAdapterMode } = await import('./cli/tui-runner');
    await startStdioAdapterMode(options);
  } else {
    // Traditional TUI-only mode
    const { createTUIApp } = await import('./cli/tui-runner');
    const TUIApp = createTUIApp(options);

    let renderConfig = {
      patchConsole: true,
      debug: false
    }

    // This will enable console patching and debug mode
    // renderConfig = {
    //   patchConsole: false,
    //   debug: true
    // }

    render(React.createElement(TUIApp), renderConfig);
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
