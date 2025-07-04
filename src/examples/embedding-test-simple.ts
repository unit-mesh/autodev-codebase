import { MemoryVectorSearch } from './memory-vector-search'

// 解决undici连接池导致程序不退出的问题
import { getGlobalDispatcher } from 'undici'

// 模拟的npm包数据 - 扩展测试集，避免名字暗示
const mockPackages = [
  // 构建工具 - 名字无明显暗示
  { id: 'parcel', content: 'node_modules/parcel', metadata: { type: 'build-tool' } },
  { id: 'turbo', content: 'node_modules/turbo', metadata: { type: 'build-tool' } },
  { id: 'rome', content: 'node_modules/rome', metadata: { type: 'build-tool' } },
  { id: 'swc', content: 'node_modules/swc', metadata: { type: 'build-tool' } },

  // 测试框架 - 避免test关键词
  { id: 'mocha', content: 'node_modules/mocha', metadata: { type: 'test-framework' } },
  { id: 'jasmine', content: 'node_modules/jasmine', metadata: { type: 'test-framework' } },
  { id: 'ava', content: 'node_modules/ava', metadata: { type: 'test-framework' } },
  { id: 'tap', content: 'node_modules/tap', metadata: { type: 'test-framework' } },

  // 代码质量工具 - 非直接命名
  { id: 'standard', content: 'node_modules/standard', metadata: { type: 'linter' } },
  { id: 'biome', content: 'node_modules/biome', metadata: { type: 'linter' } },

  // 框架 - 简短抽象名称
  { id: 'vue', content: 'node_modules/vue', metadata: { type: 'framework' } },
  { id: 'react', content: 'node_modules/react', metadata: { type: 'framework' } },
  { id: 'svelte', content: 'node_modules/svelte', metadata: { type: 'framework' } },
  { id: 'solid', content: 'node_modules/solid', metadata: { type: 'framework' } },
  { id: 'qwik', content: 'node_modules/qwik', metadata: { type: 'framework' } },

  // 状态管理 - 抽象命名
  { id: 'redux', content: 'node_modules/redux', metadata: { type: 'state-management' } },
  { id: 'zustand', content: 'node_modules/zustand', metadata: { type: 'state-management' } },
  { id: 'jotai', content: 'node_modules/jotai', metadata: { type: 'state-management' } },
  { id: 'recoil', content: 'node_modules/recoil', metadata: { type: 'state-management' } },

  // 包管理器 - 避免package关键词
  { id: 'pnpm', content: '/usr/local/bin/pnpm', metadata: { type: 'package-manager' } },
  { id: 'yarn', content: '/usr/local/bin/yarn', metadata: { type: 'package-manager' } },
  { id: 'bun', content: '/usr/local/bin/bun', metadata: { type: 'package-manager' } },

  // 运行时/工具 - 简短名称
  { id: 'deno', content: '/usr/local/bin/deno', metadata: { type: 'runtime' } },
  { id: 'node', content: '/usr/local/bin/node', metadata: { type: 'runtime' } },

  // 数据库工具 - 不明显的名称
  { id: 'prisma', content: 'node_modules/prisma', metadata: { type: 'database' } },
  { id: 'drizzle', content: 'node_modules/drizzle', metadata: { type: 'database' } },
  { id: 'kysely', content: 'node_modules/kysely', metadata: { type: 'database' } }
]
// mockPackages.map(item => {
//   item.content += item.content + '<|endoftext|>'
// });
// 测试查询 - 更多样化的测试场景
const testQueries = [
  { query: 'build tool', expected: ['parcel', 'turbo', 'rome', 'swc'] },
  { query: 'test framework', expected: ['mocha', 'jasmine', 'ava', 'tap'] },
  { query: 'code quality', expected: ['standard', 'biome'] },
  { query: 'ui framework', expected: ['vue', 'svelte', 'solid', 'qwik', 'react'] },
  { query: 'state management', expected: ['redux', 'zustand', 'jotai', 'recoil'] },
  { query: 'package manager', expected: ['pnpm', 'yarn', 'bun'] },
  { query: 'javascript runtime', expected: ['deno', 'node', 'bun'] },
  { query: 'database orm', expected: ['prisma', 'drizzle', 'kysely'] },
  { query: 'bundler', expected: ['parcel', 'turbo', 'swc'] },
  { query: 'frontend framework', expected: ['vue', 'svelte', 'solid', 'qwik'] }
]

async function runEmbeddingTest() {
  console.log('🚀 开始embedding测试...\n')

  const ollamaModelList = {
    // ollamaBaseUrl: 'http://192.168.31.10:11434',
    // ollamaModelId: 'nomic-embed-text', // dimension 768
    // ollamaModelId: 'bge-m3:latest', // dimension 1024
    // ollamaModelId: 'dengcao/Dmeta-embedding-zh:F16', // dimension 768
    // ollamaModelId: 'granite-embedding:278m-fp16', // dimension 768
    // ollamaModelId: 'dengcao/Qwen3-Embedding-0.6B:Q8_0', // dimension 1024
    // ollamaModelId: 'dengcao/Qwen3-Embedding-0.6B:f16', // dimension 1024
    // ollamaModelId: 'dengcao/Qwen3-Embedding-4B:Q4_K_M', // dimension 2560
    // ollamaModelId: 'dengcao/Qwen3-Embedding-4B:Q8_0', // dimension 2560
    // ollamaModelId: 'dengcao/Qwen3-Embedding-8B:Q4_K_M', // dimension 4096
    // ollamaModelId: 'znbang/bge:small-en-v1.5-q8_0', // dimension 384
    // ollamaModelId: 'snowflake-arctic-embed2:568m', // dimension 1024
    // ollamaModelId: 'unclemusclez/jina-embeddings-v2-base-code:latest', // dimension 768
    // ollamaModelId: 'hf.co/nomic-ai/nomic-embed-text-v2-moe-GGUF:f16', // dimension 768
    // ollamaModelId: 'hf.co/nomic-ai/nomic-embed-code-GGUF:Q4_K_M', // dimension 3584
    // ollamaModelId: 'hf.co/taylor-jones/bge-code-v1-Q8_0-GGUF', // lmstudio dimension 1536,
    // ollamaModelId: 'dengcao/bge-reranker-v2-m3', // dimension 1024
    type: 'ollama'
  }
  const openaiModelList = {
    // openaiBaseUrl: 'http://one-api-proxy.orb.local/v1', // oneapi
    openaiBaseUrl: 'http://192.168.31.10:5000/v1', // lmstudio
    openaiApiKey: 'sk-USqYzFUmccukXK0jC392D995Aa4b4a2d9c49892c37E323B7',
    // openaiModel: 'Qwen/Qwen3-Embedding-8B', // dimension 4096
    // openaiModel: 'Qwen/Qwen3-Embedding-4B', // dimension 2560
    // openaiModel: 'Qwen/Qwen3-Embedding-0.6B', // dimension 1024
    // openaiModel: 'Pro/BAAI/bge-m3', // dimension 1024
    // openaiModel: 'BAAI/bge-large-en-v1.5', // dimension 1024
    // openaiModel: 'netease-youdao/bce-embedding-base_v1', // dimension 1024
    // openaiModel: 'morph-embedding-v2', // dimension 1536
    // openaiModel: 'text-embedding-ada-002', // dimension 1536
    // openaiModel: 'text-embedding-3-small', // dimension 1536
    // openaiModel: 'text-embedding-3-large', // dimension 3072
    // openaiModel: 'voyage-3-large', // dimension 1024
    // openaiModel: 'voyage-3.5', // dimension 1024
    // openaiModel: 'voyage-code-3', // dimension 1024
    // openaiModel: 'voyage-3.5-lite', // dimension 1024
    // openaiModel: 'taylor-jones/bge-code-v1-Q8_0-GGUF', // lmstudio dimension 1536
    // openaiModel: 'nomic-ai/nomic-embed-text-v1.5-GGUF@Q4_K_M', // lmstudio dimension 768
    // openaiModel: 'wsxiaoys/jina-embeddings-v2-base-code-Q8_0-GGUF', // lmstudio dimension 768
    // openaiModel: 'awhiteside/CodeRankEmbed-Q8_0-GGUF', // lmstudio dimension 768
    type: 'openai' as const
  }

  // const vectorSearch = new MemoryVectorSearch({
  //   provider: 'ollama',
  //   baseUrl: 'http://localhost:11434',
  //   model: 'dengcao/Qwen3-Embedding-0.6B:Q8_0',
  //   dimension: 1024,
  // })
  const vectorSearch = new MemoryVectorSearch({
    provider: 'openai-compatible',
    apiKey: 'sk-USqYzFUmccukXK0jC392D995Aa4b4a2d9c49892c37E323B7',
    baseUrl: 'http://localhost:2302/v1',
    model: 'Qwen/Qwen3-Embedding-8B',
    dimension: 1024,
  })

  // 添加模拟数据
  console.log('📦 添加模拟包数据...')
  await vectorSearch.addDocuments(mockPackages)
  console.log(`✅ 已添加 ${vectorSearch.getDocumentCount()} 个包\n`)

  // 存储测试结果
  const testResults: Array<{
    query: string
    precision3: number
    precision5: number
    topResult: string
    topScore: number
    foundExpected: number
    totalExpected: number
    firstExpectedHit: string | null
  }> = []

  // 执行测试查询
  for (const testCase of testQueries) {
    console.log(`🔍 查询: "${testCase.query}"`)
    console.log(`📋 期望结果: ${testCase.expected.join(', ')}`)

    const results = await vectorSearch.search(testCase.query, 5)

    console.log('📊 搜索结果:')
    results.forEach((result, index) => {
      const score = (result.score * 100).toFixed(1)
      const isExpected = testCase.expected.includes(result.document.id) ? '✅' : '❌'
      console.log(`  ${index + 1}. ${result.document.id} (${score}%) ${isExpected}`)
    })

    // 计算指标
    const top3 = results.slice(0, 3).map(r => r.document.id)
    const top5 = results.slice(0, 5).map(r => r.document.id)
    const relevantInTop3 = top3.filter(id => testCase.expected.includes(id)).length
    const relevantInTop5 = top5.filter(id => testCase.expected.includes(id)).length
    const precision3 = relevantInTop3 / 3
    const precision5 = relevantInTop5 / 5

    // 查找第一个命中期望的结果
    const firstExpectedHit = results.find(r => testCase.expected.includes(r.document.id))?.document.id || null


    // 存储结果
    testResults.push({
      query: testCase.query,
      precision3: precision3 * 100,
      precision5: precision5 * 100,
      topResult: results[0]?.document.id || 'N/A',
      topScore: results[0]?.score * 100 || 0,
      foundExpected: relevantInTop5,
      totalExpected: testCase.expected.length,
      firstExpectedHit: firstExpectedHit
    })

    console.log(`📈 Precision@3: ${(precision3 * 100).toFixed(1)}% | Precision@5: ${(precision5 * 100).toFixed(1)}%`)
    console.log('---')
  }

  // 测试汇总
  console.log('\n🎯 测试汇总报告')
  console.log('=' .repeat(60))

  const avgPrecision3 = testResults.reduce((sum, r) => sum + r.precision3, 0) / testResults.length
  const avgPrecision5 = testResults.reduce((sum, r) => sum + r.precision5, 0) / testResults.length
  const perfectQueries = testResults.filter(r => r.precision3 >= 66.7).length
  const failedQueries = testResults.filter(r => r.precision3 === 0).length

  console.log(`📊 总体表现:`)
  console.log(`  平均 Precision@3: ${avgPrecision3.toFixed(1)}%`)
  console.log(`  平均 Precision@5: ${avgPrecision5.toFixed(1)}%`)
  console.log(`  表现良好查询: ${perfectQueries}/${testResults.length} (≥66.7%)`)
  console.log(`  完全失败查询: ${failedQueries}/${testResults.length} (0%)`)

  console.log(`\n📋 详细结果:`)
  testResults.forEach((result, index) => {
    const status = result.precision3 >= 66.7 ? '🟢' : result.precision3 > 0 ? '🟡' : '🔴'
    const firstHit = result.firstExpectedHit ? `首个命中: ${result.firstExpectedHit}` : '无命中'
    console.log(`  ${status} ${result.query.padEnd(20)} P@3: ${result.precision3.toFixed(1).padStart(5)}% | 首位: ${result.topResult} (${result.topScore.toFixed(1)}%) ${firstHit}`)
  })

  console.log(`\n🔍 关键洞察:`)
  const bestQuery = testResults.reduce((best, current) => current.precision3 > best.precision3 ? current : best)
  const worstQuery = testResults.reduce((worst, current) => current.precision3 < worst.precision3 ? current : worst)

  console.log(`  最佳查询: "${bestQuery.query}" (${bestQuery.precision3.toFixed(1)}%)`)
  console.log(`  最差查询: "${worstQuery.query}" (${worstQuery.precision3.toFixed(1)}%)`)
  console.log(`  模型对抽象命名包的理解能力有限`)
  console.log(`  字面相似性对结果影响显著`)

  // 强制清理undici连接池，确保程序能够正常退出
  console.log('\n🧹 正在清理网络连接池...')
  try {
    const globalDispatcher = getGlobalDispatcher()
    if (globalDispatcher && typeof globalDispatcher.close === 'function') {
      await globalDispatcher.close()
    }

    // 等待一小段时间让连接完全关闭
    await new Promise(resolve => setTimeout(resolve, 100))

    // 强制退出进程（这是最可靠的方法）
    console.log('✅ 清理完成，程序即将退出')
    process.exit(0)
    globalDispatcher.destroy()

  } catch (error) {
    console.warn('⚠️ 清理连接池时出现警告:', error)
    // 即使清理失败也要退出
    process.exit(0)
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  runEmbeddingTest().catch(console.error)
}

export { runEmbeddingTest }
