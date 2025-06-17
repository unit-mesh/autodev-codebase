# Codebase 库抽离实施计划

## 项目背景

从 roo-code VSCode 插件中抽离 `packages/codebase`，使其成为独立的、跨平台的代码分析库。

## 核心价值

- **平台无关性** - 支持 Node.js、Web、其他编辑器
- **高复用性** - 可集成到多种代码分析工具
- **易维护性** - 清晰的架构边界和依赖关系

## 当前问题分析

### VSCode 强耦合点
1. **存储依赖** - `vscode.ExtensionContext` 用于缓存路径
2. **事件系统** - `vscode.Event/EventEmitter` 事件通知
3. **文件系统** - `vscode.workspace.fs` 文件操作
4. **外部模块** - `utils/path`、`ContextProxy`、`RooIgnoreController`

### 影响模块
- `code-index/manager.ts` - 核心管理器
- `code-index/cache-manager.ts` - 缓存管理
- `code-index/processors/file-watcher.ts` - 文件监控
- `codebaseSearchTool.ts` - 搜索工具

## 抽离策略

### 策略1：依赖注入模式
通过接口抽象和依赖注入实现解耦，保持现有功能完整性。

### 策略2：分层架构
```
Application Layer    (VSCode Plugin / Node.js App)
     ↓
Adapter Layer       (Platform-specific implementations)
     ↓
Core Library        (Platform-agnostic business logic)
```

## 实施计划

### 第一阶段：基础抽象 (2天)

#### Day 1: 核心接口设计
**创建抽象接口**
```typescript
// src/abstractions/core.ts
interface IFileSystem {
  readFile(uri: string): Promise<Uint8Array>
  writeFile(uri: string, content: Uint8Array): Promise<void>
  exists(uri: string): Promise<boolean>
}

interface IStorage {
  getGlobalStorageUri(): string
  createCachePath(workspacePath: string): string
}

interface IEventBus<T = any> {
  emit(event: string, data: T): void
  on(event: string, handler: (data: T) => void): () => void
}


```

**优先级文件**
- [ ] `src/abstractions/core.ts`
- [ ] `src/abstractions/workspace.ts`
- [ ] `src/abstractions/config.ts`

#### Day 2: VSCode 适配器实现
**适配器实现**
```typescript
// src/adapters/vscode/index.ts
export class VSCodeFileSystem implements IFileSystem
export class VSCodeStorage implements IStorage
export class VSCodeEventBus implements IEventBus
```

**优先级文件**
- [ ] `src/adapters/vscode/file-system.ts`
- [ ] `src/adapters/vscode/storage.ts`
- [ ] `src/adapters/vscode/event-bus.ts`

### 第二阶段：核心解耦 (3天)

#### Day 3-4: CacheManager 重构
**重构目标**
- 移除 `vscode.ExtensionContext` 依赖
- 使用 `IStorage` 和 `IFileSystem` 接口
- 保持原有缓存逻辑不变

**修改文件**
- [ ] `src/code-index/cache-manager.ts`
- [ ] `src/code-index/interfaces/cache.ts`
- [ ] `src/code-index/__tests__/cache-manager.spec.ts`

#### Day 5: 事件系统重构
**重构目标**
- 所有 `vscode.Event` 替换为 `IEventBus`
- 保持事件订阅和发布机制
- 更新相关测试用例

**修改文件**
- [ ] `src/code-index/state-manager.ts`
- [ ] `src/code-index/interfaces/manager.ts`
- [ ] `src/code-index/processors/file-watcher.ts`

### 第三阶段：外部依赖处理 (2天)

#### Day 6: 配置和工作空间抽象
**创建配置接口**
```typescript
interface IConfigProvider {
  getEmbedderConfig(): Promise<EmbedderConfig>
  getVectorStoreConfig(): Promise<VectorStoreConfig>
  isCodeIndexEnabled(): boolean
}

interface IWorkspace {
  getRootPath(): string | undefined
  getRelativePath(fullPath: string): string
  getIgnoreRules(): string[]
}
```

**修改文件**
- [ ] `src/code-index/config-manager.ts`
- [ ] `src/code-index/manager.ts`
- [ ] `src/tree-sitter/index.ts`

#### Day 7: 移除外部模块依赖
**替换策略**
- `utils/path` → `IWorkspace.getRootPath()`
- `ContextProxy` → `IConfigProvider`
- `RooIgnoreController` → `IWorkspace.getIgnoreRules()`

**修改文件**
- [ ] `src/codebaseSearchTool.ts` → 标记为可选集成
- [ ] `src/code-index/processors/scanner.ts`
- [ ] `src/glob/list-files.ts`

### 第四阶段：构建和集成 (2天)

#### Day 8: 构建配置
**包配置更新**
```json
{
  "name": "@autodev/codebase",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "peerDependencies": {
    "vscode": "^1.74.0"
  },
  "peerDependenciesMeta": {
    "vscode": { "optional": true }
  }
}
```

**构建文件**
- [ ] `package.json` 依赖更新
- [ ] `rollup.config.cjs` 外部化 vscode
- [ ] `tsconfig.lib.json` 类型配置

#### Day 9: 使用示例和测试
**集成示例**
```typescript
// VSCode 环境
const codebase = new CodeIndexManager({
  fileSystem: new VSCodeFileSystem(),
  storage: new VSCodeStorage(context),
  eventBus: new VSCodeEventBus(),
  workspace: new VSCodeWorkspace(),
  config: new VSCodeConfigProvider(contextProxy)
})

// Node.js 环境
const codebase = new CodeIndexManager({
  fileSystem: new NodeFileSystem(),
  storage: new FileStorage('./cache'),
  eventBus: new SimpleEventBus(),
  workspace: new NodeWorkspace(process.cwd()),
  config: new JSONConfigProvider('./config.json')
})
```

**测试文件**
- [ ] `examples/vscode-usage.ts`
- [ ] `examples/nodejs-usage.ts`
- [ ] 集成测试套件

## 测试策略

### 单元测试
- [ ] 抽象接口测试覆盖
- [ ] 适配器实现验证
- [ ] 核心业务逻辑测试

### 集成测试
- [ ] VSCode 环境完整流程
- [ ] Node.js 环境独立运行
- [ ] 性能基准测试

### 回归测试
- [ ] 原有功能保持不变
- [ ] API 兼容性验证
- [ ] 错误处理机制

## 风险控制

### 技术风险
- **复杂度增加** - 限制抽象层数，避免过度设计
- **性能损失** - 基准测试验证，关键路径优化
- **兼容性破坏** - 渐进式迁移，保持向后兼容

### 进度风险
- **时间估算偏差** - 每日检查点，及时调整
- **依赖阻塞** - 并行开发，最小化关键路径
- **质量风险** - 代码审查，自动化测试

## 成功指标

### 功能指标
- [ ] 100% 功能完整性保持
- [ ] VSCode 插件零修改迁移
- [ ] Node.js 环境独立运行

### 质量指标
- [ ] 测试覆盖率 ≥ 85%
- [ ] TypeScript 零错误
- [ ] 性能降低 < 5%

### 架构指标
- [ ] 循环依赖为 0
- [ ] 平台特定代码隔离
- [ ] 接口职责单一清晰

## 交付成果

### 代码交付
1. **核心库** - 独立的 `@autodev/codebase` 包
2. **适配器** - VSCode 和 Node.js 适配器实现
3. **示例** - 多平台集成使用示例

### 文档交付
1. **API 文档** - 完整的接口说明
2. **迁移指南** - 从耦合版本的升级路径
3. **最佳实践** - 使用建议和性能优化

### 工具交付
1. **构建脚本** - 自动化打包和发布
2. **测试套件** - 完整的测试覆盖
3. **CI/CD** - 持续集成和部署流程

## 后续规划

### 短期目标 (1-2周)
- 完成基础抽离和验证
- 发布 alpha 版本
- 收集初步反馈

### 中期目标 (1个月)
- 稳定 API 设计
- 完善文档和示例
- 发布 beta 版本

### 长期目标 (3个月)
- 生态集成扩展
- 性能优化和特性增强
- 发布正式版本

---

**预计总时间投入：9个工作日**
**关键里程碑：阶段2完成后可进行初步验证**
