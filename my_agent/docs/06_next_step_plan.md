# 下一步实施计划

## 项目当前状态

### ✅ 已完成的功能模块

| 模块 | 状态 | 说明 |
|------|------|------|
| 项目基础结构 | ✅ 完成 | package.json, tsconfig, 入口文件 |
| REPL 循环 | ✅ 基本完成 | 用户输入 → AI 处理 → 输出 |
| API 层 | ✅ 完成 | Anthropic, OpenAI兼容, GLM, Gemini |
| 工具注册系统 | ✅ 完成 | 14 个工具已注册 |
| 权限系统 | ✅ 完成 | 白名单/黑名单, 命令前缀匹配 |
| 终端 UI | ✅ 完成 | ANSI 颜色, ASCII 边框 |
| 错误处理 | ✅ 完成 | 层次化错误类 |
| 状态管理 | ✅ 完成 | Zustand 风格 store |
| 会话管理 | ✅ 完成 | 持久化, 自动保存 |
| 上下文管理 | ✅ 完成 | 窗口自动截断 |
| 工具链执行器 | ✅ 完成 | 复杂任务编排 |

### ❌ 缺失或不完整的功能

| 功能 | 当前状态 | 优先级 |
|------|----------|--------|
| 流式输出 (Streaming) | 仅有接口定义 | 🔴 高 |
| 工具执行循环 | REPL 中未完整集成 | 🔴 高 |
| CLI 命令处理 | 未实现 | 🔴 高 |
| MCP 支持 | 未实现 | 🟡 中 |
| 配置系统 | 基础实现 | 🟡 中 |
| 更多工具 | 缺少 GrepTool 等 | 🟡 中 |

---

## 下一步计划

根据 MVP 原则和最小功能集，我们建议按以下顺序实现：

### Step 5: 流式输出 (Streaming)

**为什么重要？**
```
无流式输出：
┌─────────────────────────────────────────┐
│  正在思考...                            │
│  (等待完整响应后一次性显示)              │
└─────────────────────────────────────────┘

有流式输出：
┌─────────────────────────────────────────┐
│  正在思考... 好的，我来                  │
│            ... 执行 ls 命令             │
│  ✓ 完成                                 │
└─────────────────────────────────────────┘
```

**实现要点：**

1. **更新 AIProvider 接口**
   ```typescript
   // src/services/api/types.ts
   interface AIProvider {
     sendMessageStream(
       messages: Message[],
       tools?: Tool[],
       callbacks?: StreamCallbacks
     ): Promise<void>; // 流式不返回结果，通过 callbacks 输出
   }
   ```

2. **实现 AnthropicClient 流式**
   ```typescript
   // 使用 client.messages.stream() 而不是 client.messages.create()
   const stream = await this.client.messages.stream({...});
   for await (const event of stream) {
     if (event.type === 'content_block_delta') {
       callbacks.onChunk?.(event.delta.text);
     }
   }
   ```

3. **更新 REPL 集成流式输出**
   - 增量渲染 AI 响应
   - 实时显示工具调用状态

---

### Step 6: 完整工具执行循环

**为什么重要？**

Claude Code 的核心能力是**多轮工具调用循环**：

```
用户: "帮我列出 src 目录下的所有 TypeScript 文件"
  │
  ├─▶ API 调用
  │     ↓
  │   AI 返回: 需要调用 GlobTool
  │     ↓
  ├─▶ 执行 GlobTool({ pattern: "src/**/*.ts" })
  │     ↓
  │   返回: ["src/index.ts", "src/cli.ts", ...]
  │     ↓
  ├─▶ 将工具结果发回 API
  │     ↓
  │   AI 返回: 整理后的文件列表 (文本)
  │     ↓
  └─▶ 显示最终响应
```

**当前问题：**
- REPL 中的 `processUserInput` 方法可能未完整实现工具循环
- 需要验证工具调用的完整链路

**实现步骤：**

1. **创建 QueryEngine (查询引擎)**
   ```typescript
   // src/core/QueryEngine.ts
   export class QueryEngine {
     async query(
       messages: Message[],
       tools: Tool[]
     ): Promise<{ response: string; messages: Message[] }> {
       // 1. 发送请求到 API
       // 2. 如果有工具调用，执行工具
       // 3. 将工具结果添加到消息
       // 4. 再次调用 API
       // 5. 循环直到没有工具调用
       // 6. 返回最终响应
     }
   }
   ```

2. **完善 REPL 中的工具循环**
   ```typescript
   // 在 Repl.ts 中
   private async processUserInput(input: string): Promise<void> {
     // 1. 添加用户消息到历史
     this.store.addMessage({ role: 'user', content: input });

     // 2. 使用 QueryEngine 处理
     const { response, messages } = await this.queryEngine.query(
       this.store.getMessages(),
       this.store.getTools()
     );

     // 3. 更新消息历史
     this.store.setMessages(messages);

     // 4. 渲染响应
     console.log(terminal.renderAssistantMessage(response));
   }
   ```

3. **添加工具执行超时和错误处理**
   - 超时控制（防止工具卡死）
   - 错误恢复机制

---

### Step 7: CLI 命令处理

**为什么重要？**

Claude Code 支持丰富的 CLI 命令（如 `/help`, `/model`, `/exit` 等）：

```
/help     - 显示帮助信息
/model    - 切换 AI 模型
/exit     - 退出程序
/clear    - 清除对话历史
/compact  - 压缩对话历史
/battery  - 查看状态
```

**实现步骤：**

1. **定义命令接口**
   ```typescript
   // src/types/command.ts
   interface Command {
     name: string;
     description: string;
     execute: (args: string[]) => Promise<void>;
   }
   ```

2. **实现基础命令**
   ```typescript
   // src/commands/index.ts
   const commands: Command[] = [
     { name: '/help', description: 'Show help', execute: showHelp },
     { name: '/exit', description: 'Exit', execute: exitREPL },
     { name: '/clear', description: 'Clear history', execute: clearHistory },
     { name: '/model', description: 'Switch model', execute: switchModel },
   ];
   ```

3. **在 REPL 中集成命令处理**
   ```typescript
   // 在 Repl.ts 的 run() 方法中
   if (input.startsWith('/')) {
     await this.executeCommand(input);
   } else {
     await this.processUserInput(input);
   }
   ```

---

### Step 8: 配置系统

**为什么重要？**
- 用户需要配置 API key、默认模型等
- 支持持久化配置（.env, 配置文件）
- 模型参数可调（temperature, max_tokens 等）

**实现步骤：**

1. **创建配置加载器**
   ```typescript
   // src/services/config.ts
   interface Config {
     apiProvider: 'anthropic' | 'openai' | 'glm' | 'gemini';
     apiKey: string;
     model: string;
     maxTokens: number;
     temperature: number;
   }

   export function loadConfig(): Config {
     // 1. 从 .env 加载
     // 2. 从配置文件加载 (可选)
     // 3. 合并默认配置
   }
   ```

2. **添加配置命令**
   ```typescript
   /config                    - 显示当前配置
   /config set model claude-3-5-sonnet  - 设置模型
   ```

---

## 详细实施路线图

```
┌─────────────────────────────────────────────────────────────────┐
│                        MVP 实现路线图                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 5: 流式输出                                                │
│  ├─ 更新 AIProvider 接口支持流式                                 │
│  ├─ 实现 AnthropicClient 流式                                    │
│  └─ 集成到 REPL 实时显示                                         │
│                                                                  │
│  Step 6: 完整工具执行循环 (核心!)                                 │
│  ├─ 创建 QueryEngine                                             │
│  ├─ 实现多轮工具调用循环                                         │
│  ├─ 添加超时和错误处理                                           │
│  └─ 验证完整工具链                                               │
│                                                                  │
│  Step 7: CLI 命令处理                                            │
│  ├─ 定义命令接口                                                 │
│  ├─ 实现 /help, /exit, /clear, /model                           │
│  └─ 命令行参数解析                                               │
│                                                                  │
│  Step 8: 配置系统                                                │
│  ├─ 配置加载器                                                   │
│  ├─ .env 支持                                                   │
│  └─ /config 命令                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 下一步具体行动

### 立即执行 (Step 5 + Step 6)

**目标**: 让 Agent 能够真正响应用户问题并执行工具

**文件修改清单**:

1. **src/services/api/types.ts** - 添加流式接口
2. **src/services/api/AnthropicClient.ts** - 实现流式方法
3. **src/core/QueryEngine.ts** - 新建查询引擎
4. **src/core/Repl.ts** - 完善工具循环和流式输出
5. **src/tools/registry.ts** - 确保工具正确注册

**验证方法**:
```bash
bun run src/index.ts
# 输入: "列出当前目录的 TypeScript 文件"
# 预期: Agent 调用 GlobTool，返回文件列表
```

---

## 参考: Claude Code 核心功能对照

| 功能 | Claude Code | 我的实现 | 状态 |
|------|-------------|----------|------|
| REPL 循环 | ✅ | ✅ | 需完善 |
| API 调用 | ✅ | ✅ | ✅ |
| 工具系统 | ✅ 30+ | ✅ 14 | 需扩展 |
| 流式输出 | ✅ | ❌ | 需实现 |
| 工具循环 | ✅ | ❌ | 需实现 |
| CLI 命令 | ✅ 20+ | ❌ | 需实现 |
| 权限系统 | ✅ | ✅ | ✅ |
| 会话持久化 | ✅ | ✅ | ✅ |
| MCP 支持 | ✅ | ❌ | 未来 |
| 配置系统 | ✅ | 基础 | 需完善 |
| 成本跟踪 | ✅ | ❌ | 未来 |
| 主题支持 | ✅ | ❌ | 未来 |
| 任务系统 | ✅ | ❌ | 未来 |

---

## 建议学习顺序

1. **先理解现有代码**: 阅读 `src/core/Repl.ts` 了解当前实现
2. **理解工具循环**: 阅读 Claude Code 的 `src/query.ts` 和 `src/tools.ts`
3. **实现 Step 5-6**: 流式输出 + 完整工具循环
4. **测试验证**: 确保基本功能可用
5. **继续 Step 7-8**: CLI 命令 + 配置系统

准备好了，我们就从 **Step 5: 流式输出** 开始吧！
