import express, { Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
    CallToolResult,
    TextContent,
    isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { CodeIndexManager } from '../code-index/manager.js';

export interface HTTPMCPServerOptions {
    codeIndexManager: CodeIndexManager;
    port?: number;
    host?: string;
}

export class CodebaseHTTPMCPServer {
    private mcpServer: McpServer;
    private httpServer!: HTTPServer;
    private expressApp!: express.Application;
    private codeIndexManager: CodeIndexManager;
    private port: number;
    private host: string;
    private sseTransports: Map<string, SSEServerTransport> = new Map();

    constructor(options: HTTPMCPServerOptions) {
        this.codeIndexManager = options.codeIndexManager;
        this.port = options.port || 3001;
        this.host = options.host || 'localhost';

        this.mcpServer = new McpServer({
            name: 'codebase-mcp-server',
            version: '1.0.0',
        });

        this.setupTools();
        this.setupHTTPServer();
    }

    private setupTools() {
        // Register search_codebase tool
        this.mcpServer.tool(
            'search_codebase',
            'Search the codebase using semantic vector search to find relevant code snippets, functions, and documentation.',
            {
                query: z.string().describe('The search query to find relevant code'),
                limit: z.number().optional().default(20).describe('Maximum number of results to return (default: 20)'),
                filters: z.object({
                    pathFilters: z.array(z.string()).optional().describe('Filter by path strings - directories, extensions, file names, Case sensitive (e.g., ["src/", ".ts", "components"])'),
                    minScore: z.number().optional().describe('Minimum similarity score threshold (0-1)，default 0.4')
                }).optional().describe('Optional filters for file types, paths, etc.')
            },
            async ({ query, limit = 20, filters }): Promise<CallToolResult> => {
                if (limit === 0) {
                    limit = 20; // Default limit if not provided
                }
                if (!query || !query.trim() || typeof query !== 'string') {
                    throw new Error('Query parameter is required and must be a string');
                }
                // console.log(`🔍[MCP Server] Handling search_codebase with query: "${query}", limit: ${limit}, filters:`, filters);
                return await this.handleSearchCodebase({ query, limit, filters });
            }
        );

        // disable for uncompleted feature
        // // Register get_search_stats tool
        // this.mcpServer.tool(
        //     'get_search_stats',
        //     'Get statistics about the codebase index including file count, indexed files, and indexing status.',
        //     async (): Promise<CallToolResult> => {
        //         return await this.handleGetSearchStats();
        //     }
        // );

        // // Register configure_search tool
        // this.mcpServer.tool(
        //     'configure_search',
        //     'Configure search settings like model parameters or update the index.',
        //     {
        //         action: z.enum(['refresh_index', 'update_model']).describe('The configuration action to perform'),
        //         model: z.string().optional().describe('New embedding model to use (for update_model action)')
        //     },
        //     async ({ action, model }): Promise<CallToolResult> => {
        //         return await this.handleConfigureSearch({ action, model });
        //     }
        // );
    }

    private createServer(): McpServer {
        return this.mcpServer;
    }

    private async handleSearchCodebase(args: any): Promise<CallToolResult> {
        const { query, limit = 10, filters } = args;

        if (!query || typeof query !== 'string') {
            throw new Error('Query parameter is required and must be a string');
        }

        if (!this.codeIndexManager.isInitialized || !this.codeIndexManager.isFeatureEnabled) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'Code index is not ready. Please wait for indexing to complete or check if the feature is enabled.',
                    },
                ],
            };
        }

        try {
            // Extract search filter from the filters parameter
            const searchFilter = {
                limit: Math.min(limit, 50),
                minScore: filters?.minScore,
                pathFilters: filters?.pathFilters
            };
            const searchResults = await this.codeIndexManager.searchIndex(query, searchFilter);

            if (!searchResults || searchResults.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No results found for query: "${query}"`,
                        },
                    ],
                };
            }

            // 按文件路径分组搜索结果
            const resultsByFile = new Map<string, any[]>();
            searchResults.forEach((result: any) => {
                const filePath = result.payload?.filePath || 'Unknown file';
                if (!resultsByFile.has(filePath)) {
                    resultsByFile.set(filePath, []);
                }
                resultsByFile.get(filePath)!.push(result);
            });

            const formattedResults = Array.from(resultsByFile.entries()).map(([filePath, results]) => {
                // 对同一文件的结果按行号排序
                results.sort((a, b) => {
                    const lineA = a.payload?.startLine || 0;
                    const lineB = b.payload?.startLine || 0;
                    return lineA - lineB;
                });


                // 去重：移除被其他片段包含的重复片段
                const deduplicatedResults = [];
                for (let i = 0; i < results.length; i++) {
                    const current = results[i];
                    const currentStart = current.payload?.startLine || 0;
                    const currentEnd = current.payload?.endLine || 0;
                    
                    // 检查当前片段是否被其他片段包含
                    let isContained = false;
                    for (let j = 0; j < results.length; j++) {
                        if (i === j) continue; // 跳过自己
                        
                        const other = results[j];
                        const otherStart = other.payload?.startLine || 0;
                        const otherEnd = other.payload?.endLine || 0;
                        
                        // 如果当前片段被其他片段完全包含，则标记为重复
                        if (otherStart <= currentStart && otherEnd >= currentEnd && 
                            !(otherStart === currentStart && otherEnd === currentEnd)) {
                            isContained = true;
                            break;
                        }
                    }
                    
                    // 如果没有被包含，则保留这个片段
                    if (!isContained) {
                        deduplicatedResults.push(current);
                    }
                }

                // 使用去重后的结果计算平均分数
                const avgScore = deduplicatedResults.length > 0 
                    ? deduplicatedResults.reduce((sum, r) => sum + (r.score || 0), 0) / deduplicatedResults.length
                    : 0;
                
                // 合并代码片段，优化显示格式
                const codeChunks = deduplicatedResults.map((result: any, index: number) => {
                    const codeChunk = result.payload?.codeChunk || 'No content available';
                    const startLine = result.payload?.startLine;
                    const endLine = result.payload?.endLine;
                    const lineInfo = (startLine !== undefined && endLine !== undefined)
                        ? ` (L${startLine}-${endLine})`
                        : '';
                    const score = result.score?.toFixed(3) || '0.000';
                    
                    return `${lineInfo}
${codeChunk}`;
                }).join('\n' + '─'.repeat(5) + '\n');

                const snippetInfo = deduplicatedResults.length > 1 ? ` | ${deduplicatedResults.length} snippets` : '';
                const duplicateInfo = results.length !== deduplicatedResults.length 
                    ? ` (${results.length - deduplicatedResults.length} duplicates removed)` 
                    : '';
                return `File: \`${filePath}\` | Avg Score: ${avgScore.toFixed(3)}${snippetInfo}${duplicateInfo}
\`\`\`
${codeChunks}
\`\`\`
`;
            });

            const fileCount = resultsByFile.size;
            const summary = `Found ${searchResults.length} result${searchResults.length > 1 ? 's' : ''} in ${fileCount} file${fileCount > 1 ? 's' : ''} for: "${query}"\n\n${formattedResults.join('\n')}`;

            console.log(`🔍[MCP Server] ${searchResults.length} results in ${fileCount} files for "${query}"`);
            return {
                content: [
                    {
                        type: 'text',
                        text: summary,
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Search failed: ${message}`);
        }
    }

    private async handleGetSearchStats(): Promise<CallToolResult> {
        try {
            const state = this.codeIndexManager.state;
            const isReady = this.codeIndexManager.isInitialized && this.codeIndexManager.isFeatureEnabled;
            const currentStatus = this.codeIndexManager.getCurrentStatus();

            const stats = {
                isReady,
                isInitialized: this.codeIndexManager.isInitialized,
                isFeatureEnabled: this.codeIndexManager.isFeatureEnabled,
                indexingStatus: state,
                message: currentStatus.message || 'No message available',
            };

            const summary = `**Codebase Index Statistics**

**Status:** ${isReady ? '✅ Ready' : '⏳ Not Ready'}
**Indexing Status:** ${stats.indexingStatus}
**Feature Enabled:** ${stats.isFeatureEnabled ? 'Yes' : 'No'}
**Initialized:** ${stats.isInitialized ? 'Yes' : 'No'}
**Message:** ${stats.message}
`;

            return {
                content: [
                    {
                        type: 'text',
                        text: summary,
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get stats: ${message}`);
        }
    }

    private async handleConfigureSearch(args: any): Promise<CallToolResult> {
        const { action, model } = args;

        let result: string;
        switch (action) {
            case 'refresh_index':
                await this.codeIndexManager.clearIndexData();
                await this.codeIndexManager.startIndexing();
                result = 'Index refresh started successfully';
                break;
            case 'update_model':
                result = `Model update not yet implemented. Current configuration needs to be changed externally.`;
                break;
            default:
                throw new Error(`Unknown action: ${action}`);
        }

        const summary = `**Search Configuration Updated**

**Action:** ${action}
**Result:** ${result}

Note: Configuration changes will apply to subsequent searches.
`;

        return {
            content: [
                {
                    type: 'text',
                    text: summary,
                },
            ],
        };
    }


    private generateSessionId(): string {
        return randomUUID();
    }

    private setupHTTPServer() {
        const app = express();
        
        // Minimal CORS - only if needed
        app.use((req: any, res: any, next: any) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            
            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }
            next();
        });

        let transport: SSEServerTransport | undefined;

        // Simple SSE endpoint following demo-server pattern exactly
        app.get('/sse', async (_req: Request, res: Response) => {
            const sessionId = this.generateSessionId();
            transport = new SSEServerTransport('/messages', res);
            
            // Track the transport for proper cleanup
            this.sseTransports.set(sessionId, transport);
            
            // Clean up when connection closes
            res.on('close', () => {
                this.sseTransports.delete(sessionId);
            });
            
            await this.mcpServer.connect(transport);
        });

        // Message handling endpoint - exactly like demo-server
        app.post('/messages', async (req: Request, res: Response) => {
            if (!transport) {
                res.status(404).send('No transport found');
                return;
            }
            await transport.handlePostMessage(req, res);
        });

        // Health check endpoint
        app.get('/health', (req: any, res: any) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                workspace: this.codeIndexManager.workspacePathValue
            });
        });

        // Welcome page
        app.get('/', (req: any, res: any) => {
            res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Codebase MCP Server</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 800px; margin: 0 auto; }
        pre { background: #f5f5f5; padding: 20px; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 Codebase MCP Server</h1>
        <p>Status: <strong style="color: green;">Running</strong></p>
        <p>Workspace: <code>${this.codeIndexManager.workspacePathValue}</code></p>
        
        <h2>Endpoints</h2>
        <ul>
            <li><code>GET /sse</code> - SSE connection endpoint</li>
            <li><code>POST /messages</code> - Message handling endpoint</li>
            <li><code>GET /health</code> - Health check</li>
        </ul>

        <h2>Client Configuration</h2>
        <p>Connect via SSE to: <code>http://${this.host}:${this.port}/sse</code></p>
        <p>Send messages to: <code>http://${this.host}:${this.port}/messages</code></p>
    </div>
</body>
</html>
            `);
        });

        this.expressApp = app;
        this.httpServer = createServer(app);
    }

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.httpServer.listen(this.port, this.host, () => {
                console.log(`🔍 Codebase MCP Server running at http://${this.host}:${this.port}`);
                console.log(`📁 Workspace: ${this.codeIndexManager.workspacePathValue}`);
                console.log(`🌐 SSE endpoint: http://${this.host}:${this.port}/sse`);
                console.log(`📨 Messages endpoint: http://${this.host}:${this.port}/messages`);
                console.log(`❤️  Health check: http://${this.host}:${this.port}/health`);
                resolve();
            });

            this.httpServer.on('error', reject);
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve) => {
            let resolved = false;
            
            const cleanup = () => {
                if (!resolved) {
                    resolved = true;
                    console.log('MCP Server stopped');
                    resolve();
                }
            };

            // Set a timeout to force exit if graceful shutdown fails
            const forceExitTimer = setTimeout(() => {
                console.log('Force stopping MCP Server...');
                cleanup();
            }, 2000);

            try {
                // Close MCP server connections
                if (this.mcpServer) {
                    this.mcpServer.close();
                }

                // Close all SSE transports
                this.sseTransports.forEach((transport, sessionId) => {
                    try {
                        transport.close();
                    } catch (error) {
                        console.warn(`Failed to close SSE transport ${sessionId}:`, error);
                    }
                });
                this.sseTransports.clear();

                // Close HTTP server
                this.httpServer.close((error) => {
                    clearTimeout(forceExitTimer);
                    if (error) {
                        console.warn('HTTP server close error:', error);
                    }
                    cleanup();
                });

                // Force close all connections
                this.httpServer.closeAllConnections?.();
                
            } catch (error) {
                clearTimeout(forceExitTimer);
                console.warn('Error during shutdown:', error);
                cleanup();
            }
        });
    }
}
