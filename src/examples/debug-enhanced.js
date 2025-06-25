#!/usr/bin/env node

/**
 * Enhanced MCP server debugging script
 * This script provides more comprehensive testing and debugging capabilities
 */

import { spawn } from 'child_process';

class MCPServerDebugger {
    constructor() {
        this.requestId = 0;
        this.requests = new Map();
    }

    async testMCPServer() {
        console.log('🧪 Enhanced MCP Server Debug Session');
        console.log('='.repeat(50));

        // Test 1: Check workspace content
        console.log('\n📁 Testing workspace content...');
        await this.checkWorkspaceContent();

        // Test 2: Direct command test
        console.log('\n🔧 Testing direct MCP server...');
        await this.testDirectServer();

    }

    async checkWorkspaceContent() {
        const { spawn } = await import('child_process');
        const fs = await import('fs/promises');

        const demoPath = '/Users/anrgct/workspace/autodev-workbench/packages/codebase/demo';

        try {
            const files = await fs.readdir(demoPath);
            console.log('📂 Demo folder contents:', files);

            for (const file of files) {
                if (file.endsWith('.js') || file.endsWith('.py') || file.endsWith('.md')) {
                    const content = await fs.readFile(`${demoPath}/${file}`, 'utf8');
                    console.log(`\n📄 ${file} (${content.length} chars):`);
                    console.log(content.substring(0, 200) + (content.length > 200 ? '...' : ''));
                }
            }
        } catch (error) {
            console.error('❌ Error reading workspace:', error);
        }
    }

    async testDirectServer() {
        return new Promise((resolve) => {
            console.log('🚀 Starting server with detailed logging...');

            const server = spawn('codebase', [
                '--path=/Users/anrgct/workspace/autodev-workbench/packages/codebase/demo',
                '--mcp-server',
                '--log-level=debug'
            ], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            this.serverProcess = server;

            let initialized = false;
            let serverReady = false;

            server.stderr.on('data', (data) => {
                console.log('🔍 Debug Log:', data.toString().trim());
            });

            server.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output.includes('MCP Server is ready')) {
                    serverReady = true;
                    this.testServerCommunication(server, resolve);
                }
                console.log('📊 Server:', output);
            });

            server.on('error', (error) => {
                console.error('❌ Server error:', error);
                resolve();
            });

            // Timeout fallback
            setTimeout(() => {
                if (!serverReady) {
                    console.log('⏰ Starting communication anyway...');
                    this.testServerCommunication(server, resolve);
                }
            }, 5000);
        });
    }

    async testServerCommunication(serverProcess, callback) {
        console.log('\n💬 Testing server communication...');

        // Test initialize
        await this.sendMCPRequest(serverProcess, {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'debug-client', version: '1.0.0' }
            }
        });

        // Test list tools
        await this.sendMCPRequest(serverProcess, {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list'
        });

        // Test search with different queries
        const queries = ['function', 'hello', 'config', 'python', 'readme'];

        for (const query of queries) {
            await this.sendMCPRequest(serverProcess, {
                jsonrpc: '2.0',
                id: this.requestId++,
                method: 'tools/call',
                params: {
                    name: 'search_codebase',
                    arguments: { query, limit: 2 }
                }
            });
        }

        setTimeout(() => {
            serverProcess.kill('SIGTERM');
            callback();
        }, 3000);
    }

    async sendMCPRequest(serverProcess, request) {
        return new Promise((resolve) => {
            console.log(`\n📤 Sending: ${request.method}`, request.params?.name || '');

            let responseReceived = false;

            const dataHandler = (data) => {
                if (responseReceived) return;

                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (line.trim().startsWith('{')) {
                        try {
                            const response = JSON.parse(line.trim());
                            if (response.id === request.id) {
                                responseReceived = true;
                                console.log(`📨 Response (${request.method}):`, this.formatResponse(response));
                                serverProcess.stdout.removeListener('data', dataHandler);
                                resolve(response);
                                return;
                            }
                        } catch (e) {
                            // Not JSON, ignore
                        }
                    }
                }
            };

            serverProcess.stdout.on('data', dataHandler);
            serverProcess.stdin.write(JSON.stringify(request) + '\n');

            // Timeout
            setTimeout(() => {
                if (!responseReceived) {
                    serverProcess.stdout.removeListener('data', dataHandler);
                    console.log(`⏰ Timeout for ${request.method}`);
                    resolve(null);
                }
            }, 5000);
        });
    }

    formatResponse(response) {
        if (response.result?.content) {
            const content = response.result.content[0];
            if (content.text) {
                return content.text.substring(0, 200) + (content.text.length > 200 ? '...' : '');
            }
        }
        if (response.result?.tools) {
            return `${response.result.tools.length} tools available`;
        }
        return JSON.stringify(response.result).substring(0, 100);
    }

    stop() {
        if (this.serverProcess) {
            console.log('🔄 Stopping server...');
            this.serverProcess.kill('SIGTERM');
        }
    }

}

// Main execution
async function main() {
    const mcpDebugger = new MCPServerDebugger();
    try {
        await mcpDebugger.testMCPServer();
        console.log('\n✅ Debug session completed');
    } catch (error) {
        console.error('\n❌ Debug session failed:', error);
    } finally {
        mcpDebugger.stop();
        process.exit(0);
    }
}

main().catch(console.error);
