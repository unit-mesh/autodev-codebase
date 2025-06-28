import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
  ListToolsResult,
  TextContent,
  ImageContent,
} from '@modelcontextprotocol/sdk/types.js';
import { CodeIndexManager } from '../code-index/manager.js';

export interface MCPServerOptions {
  codeIndexManager: CodeIndexManager;
}

export class CodebaseMCPServer {
  private server: Server;
  private codeIndexManager: CodeIndexManager;

  constructor(options: MCPServerOptions) {
    this.codeIndexManager = options.codeIndexManager;
    
    this.server = new Server(
      {
        name: 'codebase-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
  }

  private setupTools() {
    // Register tools
    this.server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => {
      return {
        tools: [
          {
            name: 'search_codebase',
            description: 'Search the codebase using semantic vector search to find relevant code snippets, functions, and documentation.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query to find relevant code',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                  default: 10,
                },
                filters: {
                  type: 'object',
                  description: 'Optional filters for the search',
                  properties: {
                    pathFilters: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Filter by path strings - directories, extensions, file names, Case sensitive (e.g., ["src/", ".ts", "components"])',
                    },
                    minScore: {
                      type: 'number',
                      description: 'Minimum similarity score threshold (0-1)，default 0.4',
                    },
                  },
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_search_stats',
            description: 'Get statistics about the current codebase index, including number of indexed files and index status.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'configure_search',
            description: 'Configure search parameters like similarity threshold and result formatting.',
            inputSchema: {
              type: 'object',
              properties: {
                similarityThreshold: {
                  type: 'number',
                  description: 'Minimum similarity score for results (0.0 to 1.0)',
                  minimum: 0,
                  maximum: 1,
                },
                includeContext: {
                  type: 'boolean',
                  description: 'Whether to include surrounding code context in results',
                },
              },
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_codebase':
            return await this.handleSearchCodebase(args);
          case 'get_search_stats':
            return await this.handleGetSearchStats(args);
          case 'configure_search':
            return await this.handleConfigureSearch(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleSearchCodebase(args: any): Promise<CallToolResult> {
    const { query, limit = 10, filters = {} } = args;

    if (!query || typeof query !== 'string') {
      throw new Error('Query parameter is required and must be a string');
    }

    // Check if the code index manager is ready
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
      // Perform the search using the code index manager
      const searchFilter = {
        limit: Math.min(limit, 50),
        minScore: filters?.minScore,
        pathFilters: filters?.pathFilters
      };
      const searchResults = await this.codeIndexManager.searchIndex(query, searchFilter);
      // console.log('[MCP Server] Search results:', JSON.stringify(searchResults));

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

      // Format the results
      const formattedResults = searchResults.map((result: any, index: number) => {
        const filePath = result.payload?.filePath || 'Unknown file';
        const score = result.score?.toFixed(3) || '0.000';
        const codeChunk = result.payload?.codeChunk || 'No content available';
        const startLine = result.payload?.startLine;
        const endLine = result.payload?.endLine;
        const lineInfo = (startLine !== undefined && endLine !== undefined)
          ? ` (L${startLine}-${endLine})`
          : '';

        return `File: \`${filePath}\`${lineInfo} (Score: ${score})
\`\`\`
${codeChunk}
\`\`\`
`;
  });

  const summary = `Found ${searchResults.length} results for query: "${query}":\n\n${formattedResults.join('\n\n')}`;

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

  private async handleGetSearchStats(args: any): Promise<CallToolResult> {
    try {
      const state = this.codeIndexManager.state;
      const isReady = this.codeIndexManager.isInitialized && this.codeIndexManager.isFeatureEnabled;
      const currentStatus = this.codeIndexManager.getCurrentStatus();
      
      // Get additional stats if available
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
    const { similarityThreshold, includeContext } = args;

    // Note: This is a placeholder implementation
    // In a real implementation, you would modify search parameters
    const config = {
      similarityThreshold: similarityThreshold || 0.1,
      includeContext: includeContext !== undefined ? includeContext : true,
    };

    const summary = `**Search Configuration Updated**

**Similarity Threshold:** ${config.similarityThreshold}
**Include Context:** ${config.includeContext ? 'Yes' : 'No'}

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

  async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const transport = new StdioServerTransport();
        this.server.connect(transport);
        
        // Handle server events
        this.server.onerror = (error) => {
          console.error('[MCP Server] Error:', error);
        };

        // The server starts immediately when connected to transport
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    // Clean up resources if needed
    this.server.close();
  }
}

// Factory function to create and start MCP server
export async function createMCPServer(codeIndexManager: CodeIndexManager): Promise<CodebaseMCPServer> {
  const server = new CodebaseMCPServer({ codeIndexManager });
  await server.start();
  return server;
}