# AI Agent 工具开发教程 - MVP 计划

## 项目概述

我们将构建一个类似 Claude Code 的 AI Agent 命令行工具，具有以下核心功能：

```
┌─────────────────────────────────────────────────────────────────┐
│                         AI Agent CLI                            │
├─────────────────────────────────────────────────────────────────┤
│  用户输入 ──▶ REPL ──▶ QueryEngine ──▶ API ──▶ 工具执行 ──▶ 输出  │
└─────────────────────────────────────────────────────────────────┘
```

## 核心架构

```
┌──────────────────────────────────────────────────────────────┐
│                        CLI Entry                              │
│                    (src/entrypoints/cli.ts)                  │
└─────────────────────────────┬────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                      REPL Loop                                │
│                   (src/core/Repl.ts)                         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  1. 读取用户输入                                          │ │
│  │  2. 追加到消息历史                                        │ │
│  │  3. 调用 QueryEngine                                      │ │
│  │  4. 渲染响应                                             │ │
│  │  5. 处理工具调用                                          │ │
│  │  6. 循环直到用户退出                                       │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Query Engine                               │
│                 (src/core/QueryEngine.ts)                    │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  1. 构建请求上下文                                       │ │
│  │  2. 调用 API                                             │ │
│  │  3. 解析响应                                             │ │
│  │  4. 处理工具调用请求                                       │ │
│  │  5. 返回响应或继续循环                                     │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                      API Layer                                │
│                  (src/services/api/)                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │
│  │  Anthropic  │ │   AWS        │ │   Google     │          │
│  │  (Primary)  │ │   Bedrock    │ │   Vertex     │          │
│  └──────────────┘ └──────────────┘ └──────────────┘          │
└─────────────────────────────┬────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     Tool System                                │
│                    (src/tools/)                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │
│  │  BashTool    │ │  FileTool    │ │  EditTool    │          │
│  └──────────────┘ └──────────────┘ └──────────────┘          │
└─────────────────────────────┬────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    State Management                           │
│                  (src/state/store.ts)                         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  messages[], tools[], settings, permissions             │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## MVP 功能列表

### Phase 1: 核心最小功能 (MVP)

| 步骤 | 功能 | 文件 | 说明 |
|------|------|------|------|
| 1 | 项目基础结构 | package.json, tsconfig | 依赖和配置 |
| 2 | CLI 入口 | src/index.ts | 命令行入口 |
| 3 | 简单 REPL | src/core/Repl.ts | 输入输出循环 |
| 4 | Anthropic API | src/services/api/AnthropicClient.ts | API 调用 |
| 5 | 消息历史 | src/state/store.ts | 状态管理 |
| 6 | 最小工具集 | src/tools/BashTool.ts | 执行命令 |

### Phase 2: 完整核心功能

| 步骤 | 功能 | 文件 | 说明 |
|------|------|------|------|
| 7 | 工具注册系统 | src/tools/registry.ts | 工具发现和注册 |
| 8 | 权限系统 | src/services/permissions.ts | 安全检查 |
| 9 | 终端 UI | src/ui/terminal.ts | Ink 渲染 |
| 10 | 错误处理 | src/utils/errors.ts | 异常处理 |

### Phase 3: 高级功能

| 步骤 | 功能 | 说明 |
|------|------|------|
| 11 | 多 Provider 支持 | AWS Bedrock, Google Vertex |
| 12 | 对话压缩 | 消息历史压缩 |
| 13 | 上下文窗口 | 智能窗口管理 |

## 技术栈选择

### 为什么选择这些技术？

| 技术 | 选择原因 | 备选方案 |
|------|----------|----------|
| **TypeScript** | 类型安全，IDE 支持好 | JavaScript |
| **Bun** | 快速启动，内置 TypeScript | Node.js |
| **Ink** | React 语法，支持终端 UI | Blessed, 原始 TTY |
| **Zustand** | 极简状态管理 | Redux, MobX |
| **Anthropic SDK** | 官方客户端 | 裸 HTTP 调用 |

### 项目结构

```
my_agent/
├── src/
│   ├── index.ts                 # CLI 入口
│   ├── entrypoints/
│   │   └── cli.ts               # CLI 主程序
│   ├── core/
│   │   ├── Repl.ts              # REPL 循环
│   │   └── QueryEngine.ts       # 查询引擎
│   ├── services/
│   │   ├── api/
│   │   │   ├── AnthropicClient.ts
│   │   │   └── BaseClient.ts
│   │   └── permissions.ts       # 权限服务
│   ├── tools/
│   │   ├── registry.ts           # 工具注册表
│   │   ├── BaseTool.ts          # 工具基类
│   │   ├── BashTool.ts          # Bash 工具
│   │   └── FileTool.ts          # 文件工具
│   ├── state/
│   │   └── store.ts             # 状态管理
│   ├── ui/
│   │   └── terminal.ts         # 终端渲染
│   └── types/
│       └── index.ts             # 类型定义
├── package.json
├── tsconfig.json
└── docs/
    ├── 01_project_structure.md
    ├── 02_repl_implementation.md
    └── ...
```

## 开发顺序详解

### Step 1: 项目基础结构

**目标**: 搭建可运行的项目框架

**交付物**:
- `package.json` - 依赖声明
- `tsconfig.json` - TypeScript 配置
- `src/index.ts` - 入口文件

**关键决策**:
1. **Bun vs Node.js**: 选择 Bun 因为启动快，内置 TypeScript 支持
2. **模块格式**: ESM (`"type": "module"`) - 现代标准
3. **依赖最小化**: 只添加核心依赖

### Step 2: REPL 循环

**目标**: 实现用户输入输出循环

**核心概念**:
```
┌────────────────────────────────────────┐
│           REPL Loop                    │
├────────────────────────────────────────┤
│  while (running) {                     │
│    input = await readLine()            │
│    if (input === 'exit') break         │
│    response = await process(input)    │
│    print(response)                    │
│  }                                    │
└────────────────────────────────────────┘
```

### Step 3: API 层

**目标**: 调用 Anthropic API

**关键点**:
1. 使用 `@anthropic-ai/sdk` 官方 SDK
2. 实现流式响应
3. 处理 API 错误

### Step 4: 工具系统

**目标**: 支持工具调用

**核心概念**:
```
用户: "列出当前目录文件"
LLM:  <invoke name="BashTool">
        <parameter name="command">ls</parameter>
      </invoke>
Agent: 执行 ls 命令，返回结果给 LLM
LLM:  "当前目录有以下文件..."
```

### Step 5: 状态管理

**目标**: 管理对话历史和应用状态

**核心概念**:
```typescript
interface AppState {
  messages: Message[]       // 对话历史
  tools: Tool[]             // 可用工具
  settings: Settings        // 用户设置
  permissions: Permission[] // 权限规则
}
```

### Step 6: 权限系统

**目标**: 控制工具执行安全

**核心概念**:
```typescript
// 权限模式
type PermissionMode = 'auto' | 'manual' | 'plan'

// 权限检查
async function checkPermission(tool: Tool, input: unknown): Promise<boolean> {
  if (mode === 'auto') return true
  if (mode === 'manual') return await askUser()
  // ...
}
```

## 学习目标

完成本教程后，你将掌握：

1. **架构设计**: 如何设计一个可扩展的 Agent 系统
2. **核心模式**: REPL、工具调用、状态管理
3. **安全考量**: 权限控制和输入验证
4. **性能优化**: 流式响应、增量渲染
5. **代码组织**: 清晰的分层架构

## 下一步

开始 [Step 1: 项目基础结构](./02_step1_project_structure.md)

---

*本教程参考 Claude Code Best 项目架构*
