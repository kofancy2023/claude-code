# Phase 3: 高级功能集成指南

## 概述

本文档介绍 Phase 3 实现的高级功能：会话持久化、上下文窗口管理、工具链系统。

---

## 1. 会话持久化 (Session Persistence)

### 1.1 功能说明

自动保存和恢复对话历史，支持中断后继续对话。

### 1.2 存储位置

```
项目根目录/
└── .sessions/
    ├── session-1712500000000.json
    ├── session-1712586400000.json
    └── ...
```

### 1.3 会话数据结构

```typescript
interface SessionData {
  id: string;                    // 唯一标识
  name: string;                  // 会话名称
  createdAt: string;             // 创建时间 (ISO)
  updatedAt: string;              // 更新时间 (ISO)
  messages: Message[];           // 消息历史
  metadata: {
    provider?: string;           // AI 提供商
    model?: string;              // 使用的模型
    messageCount: number;        // 消息数量
  };
}
```

### 1.4 使用命令

| 命令          | 功能             | 示例                             |
| ------------- | ---------------- | -------------------------------- |
| `sessions`  | 列出所有会话     | `> sessions`                   |
| `load <id>` | 加载指定会话     | `> load session-1712500000000` |
| `save`      | 手动保存当前会话 | `> save`                       |

### 1.5 自动触发机制

```
┌─────────────────────────────────────────────┐
│              会话保存触发条件                  │
├─────────────────────────────────────────────┤
│  1. 每 10 条消息自动保存                      │
│  2. 用户输入 "save" 手动保存                 │
│  3. 用户输入 "exit" 或 "quit" 退出时保存     │
└─────────────────────────────────────────────┘
```

### 1.6 实现原理

**核心类**: `SessionManager` (src/services/session.ts)

```typescript
export class SessionManager {
  async save(session: SessionData): Promise<string>  // 保存会话到 JSON 文件
  async load(sessionId: string): Promise<SessionData | null>  // 从文件加载会话
  async list(): Promise<SessionData[]>  // 列出所有会话（按更新时间倒序）
  async delete(sessionId: string): Promise<boolean>  // 删除会话
  async exportSession(sessionId: string): Promise<string | null>  // 导出为 JSON 字符串
  async importSession(jsonContent: string): Promise<SessionData>  // 从 JSON 导入
}
```

**文件操作流程**:

```
save() → JSON.stringify() → fs.writeFile() → .sessions/{id}.json
load() → fs.readFile() → JSON.parse() → SessionData
list() → fs.readdir() → 过滤 .json → 按时间排序
```

---

## 2. 上下文窗口管理 (Context Window Management)

### 2.1 功能说明

自动管理对话上下文，当消息过长超过模型限制时自动压缩。

### 2.2 Token 估算

```typescript
// 简单估算：约 4 字符 = 1 token
estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

### 2.3 触发条件

```typescript
needsTruncation(messages: Message[], model?: string): boolean {
  const contextWindow = getModelContextWindow(model);  // 从配置获取
  const maxTokens = contextWindow - 1000;             // 预留空间
  const currentTokens = calculateTotalTokens(messages);
  return currentTokens > maxTokens;
}
```

### 2.4 各模型上下文窗口

| 模型            | 上下文窗口 | Provider  |
| --------------- | ---------- | --------- |
| glm-5.1         | 256K       | GLM       |
| kimi-k2.5       | 256K       | Kimi      |
| minimax-m2.7    | 256K       | MiniMax   |
| gemini-3.1-pro  | 2M         | Gemini    |
| deepseek-v3     | 64K        | DeepSeek  |
| qwen-max        | 131K       | Qwen      |
| claude-sonnet-4 | 200K       | Anthropic |

### 2.5 压缩策略

```
原始消息结构:
┌──────────────────────────────────────────────────────────┐
│ [System Message]  ← 始终保留                              │
├──────────────────────────────────────────────────────────┤
│ [User Message 1]                                        │
│ [Assistant Message 1]                                    │
│ [User Message 2]                                        │
│ ...                                                      │
│ [User Message N-1]                                      │
│ [Assistant Message N-1]                                 │
│ [User Message N]      ← 保留最后 3 条                    │
│ [Assistant Message N] ← 保留最后 3 条                    │
│ [User Message N+1]    ← 保留最后 3 条                    │
└──────────────────────────────────────────────────────────┘

压缩后:
┌──────────────────────────────────────────────────────────┐
│ [System Message]  ← 始终保留                              │
├──────────────────────────────────────────────────────────┤
│ [Summarized History]  ← 中间消息合并为摘要                 │
├──────────────────────────────────────────────────────────┤
│ [User Message N-1]  ← 保留最后 3 条                       │
│ [Assistant Message N-1]                                  │
│ [User Message N]                                         │
│ [Assistant Message N]                                     │
│ [User Message N+1]                                       │
└──────────────────────────────────────────────────────────┘
```

### 2.6 实现原理

**核心类**: `ContextManager` (src/services/context-manager.ts)

```typescript
export class ContextManager {
  estimateTokens(text: string): number      // 估算 token 数量
  calculateTotalTokens(messages: Message[]): number  // 计算消息总 token
  needsTruncation(messages: Message[], model?: string): boolean  // 检查是否需要截断
  truncateMessages(messages: Message[], options: SummarizationOptions): Message[]  // 截断消息
  summarizeMessages(messages: Message[]): Message  // 生成摘要
}
```

**截断选项**:

```typescript
interface SummarizationOptions {
  maxTokens: number;              // 目标最大 token 数
  preserveSystemMessage?: boolean; // 是否保留系统消息（默认 true）
  preserveLastMessages?: number;  // 保留最后 N 条消息（默认 3）
  targetModel?: string;          // 目标模型（用于获取上下文窗口）
}
```

---

## 3. 工具链系统 (Tool Chain System)

### 3.1 功能说明

支持定义和执行复杂的工具链，包含条件执行、依赖管理、重试机制。

### 3.2 核心概念

```typescript
// 工具链节点
interface ToolChainNode {
  id: string;                          // 节点唯一标识
  tool: Tool;                          // 要执行的工具
  condition?: (input) => boolean;       // 执行条件（可选）
  dependsOn?: string[];                // 依赖节点 ID（可选）
  retry?: {
    maxAttempts: number;               // 最大重试次数
    backoffMs: number;                // 重试间隔（毫秒）
  };
}

// 工具链
interface ToolChain {
  id: string;              // 工具链唯一标识
  name: string;            // 工具链名称
  description: string;     // 工具链描述
  nodes: ToolChainNode[];  // 节点列表
  parallel?: boolean;       // 是否并行执行（默认 false）
}
```

### 3.3 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                          REPL 循环                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ SessionManager│  │ContextManager│  │   ToolChainExecutor      │ │
│  │  (会话持久化) │  │ (上下文管理) │  │    (工具链执行器)         │ │
│  └──────────────┘  └──────────────┘  │  ┌────────────────────┐  │ │
│                                       │  │ registerChain()    │  │ │
│                                       │  │ executeChain()     │  │ │
│                                       │  │ executeSequential()│  │ │
│                                       │  │ executeParallel()  │  │ │
│                                       │  └────────────────────┘  │ │
│                                       └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   工具注册表     │
                    │ toolRegistry    │
                    │ ┌─────────────┐ │
                    │ │ WebSearch   │ │
                    │ │ FileRead    │ │
                    │ │ Bash        │ │
                    │ │ GitHub PR   │ │
                    │ │ ...         │ │
                    │ └─────────────┘ │
                    └─────────────────┘
```

### 3.4 注册阶段

**方式 A：手动注册（外部代码）**

```typescript
const executor = repl.getToolChainExecutor();

executor.registerChain({
  id: 'research-and-write',
  name: '研究后写作',
  description: '搜索信息 → 读取文件 → 写入内容',
  nodes: [
    {
      id: 'search',
      tool: webSearchTool,
      condition: (ctx) => ctx.needsResearch === true,
    },
    {
      id: 'read',
      tool: fileReadTool,
      dependsOn: ['search'],
    },
    {
      id: 'write',
      tool: fileWriteTool,
      dependsOn: ['read'],
      retry: { maxAttempts: 3, backoffMs: 1000 },
    },
  ],
  parallel: false,
});
```

**方式 B：便捷方法自动创建**

```typescript
const chain = executor.createChainFromSequence(
  '快速任务',
  '连续执行多个工具',
  [toolA, toolB, toolC],  // B 依赖 A，C 依赖 B
  { retry: { maxAttempts: 3, backoffMs: 1000 } }
);
executor.registerChain(chain);
```

### 3.5 触发方式

工具链目前**不会自动触发**，需要手动调用或由 AI 决策：

| 触发方式 | 说明 |
|----------|------|
| `chains` 命令 | 查看已注册的工具链列表 |
| 外部代码调用 | `repl.getToolChainExecutor().executeChain('chain-id', input)` |

```
用户输入
   │
   ▼
REPL.handleInput()
   │
   ├─── "chains" 命令 ──→ listChains() 显示已注册的工具链
   │
   └─── 外部代码主动调用 ──→ repl.getToolChainExecutor().executeChain('chain-id', input)
```

### 3.6 顺序执行流程 (parallel: false)

```
executeChain('research-and-write', { query: '杭州天气' })
   │
   ▼
┌────────────────────────────────────────────────────────────┐
│  executeSequential()                                       │
│                                                            │
│  context = { query: '杭州天气' }                           │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Node 1: search                                      │   │
│  │ ├── checkDependencies() → true (无依赖)             │   │
│  │ ├── checkCondition() → true (无条件)                 │   │
│  │ ├── buildInput() → { query: '杭州天气' }             │   │
│  │ ├── executeWithRetry() → 调用 webSearchTool          │   │
│  │ │                           → "杭州: 25°C..."       │   │
│  │ └── results.set('search', { success: true, output }) │   │
│  │       context.search_output = "杭州: 25°C..."        │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Node 2: read (依赖 search)                           │   │
│  │ ├── checkDependencies() → search.success = true ✓    │   │
│  │ ├── checkCondition() → true                          │   │
│  │ ├── buildInput() → { query, search_result }          │   │
│  │ ├── executeWithRetry() → 调用 fileReadTool           │   │
│  │ └── results.set('read', { success: true, output })    │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Node 3: write (依赖 read)                            │   │
│  │ ├── checkDependencies() → read.success = true ✓      │   │
│  │ ├── buildInput() → { content, read_result }          │   │
│  │ ├── executeWithRetry() → 调用 fileWriteTool          │   │
│  │ └── results.set('write', { success: true })         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                            │
│  return { chainId, success: true, results, totalDuration } │
└────────────────────────────────────────────────────────────┘
```

### 3.7 并行执行流程 (parallel: true)

```
executeChain('multi-task', { urls: [...] }, { parallel: true })
   │
   ▼
┌────────────────────────────────────────────────────────────┐
│  executeParallel()                                        │
│                                                            │
│  readyNodes = nodes.filter(node → !node.condition ||      │
│                                  node.condition(initialInput))
│                                                            │
│  promises = readyNodes.map(node =>                        │
│    async () => {                                          │
│      input = buildInput(node, initialInput, results)      │
│      output = await executeWithRetry(node, input)        │
│      results.set(node.id, { success, output })            │
│    }                                                      │
│  )                                                        │
│                                                            │
│  await Promise.all(promises)  ← 同时执行所有节点           │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 3.8 依赖与条件组合

```
工具链配置：
┌──────────────────────────────────────────────────────────┐
│ nodes: [                                                  │
│   { id: 'A', tool, condition: (ctx) => ctx.needsA },    │
│   { id: 'B', tool, dependsOn: ['A'] },                   │
│   { id: 'C', tool, dependsOn: ['A'] },                   │
│ ]                                                         │
│ parallel: true                                            │
└──────────────────────────────────────────────────────────┘

执行逻辑：
1. 如果 needsA = false → A 跳过，B、C 等待 A（但 A 未执行）→ B、C 失败
2. 如果 needsA = true  → A 执行 → B、C 并行执行
```

### 3.9 重试机制

```typescript
{
  id: 'unstable-api',
  tool: someTool,
  retry: {
    maxAttempts: 3,      // 最多重试 3 次
    backoffMs: 1000,     // 每次重试间隔 1 秒（指数退避：1s, 2s, 3s）
  },
}
```

### 3.10 实现原理

**核心类**: `ToolChainExecutor` (src/services/tool-chain.ts)

```typescript
export class ToolChainExecutor {
  registerChain(chain: ToolChain): void           // 注册工具链
  getChain(chainId: string): ToolChain | undefined  // 获取工具链
  listChains(): ToolChain[]                      // 列出所有工具链
  executeChain(
    chainId: string,
    initialInput: Record<string, unknown>,
    executeTool: (tool: Tool, input) => Promise<string>
  ): Promise<ToolChainResult>                    // 执行工具链
}

interface ToolChainResult {
  chainId: string;
  success: boolean;
  results: Map<string, {
    success: boolean;
    output?: string;
    error?: string;
    duration: number;
  }>;
  totalDuration: number;
}
```

---

## 4. REPL 集成

### 4.1 初始化流程

```typescript
export class Repl {
  constructor({ client, store }) {
    this.sessionManager = new SessionManager(SESSION_DIR);
    this.contextManager = new ContextManager();
    this._toolChainExecutor = new ToolChainExecutor();
  }
}
```

### 4.2 命令路由

```
用户输入
    │
    ▼
┌─────────────────────────────────────────────┐
│           命令匹配                           │
├─────────────────────────────────────────────┤
│  "sessions" → listSessions()                │
│  "load <id>" → loadSession(id)              │
│  "save" → saveCurrentSession()              │
│  "chains" → listChains()                    │
│  "exit"/"quit" → cleanup() + 退出          │
│  其他内容 → handleInput()                    │
└─────────────────────────────────────────────┘
```

### 4.3 消息处理流程

```
handleInput()
    │
    ▼
store.addMessage()  ──→ messageCount++
    │
    ▼
每 10 条消息 ──→ autoSave()
    │
    ▼
getMessagesForSending()
    │
    ├─── 超过上下文限制？ ──→ truncateMessages()
    │
    ▼
client.sendMessage()
    │
    ├─── 返回 toolCalls ──→ handleToolCall() × N
    │
    └─── 返回 text ──→ store.addMessage()
```

---

## 5. 文件结构

```
my_agent/
├── src/
│   ├── core/
│   │   └── Repl.ts              ← 集成三大功能的入口
│   ├── services/
│   │   ├── session.ts           ← 会话持久化
│   │   ├── context-manager.ts   ← 上下文窗口管理
│   │   └── tool-chain.ts         ← 工具链系统
│   └── ...
└── faq/
    └── 4-advanced-features.md  ← 本文档
```

---

## 6. 最佳实践

### 6.1 会话持久化

- 定期检查 `.sessions/` 目录，清理不需要的会话
- 重要对话使用 `save` 命令手动保存
- 使用有意义的会话 ID 便于管理

### 6.2 上下文管理

- 根据模型选择合适的 `preserveLastMessages` 值
- 对于需要长记忆的对话，选择上下文窗口大的模型
- 定期新开对话避免累积过多历史

### 6.3 工具链

- 为常用任务预设工具链提高效率
- 合理设置依赖关系避免执行错误
- 使用条件执行让工具链更灵活
- 外部代码可通过 `repl.getToolChainExecutor()` 获取执行器

### 6.4 主动使用工具链示例

```typescript
// 在 index.ts 或 cli.ts 中
import { toolChainExecutor, webSearchTool, fileReadTool } from './services/tool-chain.js';
import { toolRegistry } from './tools/registry.js';

// 注册工具链
toolChainExecutor.registerChain({
  id: 'auto-research',
  name: '自动研究',
  nodes: [
    { id: 'search', tool: webSearchTool },
    { id: 'read', tool: fileReadTool, dependsOn: ['search'] },
  ]
});

// AI 决定触发工具链时调用
const result = await toolChainExecutor.executeChain(
  'auto-research',
  { query: '杭州天气' },
  async (tool, input) => {
    const t = toolRegistry.get(tool.name);
    return await t.execute(input);
  }
);
```

---

## 7. 扩展建议

1. **会话**: 支持会话导出/导入为 Markdown 格式
2. **上下文**: 支持自定义摘要提示词
3. **工具链**: 支持 GUI 可视化编辑工具链
