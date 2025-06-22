# TUI Development Plan

## 项目概述

基于 Ink (React for CLI) 的终端用户界面，为 AutoDev Codebase 库提供交互式代码索引和搜索体验。

## 当前架构状态 ✅

### 已完成的核心组件

#### 1. 主应用框架
- **文件**: `src/examples/tui/App.tsx`
- **功能**:
  - 全局状态管理
  - 视图切换 (Tab键导航)
  - 键盘事件处理
  - 组件编排

#### 2. 配置面板
- **文件**: `src/examples/tui/ConfigPanel.tsx`
- **功能**:
  - 显示 Ollama/Qdrant 配置
  - 展示模型和 URL 设置
  - 配置状态指示器

#### 3. 进度监控器
- **文件**: `src/examples/tui/ProgressMonitor.tsx`
- **功能**:
  - 实时索引进度条
  - 系统状态显示
  - 文件处理统计

#### 4. 搜索界面
- **文件**: `src/examples/tui/SearchInterface.tsx`
- **功能**:
  - 交互式搜索输入
  - 实时结果展示
  - 键盘导航支持

#### 5. 日志面板
- **文件**: `src/examples/tui/LogPanel.tsx`
- **功能**:
  - 彩色日志显示
  - 自动滚动和截断
  - 错误高亮

#### 6. 演示运行器
- **文件**: `src/examples/run-demo-tui.tsx`
- **功能**:
  - CodeIndexManager 初始化
  - 示例文件生成
  - 应用启动逻辑

## 开发计划 🚀

### 阶段一：核心增强 (高优先级)

#### 1. 文件浏览器组件 🔴
**文件**: `src/examples/tui/FileBrowser.tsx`

**目标**: 创建交互式文件浏览器，展示已索引的文件

**功能需求**:
- 树形文件结构显示
- 文件过滤和搜索
- 文件详情预览
- 键盘导航 (箭头键、Enter选择)

**界面设计**:
```
┌─ File Browser ──────────────────────────┐
│ 📁 demo/                                │
│   📄 hello.js                   [4 KB] │
│   📄 utils.py                   [2 KB] │
│   📄 README.md                  [1 KB] │
│   📄 config.json                [500B] │
│                                         │
│ Filter: [_______________]               │
│ Selected: hello.js                      │
└─────────────────────────────────────────┘
```

**技术要点**:
- 使用 `CodeIndexManager.getIndexedFiles()` 获取文件列表
- 实现文件树展开/折叠逻辑
- 添加文件大小和修改时间显示

#### 2. 性能指标面板 🔴
**文件**: `src/examples/tui/MetricsPanel.tsx`

**目标**: 显示系统性能和统计信息

**功能需求**:
- 索引速度统计
- 内存使用情况
- 向量存储统计
- 搜索响应时间

**界面设计**:
```
┌─ Performance Metrics ───────────────────┐
│ Indexing Speed:    120 files/min        │
│ Memory Usage:      45.2 MB              │
│ Vector Store:      1,247 embeddings     │
│ Avg Search Time:   0.034s               │
│                                         │
│ ▓▓▓▓▓▓▓░░░ CPU: 67%                     │
│ ▓▓▓▓░░░░░░ Memory: 42%                  │
└─────────────────────────────────────────┘
```

### 阶段二：交互性提升 (中优先级)

#### 3. 可编辑配置面板 🟡
**增强**: `src/examples/tui/ConfigPanel.tsx`

**目标**: 将只读配置面板升级为可编辑界面

**功能需求**:
- 内联编辑 Ollama URL
- 模型选择下拉菜单
- 配置保存和验证
- 重启提示机制

**新增方法**:
- `handleConfigEdit(key, value)`
- `saveConfiguration()`
- `validateAndRestart()`

#### 4. 增强交互式搜索功能 🔴
**文件**: `src/examples/tui/SearchInterface.tsx`

**目标**: 大幅提升搜索体验的交互性和功能性

**当前功能**:
- ✅ 基础搜索输入和结果显示
- ✅ 键盘导航 (Enter搜索、↑↓选择)
- ✅ 结果高亮和分页显示

**重点增强需求**:
- **实时搜索建议**: 输入时显示搜索建议
- **高级过滤器**: 文件类型、路径模式、相似度阈值
- **搜索历史**: 最近搜索记录和快速重用
- **结果预览**: 展开显示完整代码片段
- **跳转功能**: 支持跳转到外部编辑器
- **搜索统计**: 显示索引大小、搜索时间等指标
- **保存搜索**: 收藏常用搜索查询

**新增快捷键**:
- `Space`: 展开/折叠结果详情
- `S`: 保存当前搜索
- `H`: 显示搜索历史
- `F`: 打开过滤器面板
- `O`: 在外部编辑器中打开文件

### 阶段三：用户体验优化 (低优先级)

#### 5. 帮助系统 🟢
**文件**: `src/examples/tui/HelpPanel.tsx`

**目标**: 集成的帮助和文档系统

**功能需求**:
- 键盘快捷键列表
- 功能使用指南
- 故障排除提示
- 版本信息显示

**界面设计**:
```
┌─ Help & Shortcuts ──────────────────────┐
│ Navigation:                             │
│   Tab          Switch between panels    │
│   Ctrl+Q       Quit application         │
│   Escape       Go back/Cancel           │
│                                         │
│ Search:                                 │
│   Enter        Execute search           │
│   ↑/↓          Navigate results         │
│                                         │
│ File Browser:                           │
│   Space        Preview file             │
│   Enter        Open in editor           │
└─────────────────────────────────────────┘
```

#### 6. 搜索性能优化 🟢
**增强**: `src/examples/tui/SearchInterface.tsx`

**目标**: 优化大型代码库的搜索性能

**功能需求**:
- 搜索结果缓存机制
- 增量搜索和防抖处理
- 异步加载和虚拟滚动
- 搜索索引预热

## 技术规范

### 依赖项
- `ink: ^6.0.0` - React for CLI
- `react: ^19.1.0` - React 框架
- `ink-text-input` - 输入组件
- `ink-select-input` - 选择组件

### 组件接口规范

```typescript
interface TUIComponentProps {
  codeIndexManager: CodeIndexManager | null;
  onStateChange?: (state: any) => void;
  isActive?: boolean;
}

interface PanelState {
  currentView: 'progress' | 'search' | 'config' | 'logs' | 'files' | 'metrics' | 'help';
  searchQuery: string;
  searchResults: SearchResult[];
  config: AppConfig;
  logs: LogEntry[];
  selectedFile?: string;
}
```

### 键盘导航标准
- `Tab`: 切换面板
- `Shift+Tab`: 反向切换
- `Ctrl+Q`: 退出应用
- `Escape`: 返回/取消
- `Enter`: 确认/执行
- `↑/↓`: 列表导航
- `Space`: 选择/预览

### 样式约定
- 使用 `chalk` 进行颜色管理
- 统一的边框样式 (`┌─┐│└─┘`)
- 一致的状态指示器 (`✅❌⏳🔍`)
- 响应式布局适配

## 开发流程

### 1. 开发环境设置
```bash
npm install
npm run build
npm run demo-tui  # 启动TUI演示，由用户手动测试
```

### 2. 组件开发指南
1. 创建新组件文件于 `src/examples/tui/`
2. 实现 `TUIComponentProps` 接口
3. 添加键盘事件处理
4. 集成到主 `App.tsx` 组件
5. 更新视图切换逻辑

### 3. 测试策略
- 手动测试各组件交互
- 验证键盘导航流畅性
- 测试错误处理和边界情况
- 确认性能表现

## 部署和分发

### 构建命令
```bash
npm run build        # 构建库
npm run demo-tui     # 运行TUI演示
```

### 打包发布
- 作为 `@autodev/codebase` 库的一部分
- TUI 组件作为可选功能
- 提供独立的演示脚本

## 里程碑时间线

### 第1周: 交互式搜索增强 (重点) ✅ **已完成 2025-06-21**
- [x] 搜索历史和建议功能 ✅
  - 实时搜索建议 (输入2+字符后自动显示)
  - 搜索历史记录 (保存最近20次搜索)
  - Ctrl+H 快捷键打开历史面板
  - 基于历史的智能补全功能
- [x] 高级过滤器面板 ✅
  - 文件类型过滤、相似度阈值、路径模式匹配
  - Ctrl+F 快捷键打开过滤器面板
  - 活跃过滤器指示器
  - 智能结果过滤应用
- [x] 结果详情展开/折叠 ✅
  - Space 键展开/折叠个别结果详情
  - 视觉指示器 (📄 折叠态, 📖 展开态)
  - 完整代码内容显示
  - 选中结果边框高亮
- [x] 外部编辑器跳转 ✅
  - Ctrl+O 快捷键打开外部编辑器
  - 多编辑器支持 (优先VS Code, 后备系统默认)
  - 精确行号定位
  - 跨平台兼容性 (macOS/Linux)

### 第2周: 文件浏览器 + 配置编辑
- [ ] FileBrowser.tsx 实现
- [ ] ConfigPanel 可编辑升级
- [ ] 性能指标显示

### 第3周: 用户体验优化
- [ ] HelpPanel.tsx 实现
- [ ] 搜索性能优化
- [ ] 键盘导航完善

### 第4周: 测试和优化
- [ ] 全面功能测试
- [ ] 性能优化
- [ ] 文档完善
- [ ] 发布准备

## 成功标准

1. **功能完整性**: 所有计划功能正常工作
2. **用户体验**: 流畅的键盘导航和响应
3. **性能表现**: 大型代码库下的稳定性
4. **代码质量**: 清晰的组件结构和可维护性
5. **文档齐全**: 完整的使用指南和API文档

## 风险管理

### 潜在风险
- Ink 框架限制导致的UI约束
- 大型代码库的性能问题
- 键盘事件冲突

### 缓解策略
- 早期原型验证可行性
- 分批加载和虚拟滚动
- 标准化键盘事件处理

---

**最后更新**: 2025-06-21
**状态**: 第1周任务已完成，进入第2周开发
**版本**: v1.0.0-beta

## 🎉 第1周完成总结 (2025-06-21)

### 主要成就
✅ **SearchInterface.tsx 重大增强** - 文件从基础搜索界面升级为功能完整的高级搜索系统

### 新增功能详情
1. **智能搜索体验**
   - 键盘快捷键系统 (Ctrl+H/F/S/O + Space)
   - 搜索统计跟踪 (总搜索次数、平均响应时间)
   - 保存的搜索收藏夹功能

2. **增强的用户界面**
   - 搜索建议实时显示
   - 活跃过滤器状态指示
   - 结果展开状态视觉反馈
   - 改进的导航和布局

3. **技术架构改进**
   - 状态管理优化 (新增6个状态变量)
   - 事件处理增强 (支持10+种键盘交互)
   - 外部进程集成 (编辑器启动)
   - 性能监控集成

### 开发统计
- **代码行数**: 从 122 行增加到 416 行 (+242%)
- **新增接口**: 2个 (SearchFilter, SavedSearch)
- **新增功能函数**: 4个 (generateSuggestions, saveCurrentSearch, openInExternalEditor, 增强的performSearch)
- **键盘快捷键**: 从 4个增加到 10个

### 测试状态
✅ **TypeScript编译通过**
✅ **TUI演示可运行** (存在终端兼容性警告，不影响核心功能)

---
