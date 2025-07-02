# Undici连接池导致Node.js程序无法正常退出的问题及解决方案

## 问题描述

在使用undici作为HTTP客户端的Node.js程序中，程序完成所有任务后无法正常退出，需要等待约1-2分钟才会自动结束。这个问题在使用OpenAI SDK或其他基于undici的HTTP客户端时经常出现。

### 症状表现

- 程序逻辑执行完毕，显示所有结果
- 控制台输出完成，但命令行提示符不返回
- 程序进程仍在运行，占用系统资源
- 需要手动Ctrl+C终止或等待超时自动退出

## 根本原因分析

### 1. Undici连接池保活机制

`undici` 是Node.js的高性能HTTP客户端，为了提高性能，它使用连接池来复用HTTP连接：

```typescript
import { fetch, ProxyAgent } from "undici"

// undici会自动管理连接池
const response = await fetch('http://example.com/api')
```

### 2. 连接保活时间

- 默认情况下，undici会保持连接30秒到2分钟
- 这些连接在Node.js事件循环中注册为活跃句柄(handles)
- 活跃句柄会阻止Node.js进程正常退出

### 3. OpenAI SDK中的undici使用

在OpenAI Compatible Embedder中：

```typescript
// OpenAI SDK内部使用undici进行HTTP请求
this.embeddingsClient = new OpenAI({
    baseURL: baseUrl,
    apiKey: apiKey,
    fetch: fetch  // 使用undici的fetch
})
```

## 解决方案

### 方案1：手动清理连接池（推荐）

```typescript
import { getGlobalDispatcher } from 'undici'

async function cleanupAndExit() {
    // 清理undici连接池，确保程序能够正常退出
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
        
    } catch (error) {
        console.warn('⚠️ 清理连接池时出现警告:', error)
        // 即使清理失败也要退出
        process.exit(0)
    }
}

// 在程序结束时调用
async function main() {
    // 你的主要逻辑
    await doSomeWork()
    
    // 清理并退出
    await cleanupAndExit()
}
```

### 方案2：设置环境变量（部分有效）

```bash
# 设置较短的keep-alive时间
export NODE_ENV=production
export UV_THREADPOOL_SIZE=4
```

### 方案3：使用原生fetch（Node.js 18+）

```typescript
// 如果不需要代理功能，可以使用Node.js原生fetch
const clientConfig = {
    baseURL: baseUrl,
    apiKey: apiKey,
    // 不设置自定义fetch，使用默认的
}

this.embeddingsClient = new OpenAI(clientConfig)
```

## 最佳实践

### 1. 在程序入口处理退出逻辑

```typescript
// main.ts
import { getGlobalDispatcher } from 'undici'

async function gracefulShutdown() {
    console.log('正在清理资源...')
    
    try {
        const dispatcher = getGlobalDispatcher()
        await dispatcher.close()
        console.log('网络连接池已清理')
    } catch (error) {
        console.warn('清理连接池时出现警告:', error)
    }
    
    process.exit(0)
}

// 捕获退出信号
process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)

async function main() {
    try {
        // 主要业务逻辑
        await runApplication()
    } catch (error) {
        console.error('应用程序错误:', error)
    } finally {
        // 确保清理资源
        await gracefulShutdown()
    }
}

main()
```

### 2. 在测试脚本中自动清理

```typescript
// test-script.ts
async function runTest() {
    try {
        // 测试逻辑
        await performTests()
    } finally {
        // 自动清理
        await cleanupAndExit()
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    runTest().catch(console.error)
}
```

### 3. 创建清理工具函数

```typescript
// utils/cleanup.ts
import { getGlobalDispatcher } from 'undici'

export async function cleanupUndiciConnections(timeout = 1000): Promise<void> {
    console.log('🧹 正在清理undici连接池...')
    
    try {
        const dispatcher = getGlobalDispatcher()
        
        if (dispatcher && typeof dispatcher.close === 'function') {
            // 设置超时，避免无限等待
            const cleanupPromise = dispatcher.close()
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('清理超时')), timeout)
            )
            
            await Promise.race([cleanupPromise, timeoutPromise])
        }
        
        // 短暂等待确保清理完成
        await new Promise(resolve => setTimeout(resolve, 100))
        
        console.log('✅ 连接池清理完成')
    } catch (error) {
        console.warn('⚠️ 清理连接池时出现警告:', error)
    }
}

export function forceExit(code = 0): void {
    console.log('🚪 强制退出程序')
    process.exit(code)
}
```

## 性能影响分析

### 清理连接池的开销

- 连接关闭时间：通常 < 100ms
- 内存释放：立即释放连接池占用的内存
- CPU占用：清理过程CPU占用极低

### 不清理的影响

- 程序退出延迟：30秒-2分钟
- 内存占用：连接池持续占用内存
- 资源浪费：保持不必要的网络连接

## 常见错误和调试

### 1. 清理后仍无法退出

```typescript
// 可能原因：还有其他异步操作未完成
// 解决方案：检查是否有其他定时器、监听器等

// 调试方法：查看活跃句柄
process._getActiveHandles().forEach((handle, index) => {
    console.log(`Active handle ${index}:`, handle.constructor.name)
})
```

### 2. 清理时抛出异常

```typescript
// 添加更详细的错误处理
try {
    await dispatcher.close()
} catch (error) {
    console.error('清理失败的详细信息:', {
        name: error.name,
        message: error.message,
        stack: error.stack
    })
    // 即使清理失败也要退出
    process.exit(0)
}
```

### 3. 在不同环境中的表现差异

| 环境 | 表现 | 解决方案 |
|------|------|----------|
| 开发环境 | 等待时间较短 | 仍建议清理 |
| 生产环境 | 等待时间较长 | 必须清理 |
| Docker | 可能无限等待 | 强制退出 |
| CI/CD | 导致流水线超时 | 设置超时+强制退出 |

## 相关工具和监控

### 1. 监控活跃连接

```typescript
// 检查当前活跃的handles数量
console.log('活跃句柄数量:', process._getActiveHandles().length)
console.log('活跃请求数量:', process._getActiveRequests().length)
```

### 2. 设置程序超时

```typescript
// 设置全局超时，防止程序无限挂起
const PROGRAM_TIMEOUT = 60000 // 60秒

setTimeout(() => {
    console.error('⚠️ 程序运行超时，强制退出')
    process.exit(1)
}, PROGRAM_TIMEOUT)
```

### 3. 使用process.exit的替代方案

```typescript
// 优雅退出的完整示例
async function gracefulExit(code = 0) {
    console.log('开始优雅退出...')
    
    // 1. 停止接受新请求
    // 2. 完成当前请求处理
    // 3. 清理资源
    await cleanupUndiciConnections()
    
    // 4. 设置强制退出兜底
    setTimeout(() => {
        console.log('强制退出')
        process.exit(code)
    }, 5000)
    
    // 5. 尝试自然退出
    process.exitCode = code
}
```

## 实际调试经验：Node.js 20 全局 fetch 的 undici 问题

### 问题现象重现

在实际调试过程中，遇到了一个令人困惑的现象：

```typescript
// 即使完全注释掉 undici 相关代码
// import { fetch, ProxyAgent } from "undici"  // 已注释
// const dispatcher = new ProxyAgent(proxyUrl)  // 已注释

// OpenAI客户端仍然无法让程序正常退出
const client = new OpenAI({
    baseURL: 'http://192.168.31.10:5000/v1',
    apiKey: 'your-api-key',
    // 没有设置任何自定义 fetch 或 dispatcher
})
```

### 根本原因发现

通过深度调试发现：**Node.js 20 的全局 `fetch` 函数底层就是使用 undici 实现的！**

```bash
# 验证 Node.js 内置 fetch 的实现
node -e "console.log(globalThis.fetch.toString())"
# 输出：function value(input, init = undefined) {
#   if (!fetchImpl) { // Implement lazy loading of undici module for fetch function
#     const undiciModule = require('internal/deps/undici/undici');
#     fetchImpl = undiciModule.fetch;
#   }
#   return fetchImpl(input, init);
# }
```

### 调试过程详解

#### 1. 资源监控测试

```javascript
// 监控活跃句柄的变化
console.log('使用前句柄数量:', process._getActiveHandles().length); // 2 (stdout/stderr)
const client = new OpenAI({...});
await client.embeddings.create({...});
console.log('使用后句柄数量:', process._getActiveHandles().length); // 2 (没有增加)
```

**意外发现**：活跃句柄数量没有变化，但程序仍然无法退出！

#### 2. Socket 详细分析

```javascript
// 检查具体的 Socket 类型
process._getActiveHandles().forEach((handle, index) => {
    if (handle.constructor.name === 'Socket') {
        console.log(`Socket ${index}:`, {
            isStdout: handle === process.stdout,
            isStderr: handle === process.stderr,
            readyState: handle.readyState,
            destroyed: handle.destroyed
        });
    }
});
```

**结果**：所有 Socket 都是正常的 stdout/stderr，没有额外的网络连接。

#### 3. 关键发现

通过超时测试发现：
```bash
timeout 10s node test-openai.js
# 程序在 10 秒内没有自然退出，需要被强制终止
```

**结论**：即使没有显式的活跃句柄，undici 的内部连接池仍在后台运行，阻止程序退出。

### 深层技术原理

#### Node.js 20 的 fetch 实现链

```
应用代码 → OpenAI SDK → 全局 fetch → Node.js 内置模块 → undici → 连接池
```

即使应用代码中没有直接导入 undici，连接池仍然被创建和维护。

#### 为什么 process._getActiveHandles() 看不到连接？

1. **内部实现差异**：undici 的连接池可能使用了不被 `process._getActiveHandles()` 追踪的内部机制
2. **延迟释放**：连接池有默认的 keep-alive 时间（通常 30 秒到 2 分钟）
3. **事件循环保活**：undici 可能使用了其他方式保持事件循环活跃

### 最终解决方案验证

```typescript
async function cleanupAndExit() {
    console.log('🧹 正在清理网络连接池...')
    try {
        const globalDispatcher = getGlobalDispatcher()
        if (globalDispatcher && typeof globalDispatcher.close === 'function') {
            await globalDispatcher.close()
        }
        
        await new Promise(resolve => setTimeout(resolve, 100))
        
        console.log('✅ 清理完成，程序即将退出')
        process.exit(0)  // 这一行是必需的！
        
    } catch (error) {
        console.warn('⚠️ 清理连接池时出现警告:', error)
        process.exit(0)  // 即使清理失败也要退出
    }
}
```

### 重要教训

1. **表面现象可能误导**：即使注释掉 undici 导入，问题仍然存在
2. **系统级依赖隐蔽**：Node.js 内置模块的依赖关系不够透明  
3. **监控工具局限**：`process._getActiveHandles()` 不能显示所有类型的资源
4. **强制退出必要**：在某些场景下，`process.exit()` 不是 hack，而是正确的解决方案

## 总结

Undici连接池导致程序无法正常退出是一个常见问题，特别是在使用OpenAI SDK等基于undici的库时。通过手动清理连接池和使用`process.exit()`可以有效解决这个问题。

### 关键要点

1. **根本原因**：undici连接池的保活机制（包括Node.js 20内置fetch的undici实现）
2. **隐蔽性强**：即使没有显式导入undici，问题仍然存在
3. **最佳解决方案**：手动清理 + 强制退出
4. **性能影响**：清理开销极小，不清理影响较大
5. **适用场景**：所有使用Node.js 20+内置fetch或undici的程序

### 建议

- 在所有使用undici的项目中添加清理逻辑
- **特别注意**：Node.js 20+ 环境下，即使没有显式使用undici也可能需要清理
- 在程序退出点统一处理资源清理
- 设置合理的超时时间避免无限等待
- 在CI/CD环境中特别注意这个问题
- 不要被表面的监控数据误导，实际测试程序退出行为

---

*文档创建时间：2025年7月2日*  
*最后更新：2025年7月2日*
