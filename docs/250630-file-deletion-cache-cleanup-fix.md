# 文件删除时缓存清理问题修复

## 问题描述

在文件监控中发生删除事件时，向量数据库可以正确删除对应的数据，但是 `.autodev-cache/workspaces` 下面的缓存没有对应删除。

## 问题分析

### 缓存架构回顾

系统中的缓存分为两部分：
1. **哈希缓存文件**: `.autodev-cache/workspaces/{workspace-hash}/roo-index-cache-{workspace-hash}.json`
   - 存储文件哈希映射，用于检测文件是否需要重新处理
   - 键使用**绝对路径**
2. **向量数据库**: Qdrant
   - 存储所有代码块的向量嵌入
   - 使用**相对路径**进行文件级别的删除操作

### 根本原因

路径格式不匹配导致缓存清理失败：

1. **缓存存储时** (`updateHash`):
   - `CodeBlock.file_path` 设置为绝对路径
   - 缓存键使用绝对路径

2. **缓存删除时** (`deleteHash`):
   - `batch-processor.ts` 从 `getFilesToDelete()` 接收到**相对路径**
   - 但缓存中的键是**绝对路径**
   - 导致 `delete this.fileHashes[filePath]` 无法找到对应的键

### 具体问题位置

**`file-watcher.ts:331-344`** - `getFilesToDelete` 返回相对路径：
```typescript
const relativeDeletePaths = filesToDelete.map(path => this.workspace.getRelativePath(path))
const relativeUpdatePaths = uniqueFilePaths.map(path => this.workspace.getRelativePath(path))
return [...relativeDeletePaths, ...relativeUpdatePaths]
```

**`batch-processor.ts:90`** - 使用相对路径删除缓存：
```typescript
for (const filePath of filesToDelete) {
    options.cacheManager.deleteHash(filePath)  // filePath 是相对路径，但缓存键是绝对路径！
}
```

## 解决方案

### 设计原则

保持各组件的职责分离：
- **向量数据库**: 继续使用相对路径
- **缓存管理**: 继续使用绝对路径
- **添加路径转换机制**: 在需要时进行路径格式转换

### 实现步骤

#### 1. 扩展 `BatchProcessorOptions` 接口

在 `src/code-index/processors/batch-processor.ts` 中添加路径转换函数：

```typescript
export interface BatchProcessorOptions<T> {
    // ... 现有属性
    
    // 新增：路径转换函数（相对路径 -> 绝对路径，用于缓存删除）
    relativeCachePathToAbsolute?: (relativePath: string) => string
}
```

#### 2. 修改删除逻辑

在 `batch-processor.ts` 的 `handleDeletions` 方法中：

```typescript
private async handleDeletions<T>(
    filesToDelete: string[],
    options: BatchProcessorOptions<T>,
    result: BatchProcessingResult
): Promise<void> {
    try {
        await options.vectorStore.deletePointsByMultipleFilePaths(filesToDelete)
        
        // 清理缓存时使用路径转换
        for (const filePath of filesToDelete) {
            // 如果提供了转换函数，将相对路径转换为绝对路径
            const cacheFilePath = options.relativeCachePathToAbsolute ? 
                options.relativeCachePathToAbsolute(filePath) : filePath
            options.cacheManager.deleteHash(cacheFilePath)
            result.processedFiles.push({
                path: filePath,
                status: "success"
            })
        }
    } catch (error) {
        // ... 错误处理
    }
}
```

#### 3. 提供路径转换实现

在 `file-watcher.ts` 中为 `BatchProcessor` 提供转换函数：

```typescript
const options: BatchProcessorOptions<CodeBlock> = {
    // ... 现有配置
    
    getFilesToDelete: (blocks) => {
        // ... 现有逻辑，返回相对路径给向量数据库
        const relativeDeletePaths = filesToDelete.map(path => this.workspace.getRelativePath(path))
        const relativeUpdatePaths = uniqueFilePaths.map(path => this.workspace.getRelativePath(path))
        return [...relativeDeletePaths, ...relativeUpdatePaths]
    },

    // 新增：相对路径转绝对路径的转换函数
    relativeCachePathToAbsolute: (relativePath: string) => {
        return this.pathUtils.resolve(this.workspacePath, relativePath)
    },
    
    // ... 其他配置
}
```

## 验证方法

1. **创建测试文件**，触发文件监控
2. **删除文件**，检查：
   - 向量数据库中对应的点是否被删除
   - `.autodev-cache/workspaces/{hash}/roo-index-cache-{hash}.json` 中对应的哈希条目是否被移除
3. **确认缓存文件内容**，验证删除的文件路径不再存在于哈希映射中

## 相关文件

- `src/code-index/processors/batch-processor.ts` - 批处理器核心逻辑
- `src/code-index/processors/file-watcher.ts` - 文件监控和事件处理
- `src/code-index/cache-manager.ts` - 缓存管理器
- `src/code-index/processors/parser.ts` - 代码解析器（设置 file_path）

## 经验总结

1. **路径一致性**: 在多组件系统中，确保路径格式的一致性至关重要
2. **职责分离**: 不同组件可能需要不同的路径格式，应该在边界处进行适当转换
3. **调试技巧**: 通过追踪数据流（路径的创建、传递、使用）可以快速定位问题
4. **测试重要性**: 文件删除这种破坏性操作需要彻底测试，确保缓存一致性

## 注意事项

- 该修复保持了向后兼容性，`relativeCachePathToAbsolute` 是可选的
- 其他调用 `batch-processor` 的地方（如 `DirectoryScanner`）如果不提供转换函数，会使用原有行为
- 直接调用 `cacheManager.deleteHash()` 的地方（如 `file-watcher.ts:378`）已经使用正确的绝对路径，无需修改