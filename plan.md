
# stdio-to-SSE 适配器实现计划

## 项目目标

创建一个stdio适配器，让stdio MCP客户端（如Claude Desktop）能够透明地连接到现有的HTTP/SSE MCP服务器，无需修改服务器代码。

## 核心设计思路

stdio MCP Client (Claude Desktop等)
        ↓ stdin/stdout (JSON-RPC)
StdioToSSEAdapter (新增CLI命令)
        ↓ HTTP/SSE现有的 CodebaseHTTPMCPServer (保持不变)

## 实现计划

### 阶段1：扩展CLI参数解析

#### 文件：`src/cli/args-parser.ts`

**1.1 扩展CliOptions接口**
```typescript
export interface CliOptions {
  // 现有字段...
  stdioAdapter: boolean;        // 是否运行stdio适配器模式
  stdioServerUrl?: string;      // HTTP服务器URL
  stdioTimeout?: number;        // 请求超时时间
}

1.2 更新parseArgs函数
- 添加对 stdio-adapter 位置参数的支持
- 添加 --server-url= 参数解析（默认：http://localhost:3001）
- 添加 --timeout= 参数解析（默认：30000ms）

1.3 更新printHelp函数
添加stdio适配器模式的使用说明：
# 新增模式
codebase stdio-adapter [options]         Start stdio adapter mode

# 新增选项
Stdio Adapter Options:
  --server-url=<url>      HTTP MCP server URL (default: http://localhost:3001)
  --timeout=<ms>          Request timeout in milliseconds (default: 30000)

阶段2：实现stdio适配器核心逻辑

文件：src/mcp/stdio-adapter.ts

2.1 创建StdioToSSEAdapter类
- 基于现有的 SimpleMCPSSEClient 逻辑
- 复用SSE连接、HTTP请求、消息处理方法
- 移除服务器启动逻辑（假设服务器已运行）

2.2 核心方法实现
class StdioToSSEAdapter {
  // 复用现有逻辑
  private async connectSSE(): Promise<void>
  private async httpRequest(path: string, method: string, data?: any): Promise<any>
  private handleServerMessage(data: string): void

  // 新增stdio处理
  private setupStdioHandlers(): void
  private handleStdinMessage(message: string): void
  private writeStdoutResponse(response: any): void

  // 主要入口
  async start(): Promise<void>
  stop(): void
}

2.3 消息转换逻辑
- stdin JSON-RPC → HTTP POST /messages
- SSE响应 → stdout JSON-RPC

阶段3：集成到主入口

文件：src/index.ts 或相关主入口文件

3.1 添加stdio适配器模式分支
if (options.stdioAdapter) {
  const adapter = new StdioToSSEAdapter({
    serverUrl: options.stdioServerUrl || 'http://localhost:3001',
    timeout: options.stdioTimeout || 30000
  });
  await adapter.start();
} else if (options.mcpServer) {
  // 现有MCP服务器逻辑
} else {
  // 现有TUI逻辑
}

阶段4：文档和配置

4.1 更新package.json
添加便捷脚本（可选）：
{
  "scripts": {
    "stdio-adapter": "npx tsx src/index.ts stdio-adapter"
  }
}

4.2 使用文档
更新README或相关文档，说明新的使用方式。

使用方式

三种运行模式

# 1. TUI模式（默认）
codebase

# 2. HTTP/SSE服务器模式
codebase mcp-server --port=3001

# 3. stdio适配器模式（新增）
codebase stdio-adapter --server-url=http://localhost:3001

典型工作流程

# 终端1：启动HTTP/SSE服务器
codebase mcp-server --port=3001

# 终端2：测试适配器
codebase stdio-adapter --server-url=http://localhost:3001

MCP客户端配置

Claude Desktop配置示例：
{
  "mcpServers": {
    "codebase": {
      "command": "codebase",
      "args": ["stdio-adapter", "--server-url=http://localhost:3001"]
    }
  }
}

技术细节

基于现有SSE客户端

复用 src/examples/debug-mcp-sse-client-simple.js 中验证的逻辑：
- SSE连接建立（GET /sse）
- 消息发送（POST /messages）
- 响应接收（SSE data事件）
- 错误处理和重连

消息转换

stdin → HTTP:
stdin: {"jsonrpc":"2.0","id":1,"method":"tools/list"}
  ↓
HTTP POST /messages: {"jsonrpc":"2.0","id":1,"method":"tools/list"}

SSE → stdout:
SSE: data: {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}
  ↓
stdout: {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}

优势

- ✅ 保持现有HTTP/SSE服务器代码不变
- ✅ 支持stdio客户端透明接入
- ✅ 统一的CLI接口，无需复杂的npx tsx命令
- ✅ 复用已验证的SSE通信逻辑
- ✅ 轻量级适配器，易于维护和调试
- ✅ 支持服务器独立运行，处理多个并发连接

实现优先级

1. 高优先级：CLI参数解析扩展
2. 高优先级：stdio适配器核心逻辑实现
3. 中优先级：主入口集成
4. 低优先级：文档和便捷脚本更新

测试计划

1. 单元测试stdio适配器的消息转换逻辑
2. 集成测试与现有HTTP服务器的连接
3. 端到端测试与真实MCP客户端的交互