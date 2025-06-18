/**
 * Integration tests for core library functionality
 * Tests that the abstracted core works with different platform adapters
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { createSimpleNodeDependencies } from '../../adapters/nodejs'
import { CacheManager } from '../../code-index/cache-manager'
import { StateManager } from '../../code-index/state-manager'
import { ConfigManager } from '../../code-index/config-manager'
import { DirectoryScanner } from '../../code-index/processors/scanner'
import { EmbedderProvider } from '../../code-index/interfaces/manager'

describe('Core Library Integration', () => {
  let tempDir: string
  let workspacePath: string
  let dependencies: ReturnType<typeof createSimpleNodeDependencies>

  beforeAll(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'core-lib-test-'))
    workspacePath = path.join(tempDir, 'test-workspace')
    await fs.mkdir(workspacePath, { recursive: true })
    
    dependencies = createSimpleNodeDependencies(workspacePath)
  })

  afterAll(async () => {
    // Clean up temporary directory
    await fs.rmdir(tempDir, { recursive: true })
  })

  describe('CacheManager Integration', () => {
    let cacheManager: CacheManager

    beforeEach(() => {
      cacheManager = new CacheManager(
        dependencies.fileSystem,
        dependencies.storage,
        workspacePath
      )
    })

    it('should initialize and create cache directory', async () => {
      await cacheManager.initialize()
      
      const cacheDir = dependencies.storage.createCachePath(workspacePath)
      expect(await dependencies.fileSystem.exists(cacheDir)).toBe(true)
    })

    it('should save and load cache data', async () => {
      await cacheManager.initialize()
      
      const testData = [
        { id: 'test1', content: 'Hello World', embedding: [0.1, 0.2, 0.3] },
        { id: 'test2', content: 'Goodbye World', embedding: [0.4, 0.5, 0.6] }
      ]
      
      await cacheManager.saveCache(testData)
      const loadedData = await cacheManager.loadCache()
      
      expect(loadedData).toEqual(testData)
    })

    it('should handle cache clearing', async () => {
      await cacheManager.initialize()
      
      const testData = [{ id: 'test', content: 'test', embedding: [1, 2, 3] }]
      await cacheManager.saveCache(testData)
      
      await cacheManager.clearCache()
      const loadedData = await cacheManager.loadCache()
      
      expect(loadedData).toEqual([])
    })
  })

  describe('StateManager Integration', () => {
    let stateManager: StateManager

    beforeEach(() => {
      stateManager = new StateManager(dependencies.eventBus)
    })

    it('should track indexing progress', (done) => {
      const unsubscribe = stateManager.onProgressUpdate((progress) => {
        expect(progress.processed).toBe(5)
        expect(progress.total).toBe(10)
        expect(progress.currentFile).toBe('test.ts')
        unsubscribe()
        done()
      })

      stateManager.updateProgress(5, 10, 'test.ts')
    })

    it('should manage indexing state', () => {
      expect(stateManager.isIndexing()).toBe(false)
      
      stateManager.setIndexing(true)
      expect(stateManager.isIndexing()).toBe(true)
      
      stateManager.setIndexing(false)
      expect(stateManager.isIndexing()).toBe(false)
    })
  })

  describe('ConfigManager Integration', () => {
    let configManager: ConfigManager

    beforeEach(() => {
      configManager = new ConfigManager(dependencies.configProvider)
    })

    it('should initialize with default configuration', async () => {
      await configManager.initialize()
      
      const config = configManager.getCurrentConfig()
      expect(config).toBeDefined()
      expect(config.embedderProvider).toBe(EmbedderProvider.OpenAI)
    })

    it('should detect configuration changes', async () => {
      await configManager.initialize()
      
      const initialConfig = configManager.getCurrentConfig()
      
      // Simulate configuration change
      await dependencies.configProvider.saveConfig({
        isEnabled: true,
        embedderProvider: EmbedderProvider.Ollama
      })
      
      await configManager.initialize() // Reload config
      const newConfig = configManager.getCurrentConfig()
      
      expect(newConfig.isEnabled).toBe(true)
      expect(newConfig.embedderProvider).toBe(EmbedderProvider.Ollama)
      expect(configManager.hasConfigChanged(initialConfig)).toBe(true)
    })
  })

  describe('DirectoryScanner Integration', () => {
    let scanner: DirectoryScanner

    beforeEach(async () => {
      // Create test files in workspace
      const srcDir = path.join(workspacePath, 'src')
      await dependencies.fileSystem.mkdir(srcDir)
      
      const testFiles = [
        { path: 'src/index.ts', content: 'export * from "./utils"' },
        { path: 'src/utils.ts', content: 'export function hello() { return "world" }' },
        { path: 'src/component.tsx', content: 'export const Component = () => <div>Hello</div>' },
        { path: 'README.md', content: '# Test Project' }
      ]
      
      for (const file of testFiles) {
        const filePath = path.join(workspacePath, file.path)
        const dir = path.dirname(filePath)
        
        if (!(await dependencies.fileSystem.exists(dir))) {
          await dependencies.fileSystem.mkdir(dir)
        }
        
        await dependencies.fileSystem.writeFile(
          filePath, 
          new TextEncoder().encode(file.content)
        )
      }

      // Initialize scanner with dependencies
      scanner = new DirectoryScanner({
        fileSystem: dependencies.fileSystem,
        workspace: dependencies.workspace,
        pathUtils: dependencies.pathUtils,
        logger: dependencies.logger,
        embedder: null as any, // Mock embedder for testing
        qdrantClient: null as any, // Mock qdrant client for testing
        cacheManager: new CacheManager(
          dependencies.fileSystem,
          dependencies.storage,
          workspacePath
        ),
        eventBus: dependencies.eventBus
      })
    })

    it('should discover files in workspace', async () => {
      const files = await scanner.discoverFiles(workspacePath)
      
      expect(files.length).toBeGreaterThan(0)
      
      // Should include TypeScript files
      const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
      expect(tsFiles.length).toBeGreaterThanOrEqual(2)
      
      // Should include markdown files
      const mdFiles = files.filter(f => f.endsWith('.md'))
      expect(mdFiles.length).toBeGreaterThanOrEqual(1)
    })

    it('should filter files by supported extensions', async () => {
      const allFiles = await dependencies.workspace.findFiles('*')
      const supportedFiles = await scanner.discoverFiles(workspacePath)
      
      // Supported files should be a subset of all files
      expect(supportedFiles.length).toBeLessThanOrEqual(allFiles.length)
      
      // Should not include non-code files (if any were created)
      const nonCodeFiles = supportedFiles.filter(f => 
        !f.endsWith('.ts') && 
        !f.endsWith('.tsx') && 
        !f.endsWith('.md') &&
        !f.endsWith('.js') &&
        !f.endsWith('.jsx')
      )
      expect(nonCodeFiles.length).toBe(0)
    })
  })

  describe('Cross-Platform Compatibility', () => {
    it('should work with different path separators', async () => {
      const testPath = dependencies.pathUtils.join('src', 'components', 'Button.tsx')
      const normalized = dependencies.pathUtils.normalize(testPath)
      
      expect(normalized).toBe(path.normalize(testPath))
      
      const isAbsolute = dependencies.pathUtils.isAbsolute(normalized)
      expect(isAbsolute).toBe(false)
      
      const absolutePath = dependencies.pathUtils.resolve(workspacePath, testPath)
      expect(dependencies.pathUtils.isAbsolute(absolutePath)).toBe(true)
    })

    it('should handle workspace operations consistently', async () => {
      const relativePath = 'src/test.ts'
      const fullPath = path.join(workspacePath, relativePath)
      
      // Create file
      await dependencies.fileSystem.writeFile(
        fullPath,
        new TextEncoder().encode('// Test file')
      )
      
      // Verify workspace operations
      expect(dependencies.workspace.getRelativePath(fullPath)).toBe(relativePath)
      expect(dependencies.workspace.getRootPath()).toBe(workspacePath)
      
      const found = await dependencies.workspace.findFiles('*.ts')
      expect(found).toContain(fullPath)
    })

    it('should maintain event consistency across components', (done) => {
      let eventCount = 0
      const expectedEvents = 3
      
      const unsubscribe = dependencies.eventBus.on('cross-platform-test', (data) => {
        eventCount++
        expect(data.source).toBeDefined()
        
        if (eventCount === expectedEvents) {
          unsubscribe()
          done()
        }
      })
      
      // Emit events from different "components"
      dependencies.eventBus.emit('cross-platform-test', { source: 'cache-manager' })
      dependencies.eventBus.emit('cross-platform-test', { source: 'scanner' })
      dependencies.eventBus.emit('cross-platform-test', { source: 'config-manager' })
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing files gracefully', async () => {
      const configManager = new ConfigManager(dependencies.configProvider)
      
      // This should not throw even if config file doesn't exist
      await expect(configManager.initialize()).resolves.not.toThrow()
    })

    it('should handle invalid file operations', async () => {
      const invalidPath = path.join(workspacePath, 'non-existent', 'deeply', 'nested', 'file.txt')
      
      // Reading non-existent file should handle gracefully
      await expect(dependencies.fileSystem.readFile(invalidPath)).rejects.toThrow()
      
      // But exists should return false
      expect(await dependencies.fileSystem.exists(invalidPath)).toBe(false)
    })

    it('should handle workspace operations on empty directories', async () => {
      const emptyDir = path.join(tempDir, 'empty-workspace')
      await dependencies.fileSystem.mkdir(emptyDir)
      
      const emptyDeps = createSimpleNodeDependencies(emptyDir)
      const files = await emptyDeps.workspace.findFiles('*')
      
      expect(files).toEqual([])
    })
  })

  describe('Performance and Resource Management', () => {
    it('should handle large file operations efficiently', async () => {
      const largeContent = 'x'.repeat(1024 * 1024) // 1MB content
      const largePath = path.join(workspacePath, 'large-file.txt')
      
      const startTime = Date.now()
      
      await dependencies.fileSystem.writeFile(
        largePath,
        new TextEncoder().encode(largeContent)
      )
      
      const readContent = await dependencies.fileSystem.readFile(largePath)
      const readText = new TextDecoder().decode(readContent)
      
      const endTime = Date.now()
      
      expect(readText).toBe(largeContent)
      expect(endTime - startTime).toBeLessThan(5000) // Should complete in under 5 seconds
    })

    it('should clean up resources properly', async () => {
      const eventBus = dependencies.eventBus
      const initialListenerCount = (eventBus as any).listenerCount?.('test-cleanup') || 0
      
      // Add some listeners
      const unsubscribe1 = eventBus.on('test-cleanup', () => {})
      const unsubscribe2 = eventBus.on('test-cleanup', () => {})
      const unsubscribe3 = eventBus.once('test-cleanup', () => {})
      
      // Verify listeners were added
      const withListeners = (eventBus as any).listenerCount?.('test-cleanup') || 0
      expect(withListeners).toBeGreaterThan(initialListenerCount)
      
      // Clean up
      unsubscribe1()
      unsubscribe2()
      unsubscribe3()
      
      // Verify cleanup (for EventBus implementations that support listenerCount)
      if ((eventBus as any).listenerCount) {
        const afterCleanup = (eventBus as any).listenerCount('test-cleanup')
        expect(afterCleanup).toBeLessThanOrEqual(withListeners)
      }
    })
  })
})