# Step 3: API 层与工具调用

## 目标

实现支持工具调用的完整 Agent 循环：

```
用户输入 ──▶ API ──▶ 工具调用 ──▶ 执行结果 ──▶ API ──▶ 最终响应
```

## 当前项目结构

```
my_agent/
├── src/
│   ├── index.ts                    # 入口
│   ├── entrypoints/
│   │   └── cli.ts                 # CLI 主程序
│   ├── core/
│   │   └── Repl.ts                # REPL 循环
│   ├── services/
│   │   └── api/
│   │       └── AnthropicClient.ts # API 客户端
│   ├── state/
│   │   └── store.ts              # 状态管理
│   └── types/
│       └── index.ts              # 类型定义
├── docs/
│   └── ...
└── package.json
```

## 3.1 为什么需要工具调用？

**没有工具调用的局限**：
```
用户: "帮我列出当前目录文件"
AI:   "我无法直接访问你的文件系统..."

用户: "帮我执行 ls 命令"
AI:   "我无法执行命令..."
```

**有工具调用的能力**：
```
用户: "帮我列出当前目录文件"
AI:   (调用 BashTool 执行 ls)
     ┌─────────────────────────────┐
     │ <invoke name="BashTool">    │
     │   <parameter name="command">ls</parameter> │
     │ </invoke>                   │
     └─────────────────────────────┘

Agent: 执行 ls，返回文件列表

AI:   "当前目录有以下文件：
       - src/
       - package.json
       - README.md"
```

## 3.2 Anthropic API 的工具调用机制

### Claude 如何支持工具调用？

Claude 3 通过 **Tool Use** 扩展支持工具调用：

```typescript
// 1. 定义工具
const tools = [
  {
    name: "BashTool",
    description: "Execute a bash command",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The command to execute"
        }
      },
      required: ["command"]
    }
  }
];

// 2. 发送请求时传入工具
const response = await client.messages.create({
  model: "claude-3-5-sonnet-20241017",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Run ls command" }],
  tools  // <-- 关键！
});

// 3. 解析响应
for (const block of response.content) {
  if (block.type === "tool_use") {
    console.log("Tool called:", block.name);
    console.log("Input:", block.input);
  }
}
```

### 响应类型

```typescript
// API 返回的 content 是 ContentBlock[]
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string }
```

## 3.3 更新类型定义

```typescript
// src/types/index.ts

export type Role = 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string | ContentBlock[];
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

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

export interface AppState {
  messages: Message[];
  tools: Tool[];
}
```

## 3.4 更新 API 客户端

```typescript
// src/services/api/AnthropicClient.ts

import Anthropic from '@anthropic-ai/sdk';
import type { Message, Tool } from '../../types/index.js';

export interface ClientConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class AnthropicClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor({
    apiKey,
    model = 'claude-3-5-haiku-20241017',
    maxTokens = 1024,
  }: ClientConfig) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async sendMessage(
    messages: Message[],
    tools: Tool[] = []
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    // 转换消息格式
    const anthropicMessages = messages.map((msg) => ({
      role: msg.role,
      content: typeof msg.content === 'string'
        ? msg.content
        : this.contentBlocksToString(msg.content),
    }));

    // 转换工具格式
    const anthropicTools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));

    // 发送请求
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: anthropicMessages,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    });

    // 解析响应
    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      text: textParts.join(''),
      toolCalls,
    };
  }

  private contentBlocksToString(blocks: ContentBlock[]): string {
    return blocks
      .map((block) => {
        if (block.type === 'text') return block.text;
        if (block.type === 'tool_use') {
          return `[Tool call: ${block.name}]`;
        }
        if (block.type === 'tool_result') {
          return `[Tool result: ${block.content}]`;
        }
        return '';
      })
      .join('');
  }
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}
```

## 3.5 实现 BashTool

```typescript
// src/tools/BashTool.ts

import { spawn } from 'child_process';
import type { Tool } from '../types/index.js';

export const BashTool: Tool = {
  name: 'BashTool',
  description: 'Execute a bash command in the terminal',

  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute',
      },
    },
    required: ['command'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const command = input.command as string;

    return new Promise((resolve, reject) => {
      const child = spawn(command, [], {
        shell: true,
        cwd: process.cwd(),
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout || '(no output)');
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });

      // 超时处理
      setTimeout(() => {
        child.kill();
        reject(new Error('Command timed out'));
      }, 30000);
    });
  },
};
```

## 3.6 工具注册表

```typescript
// src/tools/registry.ts

import type { Tool } from '../types/index.js';
import { BashTool } from './BashTool.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    this.register(BashTool);
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

// 全局单例
export const toolRegistry = new ToolRegistry();
```

## 3.7 更新 REPL 支持工具调用

```typescript
// src/core/Repl.ts

import * as readline from 'readline';
import { AnthropicClient } from '../services/api/AnthropicClient.js';
import type { Store } from '../state/store.js';
import { toolRegistry } from '../tools/registry.js';

export class Repl {
  private client: AnthropicClient;
  private store: Store;
  private rl: readline.Interface;

  constructor({
    client,
    store,
  }: {
    client: AnthropicClient;
    store: Store;
  }) {
    this.client = client;
    this.store = store;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    });
  }

  async run(): Promise<void> {
    console.log('🤖 My Agent CLI (with Tools!)');
    console.log('Type your messages or "exit" to quit.\n');

    // 注册工具
    this.store.setTools(toolRegistry.getAll());

    this.rl.prompt();

    this.rl.on('line', async (input: string) => {
      const trimmed = input.trim();

      if (trimmed === 'exit' || trimmed === 'quit') {
        console.log('Goodbye!');
        this.rl.close();
        return;
      }

      if (trimmed) {
        await this.handleInput(trimmed);
      }

      this.rl.prompt();
    });

    this.rl.on('close', () => {
      process.exit(0);
    });
  }

  private async handleInput(input: string): Promise<void> {
    console.log(`\n[Processing: "${input}"]`);

    try {
      // 1. 添加用户消息
      this.store.addMessage({
        role: 'user',
        content: input,
      });

      // 2. 发送消息并获取响应
      const { text, toolCalls } = await this.client.sendMessage(
        this.store.getMessages(),
        this.store.getTools()
      );

      // 3. 处理工具调用
      if (toolCalls.length > 0) {
        console.log('\n🔧 Tool calls detected:');
        for (const toolCall of toolCalls) {
          await this.handleToolCall(toolCall);
        }
      }

      // 4. 打印 AI 响应
      if (text) {
        console.log(`\n${text}\n`);
      }

      // 5. 添加助手消息
      this.store.addMessage({
        role: 'assistant',
        content: text || `[Executed ${toolCalls.length} tool(s)]`,
      });
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async handleToolCall(toolCall: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  }): Promise<void> {
    console.log(`  📦 ${toolCall.name}:`, toolCall.input);

    const tool = toolRegistry.get(toolCall.name);
    if (!tool) {
      console.error(`  ❌ Tool not found: ${toolCall.name}`);
      this.store.addMessage({
        role: 'assistant',
        content: `[Error: Tool ${toolCall.name} not found]`,
      });
      return;
    }

    try {
      const result = await tool.execute(toolCall.input);
      console.log(`  ✅ Result: ${result.substring(0, 100)}...`);

      // 将工具结果添加为消息
      this.store.addMessage({
        role: 'user',
        content: JSON.stringify({
          type: 'tool_result',
          tool_call_id: toolCall.id,
          content: result,
        }),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Error: ${errorMessage}`);

      this.store.addMessage({
        role: 'user',
        content: JSON.stringify({
          type: 'tool_result',
          tool_call_id: toolCall.id,
          content: `Error: ${errorMessage}`,
          is_error: true,
        }),
      });
    }
  }
}
```

## 3.8 核心流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                        REPL Loop                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  用户输入 ──▶ addMessage() ──▶ sendMessage()                    │
│                                               │                  │
│                                               ▼                  │
│                                    ┌─────────────────┐          │
│                                    │   Claude API    │          │
│                                    └────────┬────────┘          │
│                                             │                    │
│                            ┌───────────────┴───────────────┐  │
│                            ▼                               ▼    │
│                    ┌──────────────┐              ┌───────────┐ │
│                    │  text 响应   │              │ tool_use  │ │
│                    └──────────────┘              └─────┬─────┘ │
│                                                       │        │
│                                                       ▼        │
│                                    ┌─────────────────────────┐  │
│                                    │  handleToolCall()      │  │
│                                    │  1. 获取工具           │  │
│                                    │  2. 执行工具           │  │
│                                    │  3. 添加结果到消息    │  │
│                                    └───────────┬─────────────┘  │
│                                                │                 │
│                                                ▼                 │
│                                    ┌─────────────────────────┐  │
│                                    │ sendMessage() (继续)   │  │
│                                    │ 把工具结果发回给 API   │  │
│                                    └───────────┬─────────────┘  │
│                                                │                 │
│                                                ▼                 │
│                                    ┌─────────────────┐          │
│                                    │  最终响应文本   │          │
│                                    └────────┬────────┘          │
│                                             │                    │
│                                             ▼                    │
│                                    ┌─────────────────┐          │
│                                    │ 打印并显示结果  │          │
│                                    └─────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## 3.9 验证步骤

```bash
cd my_agent
bun run typecheck
bun run dev
```

**预期交互**:
```
> ls
[Processing: "ls"]

🔧 Tool calls detected:
  📦 BashTool: { command: "ls" }
  ✅ Result: src/
package.json
README.md

Hello! I can see the files in your current directory:
- src/
- package.json
- README.md

> exit
Goodbye!
```

## 关键知识点

### 1. 工具调用的循环

工具调用是一个**循环**：

```
API ──▶ tool_use ──▶ 执行 ──▶ tool_result ──▶ API ──▶ text
         ▲                                          │
         └──────────────────────────────────────────┘
```

### 2. 工具注册模式

使用注册表模式的好处：

```typescript
// ✅ 可扩展
toolRegistry.register(CustomTool);

// ✅ 可替换
toolRegistry.register(ImprovedBashTool);

// ✅ 可查询
if (toolRegistry.has('BashTool')) { ... }
```

### 3. 错误处理

工具执行可能失败，需要处理：

```typescript
try {
  const result = await tool.execute(input);
} catch (error) {
  // 返回错误信息给 API
  this.store.addMessage({
    content: JSON.stringify({
      type: 'tool_result',
      tool_call_id: toolCall.id,
      content: `Error: ${error.message}`,
      is_error: true,
    }),
  });
}
```

## 下一步

继续 [Step 4: 状态管理与消息历史](./04_step4_state_management.md)
