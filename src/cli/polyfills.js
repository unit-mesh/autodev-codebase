// Polyfills for browser-only dependencies in Node.js environment
// This must be loaded before any other imports

// Create a minimal polyfill for browser globals used by react-devtools-core
if (typeof global !== 'undefined' && typeof self === 'undefined') {
  global.self = global;
}

// Export to ensure this is treated as a module
export {};