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
                limit: z.number().optional().default(10).describe('Maximum number of results to return (default: 10)'),
                filters: z.object({
                    
                    pathPatterns: z.array(z.string()).optional().describe('Filter by path patterns (e.g., ["src/", "test/"])'),
                    minScore: z.number().optional().describe('Minimum similarity score threshold (0-1)'),
                    directoryPrefix: z.string().optional().describe('Directory path prefix to filter results')
                }).optional().describe('Optional filters for file types, paths, etc.')
            },
            async ({ query, limit = 10, filters }): Promise<CallToolResult> => {
                // console.log(`🔍[MCP Server] Handling search_codebase with query: "${query}", limit: ${limit}, filters:`, filters);
                return await this.handleSearchCodebase({ query, limit, filters });
            }
        );

        // Register get_search_stats tool
        this.mcpServer.tool(
            'get_search_stats',
            'Get statistics about the codebase index including file count, indexed files, and indexing status.',
            async (): Promise<CallToolResult> => {
                return await this.handleGetSearchStats();
            }
        );

        // Register configure_search tool
        this.mcpServer.tool(
            'configure_search',
            'Configure search settings like model parameters or update the index.',
            {
                action: z.enum(['refresh_index', 'update_model']).describe('The configuration action to perform'),
                model: z.string().optional().describe('New embedding model to use (for update_model action)')
            },
            async ({ action, model }): Promise<CallToolResult> => {
                return await this.handleConfigureSearch({ action, model });
            }
        );
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
                directoryPrefix: filters?.directoryPrefix,
                pathPatterns: filters?.pathPatterns
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

            const formattedResults = searchResults.map((result: any, index: number) => {
                const filePath = result.payload?.filePath || 'Unknown file';
                const score = result.score?.toFixed(3) || '0.000';
                const codeChunk = result.payload?.codeChunk || 'No content available';
                const startLine = result.payload?.startLine;
                const endLine = result.payload?.endLine;
                const lineInfo = (startLine !== undefined && endLine !== undefined)
                    ? ` (L${startLine}-${endLine})`
                    : '';

                return `File: \`${filePath}\`${lineInfo} | Score: ${score}
\`\`\`
${codeChunk}
\`\`\`
`;
            });

            const summary = `Found ${searchResults.length} results for query: "${query}":\n\n${formattedResults.join('\n\n')}`;

            console.log(`🔍[MCP Server] Search results ${searchResults.length} items for query "${query}"`);
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
            transport = new SSEServerTransport('/messages', res);
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
            // Close MCP server
            if (this.mcpServer) {
                this.mcpServer.close();
            }

            // Close HTTP server
            this.httpServer.close(() => {
                console.log('MCP Server stopped');
                resolve();
            });
        });
    }
}
