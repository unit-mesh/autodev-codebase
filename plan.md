# CLI React Polyfill 修复计划

## 问题描述

当前状态：
- ✅ `npx tsx src/index.ts --demo` 可以正常运行
- ❌ `node dist/index.js --demo` 报错：`ReferenceError: self is not defined`

**根本原因**：ES模块的import语句会被提升，导致React/Ink模块在polyfill设置之前就被加载，触发react-devtools-core的浏览器依赖检查。

## 解决方案

### 方案一：创建独立的CLI启动脚本（推荐）

**优点**：
- 完全隔离polyfill逻辑和主代码
- 可靠的执行顺序控制
- 清晰的职责分离

**实现步骤**：

1. **创建专用启动脚本** (`src/cli.ts`)
   ```typescript
   #!/usr/bin/env node

   // 在任何模块加载前设置polyfill
   process.env['NODE_ENV'] = process.env['NODE_ENV'] || 'production';
   global.self = global;
   global.window = global;
   global.document = {};
   global.navigator = { userAgent: 'Node.js' };

   // 动态导入主模块避免提升
   import('./index.js').then(({ main }) => {
     main().catch((error) => {
       console.error('Failed to start TUI:', error);
       process.exit(1);
     });
   });
   ```

2. **重构index.ts**
   ```typescript
   // 移除CLI检测逻辑，纯粹导出main函数
   export async function main() {
     const options = parseArgs();
     // ... CLI逻辑
   }

   // 保留其他导出
   export * from './code-index/manager';
   // ...
   ```

3. **更新构建配置**
   - 修改rollup.config.cjs支持多入口点
   - 更新package.json的bin指向新的CLI脚本

### 方案二：使用CommonJS格式（备选）

**优点**：
- 控制模块加载顺序
- 避免import提升问题

**缺点**：
- 需要重构大量ESM代码
- 可能影响tree-shaking

### 方案三：Node.js启动参数（最简单）

**实现**：
```bash
# 通过启动参数设置全局变量
node --input-type=module -e "global.self=global;global.window=global;global.document={};global.navigator={userAgent:'Node.js'};process.argv=[process.argv[0],'index.js','--demo'];await  import('./dist/index.js')"
```
（方案三已验证可正常运行）
**优点**：
- 无需修改代码
- 立即可用

**缺点**：
- 用户体验不好
- 需要文档说明

## 实施计划

### 第一阶段：实现方案一

1. **创建CLI启动脚本** (`src/cli.ts`)
   - 设置完整的浏览器全局变量polyfill
   - 使用动态import避免模块提升
   - 添加错误处理和退出逻辑

2. **重构主模块** (`src/index.ts`)
   - 导出main函数供CLI脚本调用
   - 移除CLI检测和直接执行逻辑
   - 保持其他功能导出不变

3. **更新构建系统**
   - 修改rollup配置支持多入口构建
   - 确保cli.ts正确编译到dist/cli.js
   - 更新package.json的bin字段

4. **测试验证**
   - 验证`node dist/cli.js --demo`正常工作
   - 确保所有CLI参数功能正常
   - 测试构建流程的稳定性

### 第二阶段：优化和清理

1. **代码优化**
   - 清理不必要的polyfill代码
   - 优化错误处理逻辑
   - 添加详细的日志输出

2. **文档更新**
   - 更新README中的使用说明
   - 添加构建和开发说明
   - 记录架构决策

3. **测试完善**
   - 添加不同Node.js版本的测试
   - 验证在不同操作系统下的兼容性
   - 测试边界情况和错误场景

## 实施结果

### ✅ 方案一实施完成（2025-06-23）

**最终实现方案**：使用Node.js spawn方式执行polyfill

**技术方案**：
```typescript
// src/cli.ts - 最终实现
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, 'index.js');

// 构建包含polyfill的命令
const command = `
global.self = global;
global.window = global;
global.document = { createElement: () => ({}), addEventListener: () => {}, removeEventListener: () => {} };
global.navigator = { userAgent: 'Node.js' };
global.HTMLElement = class HTMLElement {};
global.Element = class Element {};
process.env['NODE_ENV'] = process.env['NODE_ENV'] || 'production';
process.env['REACT_EDITOR'] = 'none';
process.env['DISABLE_REACT_DEVTOOLS'] = 'true';
process.argv = [process.argv[0], '${indexPath}', ...process.argv.slice(2)];
await import('${indexPath}').then(({ main }) => main());
`;

// 使用spawn执行，确保polyfill在任何模块加载前生效
const child = spawn('node', ['--input-type=module', '-e', command], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', REACT_EDITOR: 'none', DISABLE_REACT_DEVTOOLS: 'true' }
});
```

**关键变更**：

1. **CLI启动脚本** (`src/cli.ts`) ✅
   - 采用spawn方式而非动态import，彻底避免模块提升问题
   - 基于方案三的成功验证，包装为用户友好的CLI
   - 设置完整的浏览器polyfill和环境变量

2. **主模块重构** (`src/index.ts`) ✅
   - 移除shebang和polyfill代码
   - 导出main函数供CLI调用
   - 保留所有库导出功能

3. **构建系统更新** ✅
   - rollup配置支持多入口：`dist/index.js` + `dist/cli.js`
   - package.json bin字段指向 `dist/cli.js`
   - 保持ESM格式和所有现有功能

4. **测试验证** ✅
   - `node dist/cli.js --demo` 成功运行，无polyfill错误
   - TUI界面正常显示，开始索引进程
   - 保持库功能完整性

### 预期结果达成状况

✅ **已完成**：
- ✅ `node dist/cli.js --demo` 正常运行（无React polyfill错误）
- ✅ 保持库功能完整性（所有导出正常）
- ✅ 清晰的代码架构和职责分离
- ✅ 稳定的构建流程（多入口点支持）
- ✅ 良好的错误处理和用户体验

### 技术要点总结

**核心解决方案**：
- **问题根因**：ES模块import提升导致React模块在polyfill前加载
- **解决思路**：使用Node.js spawn + 内联脚本，确保polyfill优先执行
- **关键技术**：基于方案三验证成功的命令行模式，封装为用户友好CLI

**架构优势**：
- 完全隔离：CLI逻辑与库代码分离
- 可靠执行：spawn确保执行顺序，避免模块提升
- 用户友好：维持标准CLI使用体验
- 向后兼容：库导出功能不受影响

**后续维护**：
- 如需添加新的浏览器API polyfill，在cli.ts的command字符串中补充
- 新增CLI参数直接传递给main函数，无需修改spawn逻辑
- 构建流程稳定，rollup多入口配置可复用于其他场景

## 风险评估

**已验证低风险**：
- ✅ 核心逻辑未变更，仅重构CLI启动方式
- ✅ 有明确回滚路径（恢复原index.ts即可）
- ✅ 现有功能完全保持，库导出无影响
- ✅ 构建流程稳定，支持持续集成

**实际遇到问题及解决**：
- ✅ **已解决**：Tree-sitter WASM文件未打包到dist目录
  - **问题**：tree-sitter语言解析器WASM文件没有被复制到dist目录
  - **解决方案**：更新rollup.config.cjs的copyFilesPlugin，在generateBundle阶段复制tree-sitter WASM文件
  - **具体实现**：
    ```javascript
    // Copy tree-sitter WASM files from src/tree-sitter to dist
    const treeSitterSrcDir = path.join(srcDir, "src", "tree-sitter")
    const treeSitterDistDir = path.join(distDir, "tree-sitter")
    // 复制所有.wasm文件到dist/tree-sitter/目录
    ```

- ✅ **已解决**：ESM模块中`__dirname`未定义问题
  - **问题**：打包后的代码中`__dirname`在ESM环境下未定义，导致tree-sitter parser加载失败
  - **解决方案**：在CLI polyfill中添加`__dirname`全局变量定义
  - **具体实现**：
    ```javascript
    // 在CLI spawn的command中添加
    global.__dirname = dirname(fileURLToPath(import.meta.url));
    ```

- Ink raw mode警告（非阻塞性，TUI正常工作）
- 这些修复确保了tree-sitter解析器能正常加载和工作
