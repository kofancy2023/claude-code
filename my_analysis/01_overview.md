# Claude Code Best 项目深度分析 - 总览

## 项目概述

**Claude Code Best (CCB)** 是对 Anthropic 官方 Claude Code CLI 工具的逆向工程/反编译版本。目标是将 Claude Code 的核心功能及工程化能力复现。

### 技术栈

| 层级 | 技术选型 |
|------|----------|
| 运行时 | Bun (>= 1.3.11) |
| 构建 | bun build (单文件 bundle ~25MB) |
| 模块系统 | ESM (`"type": "module"`) |
| CLI 框架 | Commander.js |
| UI 框架 | React + Ink (终端渲染) |
| 状态管理 | Zustand-style store |
| API SDK | @anthropic-ai/sdk |
| 协议支持 | AWS Bedrock / Google Vertex / Azure Foundry |

### 目录结构

```
src/
├── entrypoints/          # 入口点
│   ├── cli.tsx          # 真正入口 (polyfill 注入)
│   ├── init.ts          # 一次性初始化
│   └── mcp.ts           # MCP 入口点
├── main.tsx             # Commander.js CLI 定义
├── query.ts             # 核心 API 查询函数
├── QueryEngine.ts       # 查询引擎 (状态管理)
├── screens/             # React/Ink 屏幕组件
│   └── REPL.tsx         # 主交互界面
├── ink/                 # Ink 框架核心
├── services/api/        # API 客户端层
├── tools/               # 工具系统
├── state/               # 状态管理
├── context.ts           # 上下文构建
├── commands/            # CLI 命令实现
├── bridge/              # 远程桥接
├── cli/                 # CLI 处理器
├── components/          # React 组件
├── constants/           # 常量定义
├── hooks/               # React hooks
├── keybindings/         # 快捷键
├── skills/              # Skill 系统
└── types/               # 类型定义
```

## 核心架构流程

```
┌─────────────────────────────────────────────────────────────┐
│                    用户启动 (bun run dev)                     │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  cli.tsx (入口点)                                            │
│  - 注入 feature() polyfill (始终返回 false)                  │
│  - 注入 MACRO 全局变量 (VERSION, BUILD_TIME)                  │
│  - 设置 BUILD_TARGET, BUILD_ENV, INTERFACE_TYPE              │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  main.tsx (Commander.js 定义)                                │
│  - 解析命令行参数                                            │
│  - 初始化服务 (auth, analytics, policy)                      │
│  - 启动 REPL 或管道模式                                       │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  screens/REPL.tsx (交互界面)                                  │
│  - 用户输入处理                                              │
│  - 消息显示                                                  │
│  - 工具权限提示                                              │
│  - 快捷键处理                                                │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  QueryEngine.ts (查询引擎)                                    │
│  - 管理对话状态                                              │
│  - 会话压缩/归因                                             │
│  - 调用 query.ts                                             │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  query.ts (核心查询)                                         │
│  - 发送消息到 Claude API                                     │
│  - 处理流式响应                                              │
│  - 执行工具调用循环                                          │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  services/api/claude.ts (API 客户端)                          │
│  - 构建请求参数                                              │
│  - 调用 Anthropic SDK                                        │
│  - 处理多提供商 (Anthropic/Bedrock/Vertex/Azure)              │
└─────────────────────────────────────────────────────────────┘
```

## Feature Flag 系统

所有 `feature('FLAG_NAME')` 调用来自 `bun:bundle` (构建时 API)。在此反编译版本中，`feature()` 在 `cli.tsx` 中被 polyfill 为始终返回 `false`。

这意味着以下功能被禁用：
- COORDINATOR_MODE (协调器模式)
- KAIROS (时间感知)
- PROACTIVE (主动模式)
- 多代理协作
- 高级分析功能

## 关键文件速查表

| 文件 | 行数 | 职责 |
|------|------|------|
| [src/query.ts](file:///d:/mySource/cusor-proj/claude-code/src/query.ts) | 1700+ | 核心 API 查询循环 |
| [src/QueryEngine.ts](file:///d:/mySource/cusor-proj/claude-code/src/QueryEngine.ts) | 1300+ | 查询引擎/状态管理 |
| [src/screens/REPL.tsx](file:///d:/mySource/cusor-proj/claude-code/src/screens/REPL.tsx) | 5000+ | REPL 交互界面 |
| [src/services/api/claude.ts](file:///d:/mySource/cusor-proj/claude-code/src/services/api/claude.ts) | 800+ | API 客户端 |
| [src/context.ts](file:///d:/mySource/cusor-proj/claude-code/src/context.ts) | 500+ | 上下文构建 |
| [src/tools.ts](file:///d:/mySource/cusor-proj/claude-code/src/tools.ts) | 300+ | 工具注册 |
| [src/state/store.ts](file:///d:/mySource/cusor-proj/claude-code/src/state/store.ts) | 200+ | 状态存储 |
| [src/ink/](file:///d:/mySource/cusor-proj/claude-code/src/ink/) | ~30 文件 | Ink 渲染框架 |

## 工具系统

每个工具在 `src/tools/<ToolName>/` 目录下有自己的模块：

| 工具 | 状态 | 说明 |
|------|------|------|
| BashTool | ✅ | Shell 执行，沙箱，权限检查 |
| FileReadTool | ✅ | 文件/PDF/图片读取 |
| FileEditTool | ✅ | 字符串替换式编辑 |
| FileWriteTool | ✅ | 文件创建/覆写 |
| AgentTool | ✅ | 子代理派生 |
| WebFetchTool | ✅ | URL 抓取 |
| WebSearchTool | ✅ | 网页搜索 |
| GrepTool | ✅ | 代码搜索 |
| GlobTool | ✅ | 文件匹配 |
| MCPTool | ✅ | MCP 协议支持 |
| LSPTool | ✅ | 语言服务器协议 |
| SkillTool | ✅ | Skill 调用 |
| TodoWriteTool | ✅ | Todo 列表 |

## 下一步

1. [核心入口和启动流程分析](./02_entrypoint_analysis.md)
2. [核心循环和查询引擎分析](./03_query_engine_analysis.md)
3. [API 层和服务通信分析](./04_api_layer_analysis.md)
4. [工具系统架构分析](./05_tools_analysis.md)
5. [UI 层（Ink）渲染系统分析](./06_ink_ui_analysis.md)
6. [状态管理和上下文构建分析](./07_state_context_analysis.md)
7. [权限系统和安全机制分析](./08_permissions_analysis.md)
8. [改造优化建议](./09_optimization_suggestions.md)
