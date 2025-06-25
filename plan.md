# MCP Server 实现计划

## 概述
将现有的代码分析工具扩展为MCP服务器，在保持TUI界面功能的同时，为Cursor IDE提供向量搜索能力。

## 架构设计

### 1. MCP服务器实现
- **创建新的MCP服务器模块** (`src/mcp/server.ts`)
  - 实现基于stdio传输的MCP协议
  - 向MCP客户端暴露向量搜索工具
  - 处理工具调用和响应格式化

### 2. MCP工具定义
- **`search_codebase`** - 主要语义搜索工具
  - 参数: query (string), limit (number), filters (object)
  - 返回: 格式化的搜索结果，包含文件路径、分数、代码块
- **`get_search_stats`** - 索引状态和统计信息
- **`configure_search`** - 运行时搜索配置

### 3. CLI集成
- **添加 `--mcp-server` 标志** 到CLI参数解析器
- **双模式运行**: 
  - 默认: 仅TUI模式（现有行为）
  - 使用 `--mcp-server`: 运行MCP服务器，屏蔽TUI模式
- **共享CodeIndexManager实例** 在TUI和MCP服务器之间

### 4. 服务器生命周期管理
- **后台服务器进程** 使用Node.js worker线程或子进程
- **优雅关闭处理** 针对TUI和MCP服务器
- **错误隔离** - MCP服务器故障不会导致TUI崩溃

### 5. MCP协议实现
- **Stdio传输** 用于MCP通信
- **工具注册** 和能力广告
- **请求/响应处理** 包含适当的错误管理
- **资源管理** 用于大型搜索结果

## 实现步骤

1. **安装MCP依赖** (`@modelcontextprotocol/sdk-node`)
2. **创建MCP服务器模块** 包含工具定义
3. **扩展CLI参数解析器** 支持MCP模式
4. **修改TUI运行器** 支持双模式运行
5. **添加服务器生命周期管理**
6. **更新构建配置** 和package.json脚本

## 使用流程
```bash
# 启用MCP服务器
codebase --path=/my/project --mcp-server

# 在Cursor IDE设置中：
{
  "mcpServers": {
    "codebase": {
      "command": "codebase",
      "args": ["--path=/workspace", "--mcp-server"]
    }
  }
}
```

## 优势
- **非侵入性**: 现有TUI功能不变
- **灵活性**: 可以仅运行TUI或同时运行MCP服务器
- **共享状态**: 两个界面使用相同的索引数据
- **IDE集成**: 在Cursor中无缝向量搜索