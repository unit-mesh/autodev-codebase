npx vitest run src/ripgrep/__tests__/index.spec.ts
npx vitest run src/__tests__/core-library.test.ts
npx vitest run src/__tests__/nodejs-adapters.test.ts
npx ts-node --transpile-only src/examples/run-example.ts basic
npx tsc --noEmit src/examples/nodejs-usage.ts
tsc --noEmit -p tsconfig.lib.json
