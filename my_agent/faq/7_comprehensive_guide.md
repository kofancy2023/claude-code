# My Agent CLI 使用指南

> 本文档详细说明 My Agent CLI 的架构原理、配置使用、命令系统、错误处理等核心功能。

---

## 目录

1. [系统架构](#1-系统架构)
2. [快速开始](#2-快速开始)
3. [配置系统](#3-配置系统)
4. [CLI 命令详解](#4-cli-命令详解)
5. [错误处理与重试机制](#5-错误处理与重试机制)
6. [熔断器模式](#6-熔断器模式)
7. [API 提供商](#7-api-提供商)
8. [工具注册表](#8-工具注册表)
9. [会话管理](#9-会话管理)

---

## 1. 系统架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              入口层                                      │
│                          src/index.ts                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            CLI 层                                       │
│                       src/entrypoints/cli.ts                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     │
│  │ Config加载  │  │ 权限配置    │  │ 错误上报    │                     │
│  └─────────────┘  └─────────────┘  └─────────────┘                     │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           REPL 核心层                                    │
│                        src/core/Repl.ts                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ 命令解析    │  │ 消息处理    │  │ 流式输出   │  │ 会话管理   │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
           ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
           │ QueryEngine  │ │ ToolRegistry │ │  Permissions  │
           │  多轮对话引擎 │ │   工具注册表  │ │   权限系统   │
           └──────────────┘ └──────────────┘ └──────────────┘
                    │
                    ▼
           ┌──────────────┐
           │ ResilientClient│ ← 包装所有 API 客户端
           │  (重试+熔断) │
           └──────────────┘
                    │
                    ▼
           ┌──────────────────────────────────────┐
           │           AI 提供商                   │
           │  Anthropic │ OpenAI兼容 │ Gemini     │
           └──────────────────────────────────────┘
```

### 1.2 核心模块职责

| 模块 | 文件位置 | 核心职责 |
|------|----------|----------|
| **CLI 入口** | `src/entrypoints/cli.ts` | 应用启动、配置加载 |
| **REPL** | `src/core/Repl.ts` | 命令行交互循环 |
| **QueryEngine** | `src/core/QueryEngine.ts` | 多轮工具调用循环 |
| **Config** | `src/config/index.ts` | 配置管理与加载 |
| **Provider Factory** | `src/services/api/provider-factory.ts` | AI 客户端创建 |
| **ResilientClient** | `src/services/api/ResilientClient.ts` | 重试+熔断包装 |
| **ToolRegistry** | `src/tools/registry.ts` | 工具注册与管理 |
| **Permissions** | `src/services/permissions.ts` | 权限控制 |
| **ErrorHandler** | `src/utils/errors.ts` | 错误处理与上报 |

---

## 2. 快速开始

### 2.1 安装依赖

```bash
cd my_agent
bun install
```

### 2.2 配置 API Key

**方式一：环境变量（推荐）**
```bash
export AI_PROVIDER=glm
export AI_API_KEY=your-api-key-here
```

**方式二：.env 文件**
```bash
cp .env.example .env
# 编辑 .env 文件填入你的 API Key
```

### 2.3 启动应用

```bash
bun run dev
# 或
bun run build && node dist/index.js
```

### 2.4 基本使用

```
🤖  My Agent CLI

/help     - 显示帮助
/exit     - 退出

You> 你好
AI> 你好！有什么可以帮助你的吗？

You> /help
[显示所有可用命令]

You> /tools
[列出所有已注册工具]
```

---

## 3. 配置系统

### 3.1 配置加载优先级

```
环境变量 > 用户配置 (~/.my-agent/config.json) > 项目配置 (config.json) > 默认值
```

### 3.2 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `AI_PROVIDER` | AI 提供商 | `glm` |
| `AI_API_KEY` | API 密钥 | **必需** |
| `AI_MODEL` | 模型名称 | 提供商默认 |
| `AI_BASE_URL` | API 地址（代理） | 提供商默认 |
| `MAX_CONCURRENT_TOOLS` | 最大并发工具数 | `5` |
| `MAX_TOOL_CALL_ROUNDS` | 最大工具调用轮数 | `20` |
| `SESSION_DIR` | 会话存储目录 | `.sessions` |
| `DEBUG` | 调试模式 | `false` |
| `NODE_ENV` | 环境 | `development` |

### 3.3 配置文件

**项目配置 (config.json)**
```json
{
  "provider": "glm",
  "model": "glm-4",
  "maxConcurrentTools": 5,
  "sessionDir": ".sessions"
}
```

**用户配置 (~/.my-agent/config.json)**
```json
{
  "provider": "anthropic",
  "errorReporting": {
    "enabled": true,
    "appName": "my-agent",
    "env": "production"
  }
}
```

### 3.4 配置类接口

```typescript
// src/config/index.ts

const cfg = new Config();
cfg.load();  // 加载所有配置

// 获取单个配置
const provider = cfg.get('provider');
const apiKey = cfg.get('apiKey');

// 验证配置
const result = cfg.validate();
if (!result.valid) {
  console.error(result.errors);
}

// 查看配置来源
const source = cfg.getSource('provider');
// { source: 'env', value: 'glm' }
```

### 3.5 API Key 安全

- **API Key 不会写入配置文件**
- 只能通过环境变量设置
- `exportToFile()` 会自动排除 `apiKey` 字段

---

## 4. CLI 命令详解

### 4.1 命令列表

| 命令 | 别名 | 说明 |
|------|------|------|
| `/help` | `/h`, `/?` | 显示帮助 |
| `/clear` | `/cls` | 清除对话历史 |
| `/model` | `/m` | 查看/切换模型 |
| `/tokens` | `/t` | Token 使用统计 |
| `/tools` | `/tool` | 列出工具 |
| `/history` | `/hist` | 对话历史 |
| `/permissions` | `/perm` | 权限设置 |
| `/save` | - | 保存当前会话 |
| `/sessions` | - | 列出所有会话 |
| `/load <id>` | - | 加载指定会话 |

### 4.2 命令执行流程

```
用户输入 "/help"
       │
       ▼
┌──────────────────────────────────┐
│  CommandRegistry.parse(input)    │ ← 解析命令和参数
│  → { command: 'help', args: [] } │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│  commandRegistry.execute()       │ ← 执行命令
│  → 调用对应 command.execute()   │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│  输出结果到终端                  │
└──────────────────────────────────┘
```

### 4.3 自定义命令

```typescript
// src/core/commands.ts

commandRegistry.register({
  name: 'mycommand',
  aliases: ['mc'],
  description: '我的自定义命令',
  usage: '/mycommand <arg>',
  execute: async (args, context) => {
    console.log('执行自定义命令，参数:', args);
    // context.client - AI 提供商
    // context.store  - 状态存储
  },
});
```

---

## 5. 错误处理与重试机制

### 5.1 错误类层次

```
AppError (基类)
├── ValidationError      - 参数验证失败
├── AuthenticationError  - 认证失败
├── AuthorizationError    - 权限不足
├── NotFoundError         - 资源未找到
├── RateLimitError        - 速率限制
├── APIError              - API 调用失败
├── NetworkError           - 网络错误
├── ToolExecutionError     - 工具执行失败
└── ConfigurationError    - 配置错误
```

### 5.2 重试机制 (withRetry)

**原理：指数退避 + 抖动**

```
重试延迟 = min(initialDelay × backoffMultiplier^attempt, maxDelay) + random_jitter
```

**示例：**
```typescript
// src/utils/retry.ts

const result = await withRetry(
  () => riskyOperation(),
  {
    maxRetries: 3,        // 最多重试 3 次
    initialDelay: 1000,   // 初始延迟 1 秒
    maxDelay: 30000,       // 最大延迟 30 秒
    backoffMultiplier: 2, // 指数退避倍数
    jitter: true,          // 启用随机抖动
  }
);
```

**时间线：**
```
Attempt 0: 立即执行
     │
     ▼ 失败
Attempt 1: 等待 1s + jitter
     │
     ▼ 失败
Attempt 2: 等待 2s + jitter
     │
     ▼ 失败
Attempt 3: 等待 4s + jitter
     │
     ▼ 失败
抛出错误
```

### 5.3 安全执行包装 (safeAsync)

```typescript
const result = await safeAsync(
  () => fetchUserData(userId),
  'Failed to fetch user'
);

if (!result.success) {
  console.log(result.error.code); // 'NOT_FOUND'
  console.log(result.error.message);
  return;
}

console.log(result.data);
```

---

## 6. 熔断器模式

### 6.1 什么是熔断器？

熔断器是一种**防止级联故障**的保护机制。类比电路中的保险丝 —— 当电流过大时自动断开，保护整个系统。

### 6.2 状态转换

```
        ┌─────────────────────────────────────────┐
        │                                         │
        ▼                                         │
   ┌─────────┐     失败 >= threshold      ┌─────────┐
   │ Closed  │ ───────────────────────▶  │  Open   │
   │  关闭   │                          │  打开   │
   └─────────┘                          └─────────┘
        ▲                                    │
        │                                    │ resetTimeout 后
        │         成功 >= halfOpenRequests   │
        └────────────────────────────────────┤
                                             │
                                        ┌─────────┐
                                        │ Half    │
                                        │ -Open   │
                                        │  半开   │
                                        └─────────┘
```

| 状态 | 行为 | 说明 |
|------|------|------|
| **Closed** | 正常请求 | 失败计数，达标则打开 |
| **Open** | 快速失败 | 不执行请求，直接拒绝 |
| **Half-Open** | 允许试探 | 试探请求是否恢复 |

### 6.3 配置选项

```typescript
{
  failureThreshold: 5,     // 5 次失败后打开熔断器
  halfOpenRequests: 3,    // 半开状态允许 3 个试探请求
  resetTimeout: 30000,    // 30 秒后尝试重置
  windowSize: 60000,       // 统计时间窗口 60 秒
}
```

### 6.4 使用示例

```typescript
// src/utils/retry.ts

const breaker = circuitBreakerRegistry.get('external-api', {
  failureThreshold: 5,
  resetTimeout: 30000,
});

try {
  const result = await breaker.execute(() => externalService.call());
} catch (error) {
  if (error instanceof CircuitBreakerError) {
    console.log('服务暂时不可用，请稍后重试');
  }
}
```

### 6.5 熔断器注册表

```typescript
// 获取统计信息
const stats = circuitBreakerRegistry.getAllStats();
// {
//   'anthropic': { state: 'closed', failures: 2, successes: 10 },
//   'glm': { state: 'closed', failures: 0, successes: 5 }
// }

// 重置所有熔断器
circuitBreakerRegistry.resetAll();
```

---

## 7. API 提供商

### 7.1 支持的提供商

| 提供商 | 类型 | 默认模型 | API 地址 |
|--------|------|----------|----------|
| `anthropic` | 官方 | claude-sonnet-4-20250514 | api.anthropic.com |
| `openai` | 官方 | gpt-4o | api.openai.com |
| `glm` | OpenAI兼容 | glm-5.1 | open.bigmodel.cn |
| `kimi` | OpenAI兼容 | kimi-k2.5 | api.moonshot.cn |
| `minimax` | OpenAI兼容 | minimax-m2.7 | api.minimax.chat |
| `siliconflow` | OpenAI兼容 | deepseek-v3 | api.siliconflow.cn |
| `deepseek` | OpenAI兼容 | deepseek-v3 | api.deepseek.com |
| `qwen` | OpenAI兼容 | qwen-max | dashscope.aliyuncs.com |
| `gemini` | 官方 | gemini-3.1-pro | generativelanguage.googleapis.com |
| `moonshot` | OpenAI兼容 | kimi-k2.5 | api.moonshot.cn |

### 7.2 客户端创建流程

```typescript
// src/services/api/provider-factory.ts

const client = createProvider({
  provider: 'glm',
  apiKey: 'your-key',
  model: 'glm-4',        // 可选
  baseUrl: undefined,    // 可选，用于代理
});

// 返回的是 ResilientClient 包装后的客户端
// 自动具备重试和熔断器功能
```

### 7.3 ResilientClient 包装器

```typescript
// 所有通过 createProvider() 创建的客户端都会被自动包装

return new ResilientClient(client, provider);
//              │              │
//              │              └─ 用于熔断器名称
//              └─ 基础客户端 (AnthropicClient / OpenAICompatClient / GeminiClient)
```

**自动获得的功能：**
- 3 次自动重试（指数退避 + 抖动）
- 熔断器保护（每个提供商独立熔断器）
- 统一的错误处理

---

## 8. 工具注册表

### 8.1 内置工具

| 工具 | 说明 |
|------|------|
| `BashTool` | 执行本地命令行 |
| `FileReadTool` | 读取文件 |
| `FileWriteTool` | 写入文件 |
| `FileListTool` | 列出目录 |
| `GlobTool` | 模式匹配文件 |
| `EditTool` | 编辑文件 |
| `WebSearchTool` | 网络搜索 |
| `GitHubRepoTool` | GitHub 仓库操作 |
| `GitHubIssueTool` | GitHub Issues |
| `GitHubCodeSearchTool` | GitHub 代码搜索 |
| `GitHubPullRequestTool` | GitHub PRs |
| `GitHubCommitTool` | GitHub 提交 |
| `GitHubBranchTool` | GitHub 分支 |
| `GitHubUserTool` | GitHub 用户 |

### 8.2 工具接口

```typescript
interface Tool {
  name: string;                    // 工具名称
  description: string;             // 给 LLM 的描述
  inputSchema: ToolInputSchema;    // JSON Schema 参数定义
  execute: (input: Record<string, unknown>) => Promise<string>;
}
```

### 8.3 注册新工具

```typescript
// src/tools/registry.ts

toolRegistry.register({
  name: 'MyCustomTool',
  description: '执行自定义操作',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '参数1' },
    },
    required: ['param1'],
  },
  execute: async (input) => {
    // 执行逻辑
    return JSON.stringify({ success: true });
  },
});
```

---

## 9. 会话管理

### 9.1 会话存储

- 默认存储目录：`.sessions/`
- 每个会话保存为 JSON 文件
- 包含完整消息历史

### 9.2 会话命令

```bash
/save          # 保存当前会话
/sessions      # 列出所有会话
/load <id>     # 加载指定会话
```

### 9.3 SessionManager

```typescript
// src/services/session.ts

const manager = new SessionManager('.sessions');

// 保存会话
await manager.save({
  id: 'session-123',
  name: '我的会话',
  messages: [...],
  metadata: { createdAt: new Date().toISOString() },
});

// 列出所有会话
const sessions = await manager.list();

// 加载会话
const session = await manager.load('session-123');
```

---

## 10. 性能优化

### 10.1 性能优化工具

```typescript
// src/utils/performance.ts

import {
  LRUCache,           // LRU 缓存
  ConcurrencyController, // 并发控制器
  RequestDeduplicator,   // 请求去重
  TimedCache,          // TTL 缓存
  RateLimiter,         // 速率限制器
} from '../utils/performance.js';
```

### 10.2 LRU 缓存

**Least Recently Used (最近最少使用) 缓存**

```typescript
const cache = new LRUCache<string, string>(100); // 最多 100 条

cache.set('key1', 'value1');
cache.get('key1'); // 返回 'value1'

// 超过容量时，自动淘汰最老的条目
```

### 10.3 并发控制器

**限制同时执行的异步任务数量**

```typescript
const controller = new ConcurrencyController({
  maxConcurrent: 5,  // 最多 5 个并发
  maxQueueSize: 10,  // 队列最多 10 个
});

// 使用
const result = await controller.run(async () => {
  return await someAsyncOperation();
});

// 获取状态
const stats = controller.getStats();
// { running: 3, waiting: 2, successCount: 10, failedCount: 1 }

// 等待所有任务完成
await controller.waitForIdle();
```

### 10.4 请求去重器

**防止相同请求重复发送**

```typescript
const deduplicator = new RequestDeduplicator(60000); // 60 秒 TTL

const result = await deduplicator.execute('unique-key', () =>
  fetchData()
);

// 相同 key 的请求会复用同一个 Promise
```

### 10.5 速率限制器

**基于令牌桶算法的速率控制**

```typescript
const limiter = new RateLimiter({
  maxTokens: 60,           // 最多 60 个令牌
  refillPerSecond: 10,     // 每秒补充 10 个
});

// 获取令牌后才能执行
await limiter.acquire(1);  // 消耗 1 个令牌

// 查看可用令牌
limiter.getAvailableTokens();
```

### 10.6 全局性能工具

```typescript
import {
  globalCache,        // 全局缓存 (500 条, 5 分钟 TTL)
  toolConcurrency,    // 工具并发控制器 (5 并发)
  requestDeduplicator, // 全局请求去重
  apiRateLimiter,     // API 速率限制
} from '../utils/performance.js';
```

### 10.7 ResilientClient 集成

所有通过 `createProvider()` 创建的客户端都已集成：

```typescript
// 自动获得：
// 1. 速率限制 - 每秒最多 10 个请求
// 2. 重试机制 - 3 次指数退避重试
// 3. 熔断器保护 - 5 次失败后打开
```

---

## 附录：错误代码

| 代码 | 说明 |
|------|------|
| `VALIDATION_ERROR` | 输入验证失败 |
| `AUTH_ERROR` | 认证失败 |
| `AUTHORIZATION_ERROR` | 权限不足 |
| `NOT_FOUND` | 资源未找到 |
| `RATE_LIMIT` | 速率限制 |
| `API_ERROR` | API 调用失败 |
| `NETWORK_ERROR` | 网络错误 |
| `TOOL_EXECUTION_ERROR` | 工具执行失败 |
| `CONFIGURATION_ERROR` | 配置错误 |
| `CIRCUIT_BREAKER` | 熔断器打开 |
| `INTERNAL_ERROR` | 内部错误 |
