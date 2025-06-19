/**
 * Simple runner for nodejs-usage examples
 */
import { basicUsageExample, advancedUsageExample, cliExample } from './nodejs-usage'

async function main() {
  const command = process.argv[2] || 'basic'

  switch (command) {
    case 'basic':
      await basicUsageExample()
      break
    case 'advanced':
      await advancedUsageExample()
      break
    case 'cli':
      await cliExample()
      break
    default:
      console.log('Usage: npx ts-node src/examples/run-example.ts [basic|advanced|cli]')
  }
}

main().catch(console.error)
