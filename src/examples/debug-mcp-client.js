#!/usr/bin/env node

/**
 * Debug client for testing MCP server functionality
 * This script helps debug the codebase MCP server by sending test requests
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

class MCPDebugClient extends EventEmitter {
    constructor() {
        super();
        this.requests = new Map();
        this.requestId = 0;
    }

    async startServer() {
        console.log('🚀 Starting MCP Server process...');

        // Start the MCP server process
        // 'codebase' or 'npx tsx src/index.ts' 
        this.serverProcess = spawn('npx', [
            'tsx',
            'src/index.ts',
            '--path=/Users/anrgct/workspace/autodev-workbench/packages/codebase/demo',
            '--mcp-server',
            '--log-level=error'
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env }
        });

        this.serverProcess.stderr.on('data', (data) => {
            console.log('🔍 Server Log:', data.toString());
        });

        this.serverProcess.stdout.on('data', (data) => {
            this.handleServerMessage(data.toString());
        });

        this.serverProcess.on('error', (error) => {
            console.error('❌ Server Error:', error);
        });

        this.serverProcess.on('exit', (code) => {
            console.log(`🔄 Server exited with code ${code}`);
        });

        // Wait a bit for the server to start
        await new Promise(resolve => setTimeout(resolve, 3000));

        return this;
    }

    handleServerMessage(data) {
        const lines = data.trim().split('\n');

        for (const line of lines) {
            try {
                // Skip non-JSON lines (logs)
                if (!line.startsWith('{')) {
                    console.log('📊 Server Output:', line);
                    continue;
                }

                const message = JSON.parse(line);
                console.log('📨 Received:', JSON.stringify(message, null, 2));

                if (message.id && this.requests.has(message.id)) {
                    const { resolve } = this.requests.get(message.id);
                    this.requests.delete(message.id);
                    resolve(message);
                }
            } catch (error) {
                console.log('📊 Server Output:', line);
            }
        }
    }

    async sendRequest(method, params = {}) {
        const id = ++this.requestId;
        const request = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        console.log('📤 Sending:', JSON.stringify(request, null, 2));

        return new Promise((resolve, reject) => {
            this.requests.set(id, { resolve, reject });

            // Set timeout
            setTimeout(() => {
                if (this.requests.has(id)) {
                    this.requests.delete(id);
                    reject(new Error(`Request ${id} timed out`));
                }
            }, 30000);

            this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
        });
    }

    async testInitialize() {
        console.log('\n🔧 Testing initialize...');
        try {
            const response = await this.sendRequest('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {
                    roots: {
                        listChanged: true
                    },
                    sampling: {}
                },
                clientInfo: {
                    name: 'debug-client',
                    version: '1.0.0'
                }
            });
            console.log('✅ Initialize response:', response);
            return response;
        } catch (error) {
            console.error('❌ Initialize error:', error);
            throw error;
        }
    }

    async testListTools() {
        console.log('\n🛠️ Testing tools/list...');
        try {
            const response = await this.sendRequest('tools/list');
            console.log('✅ Tools list:', response);
            return response;
        } catch (error) {
            console.error('❌ List tools error:', error);
            throw error;
        }
    }

    async testSearchCodebase() {
        console.log('\n🔍 Testing search_codebase tool...');
        try {
            const response = await this.sendRequest('tools/call', {
                name: 'search_codebase',
                arguments: {
                    query: 'function',
                    limit: 3
                }
            });
            console.log('✅ Search result:', response);
            return response;
        } catch (error) {
            console.error('❌ Search error:', error);
            throw error;
        }
    }

    async testGetStats() {
        console.log('\n📊 Testing get_search_stats tool...');
        try {
            const response = await this.sendRequest('tools/call', {
                name: 'get_search_stats',
                arguments: {}
            });
            console.log('✅ Stats result:', response);
            return response;
        } catch (error) {
            console.error('❌ Stats error:', error);
            throw error;
        }
    }

    async runFullTest() {
        try {
            await this.testInitialize();
            await this.testListTools();
            await this.testGetStats();
            await this.testSearchCodebase();

            console.log('\n✅ All tests completed successfully!');
        } catch (error) {
            console.error('\n❌ Test failed:', error);
        }
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
    console.log('🧪 MCP Debug Client Starting...');

    const client = new MCPDebugClient();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🔄 Shutting down...');
        client.stop();
        process.exit(0);
    });

    try {
        await client.startServer();
        await client.runFullTest();
    } catch (error) {
        console.error('❌ Debug session failed:', error);
    } finally {
        client.stop();
        process.exit(0);
    }
}

main().catch(console.error);
