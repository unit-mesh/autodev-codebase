const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const typescript = require('@rollup/plugin-typescript');

module.exports = {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.js',
      format: 'esm',
      sourcemap: true,
    },
    {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
    }
  ],
  external: (id) => {
    // Externalize vscode and its submodules
    if (id === 'vscode' || id.startsWith('vscode/')) {
      return true;
    }
    // Externalize Node.js built-ins that shouldn't be bundled
    if (['fs', 'path', 'child_process', 'readline', 'crypto', 'os', 'stream', 'util'].includes(id)) {
      return true;
    }
    // Bundle everything else (including fzf, tslib, etc.)
    return false;
  },
  plugins: [
    resolve({
      preferBuiltins: true,
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.lib.json',
      declaration: true,
      declarationDir: './dist',
      rootDir: './src',
    }),
  ],
};
