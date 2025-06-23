#!/usr/bin/env node

export interface CliOptions {
  path: string;
  demo: boolean;
  ollamaUrl: string;
  qdrantUrl: string;
  model: string;
  config?: string;
  storage?: string;
  cache?: string;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  help: boolean;
}

export function parseArgs(argv: string[] = process.argv): CliOptions {
  const args = argv.slice(2);
  
  const options: CliOptions = {
    path: process.cwd(),
    demo: false,
    ollamaUrl: 'http://localhost:11434',
    qdrantUrl: 'http://localhost:6333',
    model: 'nomic-embed-text',
    logLevel: 'error',
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--demo') {
      options.demo = true;
    } else if (arg.startsWith('--path=')) {
      options.path = arg.split('=')[1];
    } else if (arg.startsWith('--ollama-url=')) {
      options.ollamaUrl = arg.split('=')[1];
    } else if (arg.startsWith('--qdrant-url=')) {
      options.qdrantUrl = arg.split('=')[1];
    } else if (arg.startsWith('--model=')) {
      options.model = arg.split('=')[1];
    } else if (arg.startsWith('--config=')) {
      options.config = arg.split('=')[1];
    } else if (arg.startsWith('--storage=')) {
      options.storage = arg.split('=')[1];
    } else if (arg.startsWith('--cache=')) {
      options.cache = arg.split('=')[1];
    } else if (arg.startsWith('--log-level=')) {
      const level = arg.split('=')[1] as CliOptions['logLevel'];
      if (['error', 'warn', 'info', 'debug'].includes(level)) {
        options.logLevel = level;
      }
    }
  }

  return options;
}

export function printHelp() {
  console.log(`
@autodev/codebase - Code Analysis TUI

Usage:
  autodev-codebase [options]

Options:
  --path=<path>           Workspace path (default: current directory)
  --demo                  Create demo files in workspace
  
  --ollama-url=<url>      Ollama API URL (default: http://localhost:11434)
  --qdrant-url=<url>      Qdrant vector DB URL (default: http://localhost:6333)
  --model=<model>         Embedding model (default: nomic-embed-text)
  
  --config=<path>         Config file path
  --storage=<path>        Storage directory path
  --cache=<path>          Cache directory path
  --log-level=<level>     Log level: error|warn|info|debug (default: error)
  
  --help, -h              Show this help

Examples:
  autodev-codebase --path=/my/project
  autodev-codebase --demo --log-level=info
  autodev-codebase --path=/workspace --ollama-url=http://remote:11434
`);
}