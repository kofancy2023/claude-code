# Step 2: CLI 入口和 REPL 循环

## 目标

实现一个可交互的命令行界面，支持用户输入、AI 响应、工具调用的完整循环。

## 核心概念

### 什么是 REPL？

**REPL = Read-Eval-Print Loop** (读取-执行-打印-循环)

```
┌─────────────────────────────────────────────────────────┐
│                      REPL Loop                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐           │
│   │  READ   │───▶│  EVAL   │───▶│  PRINT  │           │
│   └─────────┘    └─────────┘    └─────────┘           │
│        ▲                                     │           │
│        └─────────────────────────────────────┘           │
│                      (Loop)                              │
└─────────────────────────────────────────────────────────┘
```

### 为什么 REPL 对 Agent 重要？

1. **交互式**: 用户可以即时看到 AI 响应
2. **对话式**: 支持多轮对话，累积上下文
3. **工具调用**: Agent 可以调用工具并展示结果

## 架构设计

```
src/
├── index.ts              # 入口点
├── entrypoints/
│   └── cli.ts           # CLI 主程序
├── core/
│   ├── Repl.ts          # REPL 循环
│   └── QueryEngine.ts   # 查询引擎
└── types/
    └── index.ts         # 类型定义
```

## 2.1 类型定义

### 核心类型

```typescript
// src/types/index.ts

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  execute: (input: Record<string, unknown>) => Promise<string>;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, ToolProperty>;
  required?: string[];
}

export interface ToolProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
}
```

### 设计思路

| 类型 | 设计原因 |
|------|----------|
| `Message` | 对话历史，需要累积 |
| `ContentBlock` | 支持多模态内容（文本、工具调用） |
| `Tool` | 统一工具接口 |
| `ToolCall`/`ToolResult` | 追踪工具调用过程 |

## 2.2 CLI 入口

```typescript
// src/entrypoints/cli.ts

import { Repl } from '../core/Repl.js';
import { createStore } from '../state/store.js';
import { AnthropicClient } from '../services/api/AnthropicClient.js';

export async function runCLI() {
  console.log('🤖 My Agent CLI');
  console.log('Type your messages or "exit" to quit.\n');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable not set');
    process.exit(1);
  }

  const client = new AnthropicClient({ apiKey });
  const store = createStore();
  const repl = new Repl({ client, store });

  await repl.run();
}

runCLI().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

### 设计要点

1. **环境变量检查**: 确保 API key 存在
2. **依赖注入**: 客户端和存储通过构造函数注入
3. **错误处理**: 顶层 catch 防止崩溃

## 2.3 REPL 实现

### 基础 REPL 类

```typescript
// src/core/Repl.ts

import * as readline from 'readline';
import { Client } from '../services/api/AnthropicClient.js';
import { Store, AppState } from '../state/store.js';

const READLINE_QUESTIONS = {
  running: true,
};

export class Repl {
  private client: Client;
  private store: Store<AppState>;
  private rl: readline.Interface;

  constructor({ client, store }: { client: Client; store: Store<AppState> }) {
    this.client = client;
    this.store = store;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    });
  }

  async run(): Promise<void> {
    console.log('Welcome to My Agent! (type "exit" to quit)\n');

    this.rl.prompt();

    this.rl.on('line', async (input: string) => {
      const trimmed = input.trim();

      if (trimmed === 'exit' || trimmed === 'quit') {
        console.log('Goodbye!');
        READLINE_QUESTIONS.running = false;
        this.rl.close();
        return;
      }

      if (trimmed) {
        await this.handleInput(trimmed);
      }

      this.rl.prompt();
    });

    this.rl.on('close', () => {
      READLINE_QUESTIONS.running = false;
    });
  }

  private async handleInput(input: string): Promise<void> {
    console.log(`\n[Processing: "${input}"]\n`);

    try {
      // 1. 添加用户消息
      this.store.addMessage({
        role: 'user',
        content: input,
      });

      // 2. 调用 QueryEngine
      const response = await this.client.sendMessage(
        this.store.getMessages()
      );

      // 3. 打印响应
      console.log(`\n${response}\n`);

      // 4. 添加助手消息
      this.store.addMessage({
        role: 'assistant',
        content: response,
      });
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
    }
  }
}
```

### REPL 核心流程

```
User Input ──▶ handleInput() ──▶ addMessage() ──▶ sendMessage()
                                                     │
                                                     ▼
                                           ┌─────────────────┐
                                           │  API Response   │
                                           └────────┬────────┘
                                                    │
                                                    ▼
                                           ┌─────────────────┐
                                           │  Print Response │
                                           └────────┬────────┘
                                                    │
                                                    ▼
                                           ┌─────────────────┐
                                           │ addMessage()    │
                                           └────────┬────────┘
                                                    │
                                                    ▼
                                              rl.prompt()
```

## 2.4 最小状态管理

```typescript
// src/state/store.ts

import type { Message, Tool } from '../types/index.js';

export interface AppState {
  messages: Message[];
  tools: Tool[];
}

export function createStore(initialState: Partial<AppState> = {}) {
  let state: AppState = {
    messages: [],
    tools: [],
    ...initialState,
  };

  const listeners = new Set<() => void>();

  return {
    getState(): AppState {
      return state;
    },

    getMessages(): Message[] {
      return state.messages;
    },

    addMessage(message: Message): void {
      state = {
        ...state,
        messages: [...state.messages, message],
      };
      listeners.forEach((l) => l());
    },

    setTools(tools: Tool[]): void {
      state = {
        ...state,
        tools,
      };
      listeners.forEach((l) => l());
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
```

### 状态管理设计思路

| 方法 | 作用 |
|------|------|
| `getState()` | 获取完整状态 |
| `getMessages()` | 获取对话历史 |
| `addMessage()` | 添加新消息 |
| `setTools()` | 注册工具 |
| `subscribe()` | 订阅状态变化 |

### 为什么不使用 Redux/Zustand？

对于 MVP 来说：
1. **学习成本**: 需要理解额外概念
2. **复杂性**: 小项目不需要复杂状态管理
3. **控制权**: 手写更容易理解底层原理

> 后续如果项目变大，可以迁移到 Zustand

## 2.5 API 客户端（最小版本）

```typescript
// src/services/api/AnthropicClient.ts

import Anthropic from '@anthropic-ai/sdk';

export interface ClientConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class AnthropicClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor({ apiKey, model = 'claude-3-5-haiku-20241017', maxTokens = 1024 }: ClientConfig) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async sendMessage(messages: { role: string; content: string }[]): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages,
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => ('text' in block ? block.text : ''))
      .join('');

    return text;
  }
}
```

### API 客户端设计要点

| 设计 | 说明 |
|------|------|
| 配置对象 | `ClientConfig` 集中管理配置 |
| 默认参数 | `model` 和 `maxTokens` 有默认值 |
| 响应解析 | 只提取 `text` 类型内容 |

## 2.6 入口点更新

```typescript
// src/index.ts

import { runCLI } from './entrypoints/cli.js';

runCLI();
```

## 2.7 目录结构

```
my_agent/
├── src/
│   ├── index.ts                    # 入口
│   ├── entrypoints/
│   │   └── cli.ts                 # CLI 主程序
│   ├── core/
│   │   ├── Repl.ts                # REPL 循环
│   │   └── QueryEngine.ts        # 查询引擎 (预留)
│   ├── services/
│   │   └── api/
│   │       └── AnthropicClient.ts
│   ├── state/
│   │   └── store.ts
│   └── types/
│       └── index.ts
├── package.json
├── tsconfig.json
└── docs/
    └── ...
```

## 验证步骤

### 编译检查

```bash
cd my_agent
bun run typecheck
```

### 运行测试

```bash
bun run dev
```

**预期交互**:
```
Welcome to My Agent! (type "exit" to quit)

> Hello
[Processing: "Hello"]

Hello! How can I help you today?

> What can you do?
[Processing: "What can you do?"]

I can help you with:
- Answering questions
- Writing code
- Analyzing files
- And more!

> exit
Goodbye!
```

## 关键知识点

### 1. readline 模块

Node.js 内置的 `readline` 模块用于处理命令行输入：

```typescript
const rl = readline.createInterface({
  input: process.stdin,   // 键盘输入
  output: process.stdout, // 屏幕输出
  prompt: '> ',           // 提示符
});

rl.prompt();              // 显示提示符
rl.on('line', (input) => {});  // 监听输入
rl.close();               // 关闭界面
```

### 2. 依赖注入

通过构造函数注入依赖，而不是在类内部直接创建：

```typescript
// ✅ 好的设计 - 依赖注入
class Repl {
  constructor(private client: Client) {}
}

// ❌ 不好的设计 - 内部创建
class Repl {
  constructor() {
    this.client = new AnthropicClient(); // 硬编码
  }
}
```

**好处**:
- 易于测试 (可以注入 mock)
- 易于替换实现

### 3. 事件驱动

REPL 使用 Node.js 事件模式：

```typescript
rl.on('line', async (input) => { /* 处理输入 */ });
rl.on('close', () => { /* 清理 */ });
```

## 常见问题

### Q: 为什么使用 `readline` 而不是直接 `input()`？

A: Node.js 是事件驱动的，直接 `input()` 会阻塞事件循环。

### Q: 如何支持历史命令？

A: 可以使用 `readline` 的 `history` 选项或第三方库如 `inquirer`。

## 下一步

继续 [Step 3: 实现 API 层和工具调用](./03_step3_api_and_tools.md)
