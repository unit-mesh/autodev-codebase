🔍 数据匹配逻辑详解

1. 向量点的唯一标识系统

每个代码块在向量数据库中都有一个唯一的ID，生成规则是：

const normalizedAbsolutePath =
pathUtils.normalize(pathUtils.resolve(block.file_path))
const stableName = `${normalizedAbsolutePath}:${block.start_line}`
const pointId = uuidv5(stableName, QDRANT_CODE_BLOCK_NAMESPACE)

示例：
- 文件：/workspace/src/utils.py
- 代码块从第15行开始
- 生成ID：uuid5("/workspace/src/utils.py:15", namespace)

2. 文件更新时的匹配机制

当文件发生变化时，系统需要：
1. 删除旧的代码块
2. 插入新的代码块

删除旧数据的策略

getFilesToDelete: (blocks) => {
    // 获取所有需要删除旧版本的文件路径
    const uniqueFilePaths = Array.from(new Set(
        blocks
            .map(block => block.file_path)
            .filter(filePath => {
                const fileInfo = fileInfoMap.get(filePath)
                return fileInfo && !fileInfo.isNew // 只有修改的文件需要删除旧版本
            })
    ))

    // 转换为相对路径进行删除
    const relativeUpdatePaths = uniqueFilePaths.map(path =>
        workspace.getRelativePath(path)
    )
    return [...relativeDeletePaths, ...relativeUpdatePaths]
}

为什么要先删除再插入？

原因1: 代码块可能完全不同
# 旧版本 - 3个函数
def func_a(): pass
def func_b(): pass
def func_c(): pass

# 新版本 - 1个类
class MyClass:
    def method(self): pass

原因2: 行号可能发生变化
# 旧版本
# 第10行: def calculate()
# 第20行: def process()

# 新版本 (在顶部添加了import)
# 第15行: def calculate()  # 同样的函数，但行号变了
# 第25行: def process()

3. 删除匹配的具体实现

向量数据库中的数据结构

{
"id": "uuid-generated-from-path-and-line",
"vector": [0.1, 0.2, 0.3, ...],
"payload": {
    "filePath": "src/utils.py",  // 相对路径！
    "codeChunk": "def calculate():\n    return x + y",
    "startLine": 10,
    "endLine": 12
}
}

删除查询逻辑

// QdrantVectorStore.deletePointsByMultipleFilePaths()
const filter = {
    should: filePaths.map((filePath) => ({
        key: "filePath",           // 匹配payload中的filePath字段
        match: {
            value: filePath,       // 这里必须是相对路径！
        },
    })),
}

await this.client.delete(this.collectionName, { filter, wait: true })

4. 修复前后的对比

修复前的问题

// FileWatcher传递的删除路径
filesToDelete = ["/Users/anrgct/workspace/autodev-codebase/demo/utils.py"]

// 向量数据库中存储的路径
payload.filePath = "demo/utils.py"

// 结果：路径不匹配，删除失败 ❌

修复后的正确流程

// 1. FileWatcher收到绝对路径
filesToDelete = ["/Users/anrgct/workspace/autodev-codebase/demo/utils.py"]

// 2. 转换为相对路径
const relativeDeletePaths = filesToDelete.map(path =>
    workspace.getRelativePath(path)
)
// 结果：["demo/utils.py"]

// 3. 与向量数据库匹配
payload.filePath = "demo/utils.py"  // ✅ 匹配成功！

5. 缓存匹配机制

除了向量数据库，还有文件哈希缓存：

// 检查文件是否变化
const currentFileHash = createHash("sha256").update(content).digest("hex")
const cachedFileHash = cacheManager.getHash(filePath)  // 使用绝对路径作为key

if (cachedFileHash === currentFileHash) {
    // 文件未变化，跳过处理
    return { status: "skipped", reason: "File has not changed" }
}

缓存的key-value结构：
{
    "/workspace/src/utils.py": "abc123hash",
    "/workspace/src/main.py": "def456hash"
}

6. 完整的更新流程

graph TD
    A[文件变化事件] --> B[读取文件内容]
    B --> C[计算新哈希]
    C --> D{与缓存比较}
    D -->|相同| E[跳过处理]
    D -->|不同| F[解析为代码块]
    F --> G[删除旧向量点<br/>使用相对路径匹配]
    G --> H[生成新嵌入]
    H --> I[插入新向量点<br/>使用相对路径存储]
    I --> J[更新缓存哈希<br/>使用绝对路径作为key]

7. 关键设计原则

1. 路径一致性: 向量数据库统一使用相对路径存储和查询
2. ID稳定性: 相同位置的代码块总是生成相同的ID
3. 缓存隔离: 文件哈希缓存使用绝对路径，与向量存储分离
4. 原子操作: 删除和插入在同一个事务中完成

这个设计确保了无论是初次索引还是增量更新，相同的代码总是产生相同的向量表示，从而保
证了搜索结果的一致性！