# MCP Server 使用指南

## 概述

这个项目现在支持作为MCP (Model Context Protocol) 服务器运行，可以与Cursor IDE等支持MCP的编辑器集成，提供向量搜索功能。

⚠️ **重要说明**: MCP服务器模式与TUI模式是互斥的。当使用 `--mcp-server` 标志时，程序将运行为纯MCP服务器（无交互式TUI），以避免stdin冲突。

## 启动MCP服务器

### 基本用法

```bash
# 启动纯MCP服务器模式（无TUI交互）
codebase --path=/path/to/your/project --mcp-server

# 使用demo数据启动MCP服务器
codebase --demo --mcp-server

# 自定义配置启动MCP服务器
codebase --path=/workspace --mcp-server --model=nomic-embed-text --ollama-url=http://localhost:11434

# 如果需要TUI交互，请不要使用 --mcp-server 标志
codebase --path=/path/to/your/project  # 仅TUI模式
```

### 服务依赖

确保以下服务正在运行：

1. **Ollama** (默认: http://localhost:11434)
   ```bash
   ollama serve
   ollama pull nomic-embed-text
   ```

2. **Qdrant** (默认: http://localhost:6333)
   ```bash
   docker run -p 6333:6333 qdrant/qdrant
   ```

## IDE 集成配置

### Cursor IDE

在Cursor的设置中添加MCP服务器配置：

```json
{
  "mcpServers": {
    "codebase": {
      "command": "codebase",
      "args": ["--path=/path/to/your/workspace", "--mcp-server"]
    }
  }
}
```

## 可用的MCP工具

### 1. search_codebase

语义搜索代码库中的相关代码片段。

**参数:**
- `query` (string, 必需): 搜索查询
- `limit` (number, 可选): 返回结果数量上限 (默认: 10)
- `filters` (object, 可选): 搜索过滤器

**示例:**
```
使用 search_codebase 工具搜索 "authentication logic"
```

### 2. get_search_stats

获取代码库索引的状态和统计信息。

**示例:**
```
使用 get_search_stats 工具查看索引状态
```

### 3. configure_search

配置搜索参数。

**参数:**
- `similarityThreshold` (number): 相似度阈值 (0.0-1.0)
- `includeContext` (boolean): 是否包含代码上下文

## 运行模式

### MCP服务器模式
- 使用 `--mcp-server` 标志
- 纯命令行输出，无交互式界面
- 通过stdin/stdout与IDE通信
- 适合作为后台服务运行

### TUI模式
- 不使用 `--mcp-server` 标志
- 交互式终端用户界面
- 可以直接在终端中搜索和浏览
- 适合独立使用和调试

## 工作流程

1. **启动服务器**: 使用 `--mcp-server` 标志启动纯MCP服务器模式
2. **等待索引**: 服务器会自动开始索引代码库（通过console输出查看进度）
3. **IDE配置**: 在IDE中配置MCP服务器
4. **开始搜索**: 通过IDE使用搜索工具

## 故障排除

### 常见问题

1. **服务器启动失败**
   - 检查Ollama和Qdrant是否正在运行
   - 验证工作区路径是否正确
   - 查看日志输出获取详细错误信息

2. **搜索无结果**
   - 确认索引过程已完成
   - 检查搜索查询是否合适
   - 验证代码库中有可索引的文件

3. **IDE连接问题**
   - 确认MCP服务器配置正确
   - 检查命令路径和参数
   - 重启IDE和MCP服务器

4. **stdin冲突错误**
   - 确保不要在MCP服务器模式下尝试TUI交互
   - MCP模式下程序不应接受键盘输入
   - 如需调试，使用单独的TUI模式

### 调试模式

使用更详细的日志级别获取调试信息：

```bash
codebase --path=/workspace --mcp-server --log-level=debug
```

## 高级配置

### 自定义模型

```bash
codebase --path=/workspace --mcp-server --model=custom-model --ollama-url=http://custom-host:11434
```

### 自定义存储路径

```bash
codebase --path=/workspace --mcp-server --storage=/custom/storage --cache=/custom/cache
```

## 注意事项

- **互斥模式**: MCP服务器模式和TUI模式不能同时运行
- **MCP模式特点**:
  - 无交互式界面，仅通过console输出显示状态
  - 通过stdin/stdout与IDE进行MCP协议通信
  - 使用Ctrl+C可以优雅地关闭服务器
- **TUI模式特点**:
  - 完整的交互式用户界面
  - 可以直接在终端中搜索和操作
  - 适合调试和独立使用
- 第一次运行时需要等待索引完成才能进行搜索
- 索引进度和状态在MCP模式下通过console输出显示