// Core library
export * from './lib/codebase'

// Core abstractions - Platform-agnostic interfaces
export * from './abstractions'

// VSCode adapters factory (optional - check availability before using)
export { createVSCodeAdapters, isVSCodeAvailable } from './adapters/vscode/factory'

// Node.js adapters factory (for Node.js environments)
export * from './adapters/nodejs'

// Note: Additional modules (code-index, tree-sitter, search, glob) are available
// but may have external dependencies that need to be resolved in the consuming application
// 
// To include them, uncomment the following lines after resolving dependencies:
// export * from './code-index'
// export * from './tree-sitter'
// export * from './glob'
// export * from './search'
