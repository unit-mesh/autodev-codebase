// @ts-nocheck
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

// 创建 MCP Server 实例
const server = new McpServer({
  name: 'SimpleDemo',
  version: '0.1.0',
});

// 注册一个简单的加法工具
const additionInputSchema = {
  a: z.number().describe('第一个加数'),
  b: z.number().describe('第二个加数'),
};
const additionOutputSchema = z.object({
  result: z.number().describe('加法结果'),
  operation: z.string().describe('操作表达式'),
});
server.tool('addition', '两个数字相加', additionInputSchema, async (args: unknown) => {
  const { a, b } = z.object(additionInputSchema).parse(args);
  const result = a + b;
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          additionOutputSchema.parse({
            result,
            operation: `${a} + ${b}`,
          })
        ),
      },
    ],
  };
});

// 启动 Express 应用
const app = express();
let transport: SSEServerTransport | undefined;

app.get('/', (_req, res) => {
  res.send('Simple MCP Server is running.');
});

app.get('/sse', async (_req, res) => {
  transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  if (!transport) {
    res.status(404).send('No transport found');
    return;
  }
  await transport.handlePostMessage(req, res);
});

app.listen(3001, () => {
  console.log('Simple MCP Server is running on port 3001');
});
