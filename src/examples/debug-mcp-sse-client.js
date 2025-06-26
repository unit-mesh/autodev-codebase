#!/usr/bin/env node

/**
 * Debug client for testing MCP server SSE functionality
 * This script helps debug the codebase MCP server over HTTP/SSE
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

class MCPSSEClient extends EventEmitter {
    constructor(options = {}) {
        super();
        this.baseUrl = options.baseUrl || 'http://localhost:3002';
        this.requests = new Map();
        this.requestId = 0;
        this.eventSource = null;
        this.serverProcess = null;
        this.connected = false;
    }

    async startServer() {
        console.log('🚀 Starting MCP HTTP Server process...');

        // Start the MCP server in HTTP mode
        this.serverProcess = spawn('npx', [
            'tsx',
            'src/index.ts',
            'mcp-server',
            '--demo',
            '--port=3002',
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

        // Wait for server to start
        console.log('⏳ Waiting for server to start...');
        await this.waitForServer();
        
        return this;
    }

    async waitForServer(maxAttempts = 30) {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const response = await fetch(`${this.baseUrl}/health`);
                if (response.ok) {
                    const health = await response.json();
                    console.log('✅ Server is ready:', health);
                    return;
                }
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
            // Use dynamic import for EventSource in Node.js
            import('eventsource').then(({ default: EventSource }) => {
                this.eventSource = new EventSource(`${this.baseUrl}/mcp`);
                
                this.eventSource.onopen = () => {
                    console.log('✅ SSE connection established');
                    this.connected = true;
                    resolve();
                };
                
                this.eventSource.onmessage = (event) => {
                    this.handleServerMessage(event.data);
                };
                
                this.eventSource.onerror = (error) => {
                    console.error('❌ SSE connection error:', error);
                    if (!this.connected) {
                        reject(error);
                    }
                };
            }).catch(reject);
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

            // Set timeout
            const timeout = setTimeout(() => {
                if (this.requests.has(id)) {
                    this.requests.delete(id);
                    reject(new Error(`Request ${id} timed out`));
                }
            }, 30000);

            try {
                const response = await fetch(`${this.baseUrl}/mcp`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(request)
                });

                if (!response.ok) {
                    clearTimeout(timeout);
                    this.requests.delete(id);
                    reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                }
                
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
            const response = await fetch(`${this.baseUrl}/health`);
            const health = await response.json();
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
                    roots: {
                        listChanged: true
                    },
                    sampling: {}
                },
                clientInfo: {
                    name: 'sse-debug-client',
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

    async testConfigureSearch() {
        console.log('\n⚙️ Testing configure_search tool...');
        try {
            const response = await this.sendRequest('tools/call', {
                name: 'configure_search',
                arguments: {
                    action: 'refresh_index'
                }
            });
            console.log('✅ Configure result:', response);
            return response;
        } catch (error) {
            console.error('❌ Configure error:', error);
            throw error;
        }
    }

    async testAdvancedSearch() {
        console.log('\n🔍 Testing advanced search with filters...');
        try {
            const response = await this.sendRequest('tools/call', {
                name: 'search_codebase',
                arguments: {
                    query: 'typescript class',
                    limit: 5,
                    filters: {
                        fileTypes: ['.ts', '.tsx'],
                        pathPatterns: ['src/']
                    }
                }
            });
            console.log('✅ Advanced search result:', response);
            return response;
        } catch (error) {
            console.error('❌ Advanced search error:', error);
            throw error;
        }
    }

    async runFullTest() {
        const results = {
            passed: 0,
            failed: 0,
            tests: []
        };

        const tests = [
            { name: 'Health Check', fn: () => this.testHealthCheck() },
            { name: 'Initialize', fn: () => this.testInitialize() },
            { name: 'List Tools', fn: () => this.testListTools() },
            { name: 'Get Stats', fn: () => this.testGetStats() },
            { name: 'Search Codebase', fn: () => this.testSearchCodebase() },
            { name: 'Advanced Search', fn: () => this.testAdvancedSearch() },
            { name: 'Configure Search', fn: () => this.testConfigureSearch() }
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

        if (results.failed > 0) {
            console.log('\n❌ Failed tests:');
            results.tests
                .filter(t => t.status === 'FAILED')
                .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
        }

        return results;
    }

    stop() {
        if (this.eventSource) {
            console.log('🔌 Closing SSE connection...');
            this.eventSource.close();
        }
        
        if (this.serverProcess) {
            console.log('🔄 Stopping server...');
            this.serverProcess.kill('SIGTERM');
        }
    }
}

// Main execution
async function main() {
    console.log('🧪 MCP SSE Debug Client Starting...');

    const client = new MCPSSEClient({
        baseUrl: process.env.MCP_BASE_URL || 'http://localhost:3002'
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🔄 Shutting down...');
        client.stop();
        process.exit(0);
    });

    try {
        // Start server and connect
        await client.startServer();
        await client.connectSSE();
        
        // Run all tests
        const results = await client.runFullTest();
        
        if (results.failed === 0) {
            console.log('\n🎉 All tests passed successfully!');
        } else {
            console.log(`\n⚠️ ${results.failed} test(s) failed`);
        }
        
    } catch (error) {
        console.error('❌ Debug session failed:', error);
    } finally {
        client.stop();
        process.exit(0);
    }
}

// Install eventsource if not available
async function checkDependencies() {
    try {
        await import('eventsource');
    } catch (error) {
        console.log('📦 Installing eventsource dependency...');
        const { spawn } = await import('child_process');
        return new Promise((resolve, reject) => {
            const install = spawn('npm', ['install', 'eventsource'], { stdio: 'inherit' });
            install.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ eventsource installed successfully');
                    resolve();
                } else {
                    reject(new Error('Failed to install eventsource'));
                }
            });
        });
    }
}

// Run with dependency check
checkDependencies()
    .then(() => main())
    .catch(console.error);
