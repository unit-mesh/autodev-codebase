# 配置系统维度问题调试记录

## 问题描述

在运行 `npx tsx src/index.ts --demo --log-level=debug` 时发现：
- 期望的 embedding 维度是 768 (代码中设置)
- 实际显示的维度是 1024 (硬编码值)
- 即使修改了模型参数，配置仍然使用默认值

## 问题分析

### 根本原因
1. **硬编码维度**: TUI runner 中硬编码了 `dimension: 1024`
2. **重复配置**: 在多个地方设置了默认配置，导致覆盖关系混乱
3. **CLI 参数未生效**: 命令行参数没有正确传递到配置系统

### 配置加载顺序
```
1. DEFAULT_CONFIG (config.ts)
2. 配置文件 (autodev-config.json)
3. TUI runner defaultConfig (hardcoded) ← 问题所在
4. CLI 参数 (未正确处理)
```

## 解决方案

### 1. 移除硬编码配置
**文件**: `src/cli/tui-runner.ts`

**修改前**:
```typescript
configOptions: {
  configPath,
  defaultConfig: {
    isEnabled: true,
    isConfigured: true,
    embedder: {
      provider: "ollama" as const,
      baseUrl: options.ollamaUrl,
      model: options.model || "dengcao/Qwen3-Embedding-0.6B:f16",
      dimension: 1024  // ← 硬编码问题
    },
    qdrantUrl: options.qdrantUrl
  }
}
```

**修改后**:
```typescript
configOptions: {
  configPath,
  cliOverrides: {
    ollamaUrl: options.ollamaUrl,
    model: options.model,
    qdrantUrl: options.qdrantUrl
  }
}
```

### 2. 增强配置系统支持 CLI 参数
**文件**: `src/adapters/nodejs/config.ts`

**添加接口**:
```typescript
export interface NodeConfigOptions {
  configPath?: string
  defaultConfig?: Partial<CodeIndexConfig>
  cliOverrides?: {
    ollamaUrl?: string
    model?: string
    qdrantUrl?: string
  }
}
```

**修改配置加载逻辑**:
```typescript
// Apply CLI overrides even if config file doesn't exist
if (this.cliOverrides && this.config) {
  if (this.cliOverrides.ollamaUrl) {
    this.config.embedder.baseUrl = this.cliOverrides.ollamaUrl
  }
  if (this.cliOverrides.model) {
    this.config.embedder.model = this.cliOverrides.model
  }
  if (this.cliOverrides.qdrantUrl) {
    this.config.qdrantUrl = this.cliOverrides.qdrantUrl
  }
}
```

### 3. 修正默认配置值
**文件**: `src/adapters/nodejs/config.ts`

```typescript
const DEFAULT_CONFIG: CodeIndexConfig = {
  isEnabled: true,
  isConfigured: true,
  embedder: {
    provider: "ollama",
    model: "nomic-embed-text",    // 使用已知的模型
    dimension: 768,               // 正确的维度
    baseUrl: "http://localhost:11434",
  }
}
```

## 验证结果

### 修复前
```bash
Current configuration: {
  embedder: {
    provider: 'ollama',
    model: 'nomic-embed-text',
    dimension: 1024,  // ← 错误
    baseUrl: 'http://localhost:11434'
  }
}
```

### 修复后
```bash
Current configuration: {
  embedder: {
    provider: 'ollama',
    model: 'test-model~',  // ← CLI 参数生效
    dimension: 768,        // ← 正确的维度
    baseUrl: 'http://localhost:11434'
  }
}
```

## 经验总结

### 最佳实践
1. **单一配置源**: 避免在多个地方设置默认配置
2. **配置优先级**: 建立清晰的配置覆盖顺序
3. **参数传递**: 通过专门的机制传递 CLI 参数，而不是硬编码

### 配置系统设计原则
1. **默认值集中管理**: 所有默认值在 `DEFAULT_CONFIG` 中定义
2. **配置文件覆盖**: 配置文件可以覆盖默认值
3. **CLI 参数优先**: 命令行参数具有最高优先级
4. **类型安全**: 使用 TypeScript 接口确保配置类型安全

### 调试技巧
1. **添加调试日志**: 在关键位置输出配置状态
2. **检查配置文件**: 确认是否有意外的配置文件影响结果
3. **测试参数传递**: 使用不同的 CLI 参数验证传递机制
4. **分步验证**: 逐步检查每个配置加载阶段

## 相关文件

- `src/cli/tui-runner.ts` - TUI 运行器配置
- `src/adapters/nodejs/config.ts` - Node.js 配置适配器
- `src/shared/embeddingModels.ts` - 模型配置定义
- `autodev-config.json` - 配置文件

## 后续改进

1. **动态维度计算**: 根据模型自动确定维度
2. **配置验证**: 增强配置验证机制
3. **模型配置补全**: 完善 embedding 模型配置列表
4. **错误处理**: 改进配置错误的处理和提示

## 第二次调试记录 - CLI 参数覆盖问题

### 问题描述
修改 `DEFAULT_CONFIG` 后，维度配置生效但模型配置仍然不生效，显示 `nomic-embed-text` 而不是预期的模型。

### 根本原因分析
1. **CLI 参数硬编码**: `src/cli/args-parser.ts` 中硬编码了 `model: 'nomic-embed-text'`
2. **配置覆盖机制**: CLI 参数覆盖优先级高于配置文件和 DEFAULT_CONFIG
3. **配置文件路径**: 程序在 `demo/` 目录查找配置文件，而实际配置文件在根目录

### 调试过程
```bash
# 输出显示配置文件查找路径
Attempting to load config from: /Users/anrgct/workspace/autodev-codebase/demo/autodev-config.json

# 实际配置文件位置
/Users/anrgct/workspace/autodev-codebase/autodev-config.json

# CLI 硬编码覆盖了配置
Current configuration: {
  embedder: {
    model: 'nomic-embed-text',  // ← CLI 参数覆盖
    dimension: 768,             // ← DEFAULT_CONFIG 生效
  }
}
```

### 修复方案

#### 1. 修改 CLI 参数默认值
**文件**: `src/cli/args-parser.ts`

**修改前**:
```typescript
const options: CliOptions = {
  // ...
  model: 'nomic-embed-text',  // 硬编码覆盖
  // ...
}
```

**修改后**:
```typescript
const options: CliOptions = {
  // ...
  model: '',  // 空字符串，不覆盖配置
  // ...
}
```

#### 2. 增强配置覆盖逻辑
**文件**: `src/adapters/nodejs/config.ts`

**修改前**:
```typescript
if (this.cliOverrides.model) {
  this.config.embedder.model = this.cliOverrides.model
}
```

**修改后**:
```typescript
if (this.cliOverrides.model && this.cliOverrides.model.trim()) {
  this.config.embedder.model = this.cliOverrides.model
}
```

#### 3. 更新帮助文档
**文件**: `src/cli/args-parser.ts`

更新帮助信息显示正确的默认模型:
```typescript
--model=<model>         Embedding model (default: dengcao/Qwen3-Embedding-0.6B:Q8_0)
```

### 配置优先级机制
```
最高 → CLI 参数 (仅当显式提供时)
     ↓
     配置文件 (autodev-config.json)
     ↓
最低 → DEFAULT_CONFIG
```

### 经验总结

#### 问题诊断方法
1. **添加路径日志**: 确认配置文件加载路径
2. **检查 CLI 参数**: 确认哪些参数被硬编码
3. **验证覆盖逻辑**: 确认配置覆盖的优先级
4. **分离调试**: 逐步排查每个配置源

#### 配置系统设计原则
1. **避免硬编码**: CLI 参数应该是可选的，不应该硬编码默认值
2. **明确优先级**: 建立清晰的配置覆盖顺序
3. **条件覆盖**: 只有在实际提供参数时才应用覆盖
4. **路径一致性**: 确保配置文件路径在所有环境中一致

#### 调试技巧
1. **日志配置路径**: 在配置加载时输出文件路径
2. **分步验证**: 分别验证每个配置源的加载情况
3. **参数跟踪**: 跟踪 CLI 参数的传递和应用过程
4. **配置对比**: 对比期望配置与实际加载的配置

### 后续优化建议
1. **配置文件发现**: 支持多个配置文件位置的自动发现
2. **环境变量支持**: 添加环境变量配置支持
3. **配置验证**: 增强配置加载后的验证机制
4. **错误提示**: 改进配置错误时的提示信息