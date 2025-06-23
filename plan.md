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

## 预期结果

完成后将实现：
- ✅ `node dist/cli.js --demo` 正常运行
- ✅ 保持`npx tsx src/index.ts --demo`的兼容性
- ✅ 清晰的代码架构和职责分离
- ✅ 稳定的构建流程
- ✅ 良好的错误处理和用户体验

## 风险评估

**低风险**：
- 主要是代码重构，不涉及核心逻辑变更
- 有明确的回滚路径
- 现有功能保持不变

**注意事项**：
- 确保polyfill的完整性，避免遗漏其他浏览器API
- 测试各种CLI参数组合的兼容性
- 注意构建输出的文件权限设置
