# Autodev Codebase Demo Setup

这个demo演示如何使用autodev codebase库监听本地demo文件夹，并通过Ollama embedding将代码存储到Qdrant数据库中。

## 前提条件

### 1. 安装和启动 Ollama

```bash
# 安装 Ollama (macOS)
brew install ollama

# 启动 Ollama 服务
ollama serve

# 在新终端中安装嵌入模型
ollama pull nomic-embed-text
```

### 2. 安装和启动 Qdrant

使用Docker启动Qdrant：

```bash
# 启动 Qdrant 容器
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

或者下载并直接运行Qdrant：

```bash
# 下载并运行 Qdrant
wget https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-unknown-linux-gnu.tar.gz
tar -xzf qdrant-x86_64-unknown-linux-gnu.tar.gz
./qdrant
```

### 3. 验证服务运行状态

```bash
# 检查 Ollama
curl http://localhost:11434/api/tags

# 检查 Qdrant
curl http://localhost:6333/collections
```

## 运行Demo

### 方法1: 快速测试 (推荐新手)

```bash
# 测试服务连接和创建示例文件
node simple-demo.js
```

### 方法2: 完整演示 

```bash
# 运行完整的索引和搜索演示
node demo-runner.js
```

### 方法3: 手动编译和运行

```bash
# 1. 构建项目
npm run build

# 2. 运行demo
node dist/src/examples/run-demo.js
```

## Demo功能

### 1. 自动创建示例文件
Demo会在 `./demo` 文件夹中创建以下示例文件：
- `hello.js` - JavaScript函数和类示例
- `utils.py` - Python数据处理工具
- `README.md` - 项目文档
- `config.json` - 配置文件

### 2. 代码索引
系统会自动：
- 扫描demo文件夹中的所有文件
- 使用Ollama的nomic-embed-text模型生成代码嵌入
- 将向量存储到Qdrant数据库
- 显示索引进度

### 3. 语义搜索演示
完成索引后，系统会自动测试以下搜索查询：
- "greet user function"
- "process data" 
- "user management"
- "batch processing"
- "configuration settings"

### 4. 文件监听
索引完成后，系统会持续监听demo文件夹的变化：
- 添加新文件时自动索引
- 修改文件时更新索引
- 删除文件时从索引中移除

## 使用自己的代码

要监听你自己的代码文件夹，修改 `src/examples/run-demo.ts` 中的配置：

```typescript
// 修改这一行指向你的代码文件夹
const DEMO_FOLDER = path.join(process.cwd(), 'your-code-folder')
```

然后重新构建和运行：

```bash
npm run build
node dist/src/examples/run-demo.js
```

## 配置选项

可以通过环境变量自定义配置：

```bash
# 设置不同的Ollama URL
export OLLAMA_URL=http://localhost:11434

# 设置不同的Qdrant URL  
export QDRANT_URL=http://localhost:6333

# 设置不同的嵌入模型
export OLLAMA_MODEL=nomic-embed-text

# 运行demo
node demo-runner.js
```

## 故障排除

### Ollama相关问题

```bash
# 检查Ollama是否运行
curl http://localhost:11434/api/tags

# 重启Ollama服务
ollama serve

# 检查可用模型
ollama list

# 安装嵌入模型
ollama pull nomic-embed-text
```

### Qdrant相关问题

```bash
# 检查Qdrant是否运行
curl http://localhost:6333/collections

# 查看Docker容器状态
docker ps | grep qdrant

# 重启Qdrant容器
docker restart <qdrant-container-id>
```

### 构建问题

```bash
# 清理并重新构建
rm -rf dist/
npm run build

# 检查TypeScript错误
npm run type-check
```

## 停止Demo

按 `Ctrl+C` 停止监听和索引服务。

## 下一步

成功运行demo后，你可以：

1. 集成到你的开发工具中
2. 修改搜索查询逻辑
3. 添加自定义文件过滤规则
4. 实现自定义的搜索界面
5. 扩展支持更多编程语言