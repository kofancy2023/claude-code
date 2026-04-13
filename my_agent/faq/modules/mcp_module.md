# MCP (Model Context Protocol) 模块设计

## 概述

MCP 是一个连接 AI Agent 与外部工具/资源的标准协议，参考 Anthropic 的 MCP 规范设计。本实现提供了一个轻量级的 MCP 客户端，支持 HTTP、WebSocket 和 Stdio 三种传输方式。

## 工作原理详解

### 生活比喻：图书馆的智能助理

想象你是一个**作家**，你需要写一本关于"中国古代历史"的书。

#### 没有 MCP 的情况

```
你（AI）                        图书馆
   │                              │
   │  "帮我查秦始皇的资料"          │
   │ ──────────────────────────→   │
   │                              │
   │  ❌ 我不知道你的图书馆有什么    │
   │  ❌ 我不知道资料在哪里          │
   │  ❌ 我可能会给你错误的信息      │
   │ ←──────────────────────────   │
```

**问题**：AI 不了解你的项目、文件、工具，它只能靠"猜"。

#### 有 MCP 的情况

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP 工作流程                              │
└─────────────────────────────────────────────────────────────────┘

  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
  │   AI (你)     │         │   MCP 客户端  │         │   MCP 服务器  │
  │              │         │              │         │  (你的项目)   │
  └──────────────┘         └──────────────┘         └──────────────┘
         │                        │                        │
         │  1. 连接 MCP 服务器     │                        │
         │ ──────────────────────→│                        │
         │                        │                        │
         │  2. 获取能力清单         │                        │
         │ ──────────────────────→│                        │
         │                        │  "我知道这些资源："       │
         │                        │  - src/ 目录            │
         │                        │  - docs/ 目录           │
         │                        │  - Git 仓库             │
         │                        │                        │
         │←────────────────────────────────────────────── │
         │                        │                        │
         │  3. "请给我秦始皇的资料" │                        │
         │ ──────────────────────→│                        │
         │                        │  搜索资源...            │
         │                        │──────────┐              │
         │                        │          │              │
         │                        │←─────────┘              │
         │                        │                        │
         │  4. 返回精确的资料       │                        │
         │ ←───────────────────────│                        │
         │                        │                        │
```

### MCP 核心概念

| 概念 | 比喻 | 实际作用 |
|------|------|---------|
| **MCP Server** | 图书馆管理员 | 管理你的项目资源（文件、Git、API等） |
| **MCP Client** | 作家的助手 | 连接服务器，帮你获取信息 |
| **Resource** | 图书馆的书 | 文件、文档、配置等 |
| **Tool** | 图书馆的查询系统 | 搜索、读取、执行操作 |
| **Prompt** | 查询模板 | 预定义的问题模板 |

### 完整流程图

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           用户提问                                          │
│                    "帮我查看 src/index.ts 的内容"                             │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                          AI 分析请求                                         │
│              "用户想读取文件，我需要调用 MCP 资源"                            │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                       MCP Client                                            │
│  1. 解析 URI: file:///src/index.ts                                        │
│  2. 找到对应的 Provider: FileSystemProvider                                │
│  3. 调用 provider.readResource("file:///src/index.ts")                     │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    FileSystemProvider                                      │
│  执行: fs.readFileSync("src/index.ts")                                     │
│  返回: 文件内容                                                             │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                          AI 收到结果                                         │
│              "文件内容是...，我来帮你分析这段代码"                             │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                          返回给用户                                          │
└────────────────────────────────────────────────────────────────────────────┘
```

### 实际使用场景

#### 场景1：AI 需要知道项目的结构

```
用户: "我的项目结构是什么样的？"

AI 内部:
  1. 调用 mcp.listResources()
  2. 收到: ["src/index.ts", "src/utils/helper.ts", "docs/README.md"]
  3. 调用 mcp.readResource("file:///src/index.ts")
  4. 读取文件内容
  5. 返回: "你的项目有 src/ 和 docs/ 两个目录..."
```

#### 场景2：AI 需要搜索代码

```
用户: "帮我找到所有使用 'TODO' 注释的地方"

AI 内部:
  1. 调用 mcp.listTools() → 找到 "grep" 工具
  2. 调用 mcp.callTool("grep", { pattern: "TODO" })
  3. 服务器执行 grep
  4. 返回搜索结果
```

#### 场景3：AI 需要 GitHub 信息

```
用户: "我的仓库有哪些未解决的 Issue？"

AI 内部:
  1. 调用 mcp.listResources() → 找到 GitHub 服务器
  2. 调用 mcp.readResource("github://repo/issues?state=open")
  3. GitHub Provider 请求 GitHub API
  4. 返回 Issue 列表
```

### 一句话总结

```
MCP = AI 的"眼睛"和"手"
让 AI 能看到你的项目、文件、工具，然后帮你操作它们
```

## 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Client                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │   HTTP      │  │  WebSocket  │  │   Stdio     │       │
│  │  Transport  │  │  Transport  │  │  Transport  │       │
│  └─────────────┘  └─────────────┘  └─────────────┘       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐       │
│  │              Message Protocol                    │       │
│  │  - Initialize    - ToolCall                     │       │
│  │  - ResourcesList - ResourceRead                │       │
│  │  - Subscribe     - Unsubscribe                 │       │
│  └─────────────────────────────────────────────────┘       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐       │
│  │           Resource Providers                     │       │
│  │  ┌─────────────┐  ┌─────────────┐              │       │
│  │  │ FileSystem  │  │   GitHub    │  ...         │       │
│  │  │  Provider   │  │  Provider   │              │       │
│  │  └─────────────┘  └─────────────┘              │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## 目录结构

```
src/mcp/
├── types.ts                    # 类型定义
├── client.ts                   # MCP 客户端核心实现
├── index.ts                    # 模块导出
└── providers/
    ├── FileSystemProvider.ts   # 文件系统资源提供者
    └── GitHubProvider.ts       # GitHub 资源提供者
```

## 类型系统

### MCPMessageType

定义所有 MCP 消息类型：

```typescript
export enum MCPMessageType {
  Initialize = 'initialize',           // 初始化请求
  InitializeResult = 'initialize/result',
  ToolCall = 'tools/call',            // 工具调用
  ToolCallResult = 'tools/call/result',
  ResourcesList = 'resources/list',    // 资源列表
  ResourcesListResult = 'resources/list/result',
  ResourceRead = 'resources/read',    // 资源读取
  ResourceReadResult = 'resources/read/result',
  ResourceSubscribe = 'resources/subscribe',
  ResourceUnsubscribe = 'resources/unsubscribe',
  Error = 'error',
}
```

### MCPResourceType

定义支持的资源类型：

```typescript
export enum MCPResourceType {
  FileSystem = 'filesystem',   // 本地文件系统
  GitHub = 'github',           // GitHub 仓库
  Database = 'database',       // 数据库
  HttpApi = 'http_api',        // HTTP API
  Custom = 'custom',           // 自定义
}
```

### 核心接口

```typescript
// MCP 客户端接口
export interface MCPClient {
  name: string;
  version: string;

  connect(config: MCPServerConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getCapabilities(): MCPCapabilities;

  callTool(request: MCPToolCallRequest): Promise<MCPToolCallResult>;
  listResources(): Promise<MCPResource[]>;
  readResource(uri: string): Promise<string>;
  subscribeResource(uri: string): Promise<void>;
  unsubscribeResource(uri: string): Promise<void>;
  onResourceChange(callback: ResourceChangeCallback): void;
}

// 资源提供者接口
export interface ResourceProvider {
  name: string;
  type: MCPResourceType;

  list(): Promise<MCPResource[]>;
  read(uri: string): Promise<string>;
  exists(uri: string): Promise<boolean>;
  getMetadata(uri: string): Promise<Record<string, unknown> | undefined>;
}
```

## MCP 客户端

### 创建客户端

```typescript
import { createMCPClient } from './mcp';

const client = createMCPClient({
  clientName: 'my-agent',
  clientVersion: '1.0.0',
  protocolVersion: '2024-11-05',
  requestTimeout: 30000,
  retryAttempts: 3,
});
```

### 连接到服务器

```typescript
// HTTP 连接
await client.connect({
  name: 'github-mcp',
  url: 'https://api.github.com',
  transport: 'http',
});

// WebSocket 连接
await client.connect({
  name: 'realtime-mcp',
  url: 'wss://mcp.example.com',
  transport: 'websocket',
});

// Stdio 连接 (本地进程)
await client.connect({
  name: 'local-mcp',
  command: 'npx',
  args: ['mcp-server', '--port', '3000'],
  transport: 'stdio',
});
```

### 使用资源

```typescript
// 列出资源
const resources = await client.listResources();

// 读取资源
const content = await client.readResource('file:///path/to/file.txt');
const githubContent = await client.readResource('github://owner/repo/path/to/file.ts');

// 订阅资源变更
await client.subscribeResource('file:///path/to/watch.txt');

client.onResourceChange((notification) => {
  console.log('Resource changed:', notification.uri, notification.changeType);
});
```

## 资源提供者

### FileSystemProvider

提供对本地文件系统的访问。

```typescript
import { createFileSystemProvider } from './mcp/providers/FileSystemProvider';

const provider = createFileSystemProvider({
  rootPath: '/project',                    // 根目录
  blockedPaths: ['/node_modules', '/.git'], // 黑名单
  maxFileSize: 10 * 1024 * 1024,           // 10MB
  allowedExtensions: ['.ts', '.js', '.md'], // 扩展名过滤
});

// 列出资源
const resources = await provider.list();

// 读取文件
const content = await provider.read('file:///project/src/index.ts');

// 检查存在
const exists = await provider.exists('file:///project/package.json');

// 获取元数据
const metadata = await provider.getMetadata('file:///project/package.json');
```

### GitHubProvider

提供对 GitHub API 的访问。

```typescript
import { createGitHubProvider } from './mcp/providers/GitHubProvider';

const provider = createGitHubProvider({
  token: process.env.GITHUB_TOKEN,
  baseUrl: 'https://api.github.com',  // GitHub Enterprise 可自定义
  defaultBranch: 'main',
});

// 列出仓库内容
const resources = await provider.listRepository('owner', 'repo', 'src');

// 读取文件
const content = await provider.read('github://owner/repo/src/index.ts');

// 获取仓库信息
const repoInfo = await provider.getRepositoryInfo('owner', 'repo');

// 获取提交历史
const commits = await provider.getCommits('owner', 'repo', 'src/index.ts');

// 获取分支列表
const branches = await provider.getBranches('owner', 'repo');
```

## URI 格式

| 提供者 | URI 格式 | 示例 |
|--------|----------|------|
| FileSystem | `file:///path/to/file` | `file:///D:/project/src/index.ts` |
| GitHub | `github://owner/repo/path` | `github://kofancy2023/claude-code/README.md` |

## 安全考虑

1. **路径验证**: FileSystemProvider 支持黑名单路径过滤
2. **文件大小限制**: 可配置最大文件大小
3. **扩展名过滤**: 可限制只访问特定类型的文件
4. **Token 管理**: GitHubProvider 支持通过环境变量配置 Token
5. **连接验证**: 所有连接都有超时和重试机制

## 错误处理

```typescript
import { MCPError } from './mcp/types';

try {
  await client.readResource('file:///nonexistent/file.txt');
} catch (error) {
  if (error instanceof MCPError) {
    console.error(`MCP Error: ${error.code} - ${error.message}`);
    if (error.statusCode) {
      console.error(`HTTP Status: ${error.statusCode}`);
    }
  }
}
```

## 扩展资源提供者

可以通过实现 `ResourceProvider` 接口创建自定义资源提供者：

```typescript
import type { ResourceProvider, MCPResource, MCPResourceType } from './types';

class DatabaseProvider implements ResourceProvider {
  readonly name = 'database';
  readonly type = 'database' as MCPResourceType;

  async list(): Promise<MCPResource[]> {
    // 返回数据库表列表
  }

  async read(uri: string): Promise<string> {
    // 执行查询并返回结果
  }

  async exists(uri: string): Promise<boolean> {
    // 检查表/视图是否存在
  }

  async getMetadata(uri: string): Promise<Record<string, unknown> | undefined> {
    // 返回表结构信息
  }
}

// 注册到客户端
client.registerResourceProvider(new DatabaseProvider());
```

## 下一步计划

- [ ] WebSocket 传输实现
- [ ] Stdio 传输实现
- [ ] 数据库资源提供者
- [ ] 更多 GitHub API 支持 (Issues, PRs, Actions)
- [ ] 资源变更实时通知
