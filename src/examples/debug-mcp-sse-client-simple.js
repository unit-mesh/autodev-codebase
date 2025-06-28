#!/usr/bin/env node

/**
 * Simplified SSE client for testing MCP server HTTP/SSE functionality
 * Uses native Node.js HTTP client instead of external dependencies
 */

import { spawn } from 'child_process';
import http from 'http';
import { URL } from 'url';

class SimpleMCPSSEClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'http://localhost:3001';
        this.requests = new Map();
        this.requestId = 0;
        this.serverProcess = null;
        this.sseConnection = null;
        this.connected = false;
    }

    async startServer() {
        console.log('🚀 Starting MCP HTTP Server process...');

        this.serverProcess = spawn('npx', [
            'tsx',
            'src/index.ts',
            'mcp-server',
            // '--demo',
            '--port=3001',
            '--host=localhost'
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env },
            cwd: process.cwd()
        });

        this.serverProcess.stderr.on('data', (data) => {
            console.log('🔍 Server Log:', data.toString());
        });

        this.serverProcess.stdout.on('data', (data) => {
            console.log('📊 Server Output:', data.toString());
        });

        this.serverProcess.on('error', (error) => {
            console.error('❌ Server Error:', error);
        });

        this.serverProcess.on('exit', (code) => {
            console.log(`🔄 Server exited with code ${code}`);
        });

        await this.waitForServer();
        return this;
    }

    async waitForServer(maxAttempts = 30) {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const health = await this.httpRequest('/health', 'GET');
                console.log('✅ Server is ready:', health);
                return;
            } catch (error) {
                // Server not ready yet
            }
            
            console.log(`⏳ Attempt ${i + 1}/${maxAttempts} - waiting for server...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        throw new Error('Server failed to start within timeout');
    }

    async connectSSE() {
        console.log('🔌 Connecting to SSE endpoint...');
        
        return new Promise((resolve, reject) => {
            const url = new URL('/sse', this.baseUrl);
            
            const req = http.request({
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'GET',
                headers: {
                    'Accept': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                }
            }, (res) => {
                console.log(`✅ SSE connection established (${res.statusCode})`);
                this.connected = true;
                this.sseConnection = res;
                resolve();

                res.setEncoding('utf8');
                let buffer = '';

                res.on('data', (chunk) => {
                    buffer += chunk;
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Keep incomplete line in buffer

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6); // Remove 'data: ' prefix
                            if (data.trim()) {
                                this.handleServerMessage(data);
                            }
                        }
                    }
                });

                res.on('end', () => {
                    console.log('🔌 SSE connection ended');
                    this.connected = false;
                });

                res.on('error', (error) => {
                    console.error('❌ SSE error:', error);
                    this.connected = false;
                });
            });

            req.on('error', (error) => {
                console.error('❌ SSE request error:', error);
                reject(error);
            });

            req.end();
        });
    }

    handleServerMessage(data) {
        try {
            const message = JSON.parse(data);
            console.log('📨 SSE Received:', JSON.stringify(message, null, 2));

            if (message.id && this.requests.has(message.id)) {
                const { resolve } = this.requests.get(message.id);
                this.requests.delete(message.id);
                resolve(message);
            }
        } catch (error) {
            console.log('📊 SSE Raw Data:', data);
        }
    }

    async httpRequest(path, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const postData = data ? JSON.stringify(data) : null;

            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
                }
            };

            const req = http.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseData);
                        resolve(parsed);
                    } catch (error) {
                        resolve(responseData);
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (postData) {
                req.write(postData);
            }

            req.end();
        });
    }

    async sendRequest(method, params = {}) {
        const id = ++this.requestId;
        const request = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        console.log('📤 Sending HTTP POST:', JSON.stringify(request, null, 2));

        return new Promise(async (resolve, reject) => {
            this.requests.set(id, { resolve, reject });

            const timeout = setTimeout(() => {
                if (this.requests.has(id)) {
                    this.requests.delete(id);
                    reject(new Error(`Request ${id} timed out`));
                }
            }, 30000);

            try {
                await this.httpRequest('/messages', 'POST', request);
                // Response should come via SSE
            } catch (error) {
                clearTimeout(timeout);
                this.requests.delete(id);
                reject(error);
            }
        });
    }

    async testHealthCheck() {
        console.log('\n❤️ Testing health check...');
        try {
            const health = await this.httpRequest('/health', 'GET');
            console.log('✅ Health check response:', health);
            return health;
        } catch (error) {
            console.error('❌ Health check error:', error);
            throw error;
        }
    }

    async testInitialize() {
        console.log('\n🔧 Testing initialize...');
        try {
            const response = await this.sendRequest('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {
                    roots: { listChanged: true },
                    sampling: {}
                },
                clientInfo: {
                    name: 'simple-sse-debug-client',
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
                    query: 'CodeIndexManager',
                    limit: 50,
                    filters: {
                        pathFilters: ['src/examples/tui/SearchInterface.tsx']   
                    }
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

    async runInteractiveMode() {
        console.log('\n🎮 Entering interactive mode...');
        console.log('Type commands or "quit" to exit:');
        console.log('  search <query>     - Search codebase');
        console.log('  stats              - Get search stats');
        console.log('  tools              - List available tools');
        console.log('  help               - Show this help');
        console.log('  quit               - Exit interactive mode');

        const readline = await import('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: '🔍 mcp> '
        });

        rl.prompt();

        rl.on('line', async (line) => {
            const [command, ...args] = line.trim().split(' ');

            try {
                switch (command) {
                    case 'search':
                        if (args.length === 0) {
                            console.log('❌ Usage: search <query>');
                        } else {
                            const query = args.join(' ');
                            await this.sendRequest('tools/call', {
                                name: 'search_codebase',
                                arguments: { query, limit: 5 }
                            });
                        }
                        break;

                    case 'stats':
                        await this.sendRequest('tools/call', {
                            name: 'get_search_stats',
                            arguments: {}
                        });
                        break;

                    case 'tools':
                        await this.sendRequest('tools/list');
                        break;

                    case 'help':
                        console.log('Available commands:');
                        console.log('  search <query>     - Search codebase');
                        console.log('  stats              - Get search stats');
                        console.log('  tools              - List available tools');
                        console.log('  help               - Show this help');
                        console.log('  quit               - Exit interactive mode');
                        break;

                    case 'quit':
                        console.log('👋 Exiting interactive mode...');
                        rl.close();
                        return;

                    default:
                        if (command) {
                            console.log(`❌ Unknown command: ${command}`);
                            console.log('Type "help" for available commands');
                        }
                        break;
                }
            } catch (error) {
                console.error('❌ Command error:', error.message);
            }

            rl.prompt();
        });

        return new Promise((resolve) => {
            rl.on('close', resolve);
        });
    }

    async runFullTest() {
        const results = { passed: 0, failed: 0, tests: [] };
        const tests = [
            // { name: 'Health Check', fn: () => this.testHealthCheck() },
            // { name: 'Initialize', fn: () => this.testInitialize() },
            // { name: 'List Tools', fn: () => this.testListTools() },
            // { name: 'Get Stats', fn: () => this.testGetStats() },
            { name: 'Search Codebase', fn: () => this.testSearchCodebase() }
        ];

        for (const test of tests) {
            try {
                console.log(`\n🧪 Running test: ${test.name}`);
                await test.fn();
                results.passed++;
                results.tests.push({ name: test.name, status: 'PASSED' });
                console.log(`✅ ${test.name} - PASSED`);
            } catch (error) {
                results.failed++;
                results.tests.push({ name: test.name, status: 'FAILED', error: error.message });
                console.error(`❌ ${test.name} - FAILED:`, error.message);
            }
        }

        console.log('\n📊 Test Results Summary:');
        console.log(`✅ Passed: ${results.passed}`);
        console.log(`❌ Failed: ${results.failed}`);
        console.log(`📝 Total: ${results.tests.length}`);

        return results;
    }

    stop() {
        if (this.sseConnection) {
            console.log('🔌 Closing SSE connection...');
            this.sseConnection.destroy();
        }
        
        if (this.serverProcess) {
            console.log('🔄 Stopping server...');
            this.serverProcess.kill('SIGTERM');
        }
    }
}

async function main() {
    console.log('🧪 Simple MCP SSE Debug Client Starting...');

    const args = process.argv.slice(2);
    const interactiveMode = args.includes('--interactive') || args.includes('-i');

    const client = new SimpleMCPSSEClient({
        baseUrl: process.env.MCP_BASE_URL || 'http://localhost:3001'
    });

    process.on('SIGINT', () => {
        console.log('\n🔄 Shutting down...');
        client.stop();
        process.exit(0);
    });

    try {
        await client.startServer();
        await client.connectSSE();
        
        if (interactiveMode) {
            // Run interactive mode
            await client.runInteractiveMode();
        } else {
            // Run automated tests
            const results = await client.runFullTest();
            
            if (results.failed === 0) {
                console.log('\n🎉 All tests passed successfully!');
            } else {
                console.log(`\n⚠️ ${results.failed} test(s) failed`);
            }
        }
        
    } catch (error) {
        console.error('❌ Debug session failed:', error);
    } finally {
        client.stop();
        process.exit(0);
    }
}

main().catch(console.error);
