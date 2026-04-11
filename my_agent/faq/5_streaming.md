# Step 5: 流式输出 (Streaming)

## 目标

实现 AI 响应的实时流式输出，让用户能够即时看到 AI 的思考过程，而不需要等待完整响应。

## 实现前后对比

```
┌─────────────────────────────────────────────────────────────────┐
│  实现前：无流式输出                                              │
├─────────────────────────────────────────────────────────────────┤
│  > 帮我列出当前目录文件                                          │
│  ─────────────────────────────────────────────────────────────  │
│  (等待 2-3 秒...)                                                │
│  (再等待...)                                                     │
│  好的，我来执行 ls 命令。当前目录包含以下文件：                   │
│  - src/                                                         │
│  - package.json                                                 │
│  - README.md                                                    │
│  ✓ 102 tokens, 3.2s (32 tok/s)                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  实现后：有流式输出                                              │
├─────────────────────────────────────────────────────────────────┤
│  > 帮我列出当前目录文件                                          │
│  ─────────────────────────────────────────────────────────────  │
│  好的，我来执                            │
│  ...行 ls 命令。当前目录包含以下文件：                            │
│  - src/                                                         │
│  - package.json                                                 │
│  - README.md                                                    │
│  ✓ 102 tokens, 2.1s (49 tok/s)                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心概念

### 什么是流式输出？

流式输出（Streaming）是一种服务器推送技术，服务器分批次返回响应数据，而不是等待完整响应后再一次性返回。

```
传统方式（非流式）:
┌──────────────────────────────────────────────────────────┐
│  客户端 ──────────────────────────▶ 服务器                 │
│              等待完整响应...                               │
│  ◀────────────────────────────────        │
│              [完整响应内容]                              │
└──────────────────────────────────────────────────────────┘

流式方式:
┌──────────────────────────────────────────────────────────┐
│  客户端 ──────────────────────────▶ 服务器               │
│  ◀────────                                │
│  [片段1: "好的"]                            │
│  ◀────────                                │
│  [片段2: "我来"]                            │
│  ◀────────                                │
│  [片段3: "执行"]                            │
│  ◀────────                                │
│  [片段4: "ls..."]                          │
│  ◀────────                                │
│  [完成]                                    │
└──────────────────────────────────────────────────────────┘
```

### 为什么重要？

1. **用户体验**: 用户可以立即看到 AI 的响应，减少等待焦虑
2. **感知速度**: 即使完整响应时间相同，流式输出让人觉得更快
3. **实时反馈**: AI 思考过程可见，用户可以判断是否需要中断

## 实现方案

### 1. 回调接口设计 (StreamCallbacks)

```typescript
// src/services/api/types.ts

/**
 * 流式输出回调接口
 * 用于处理 AI 响应的增量片段
 */
export interface StreamCallbacks {
  /** 每个文本片段到达时触发 */
  onChunk?: (text: string) => void;

  /** 响应完成时触发 */
  onComplete?: (fullText: string) => void;

  /** 错误时触发 */
  onError?: (error: Error) => void;
}
```

**设计思路**:
- `onChunk`: 实时输出每个文本片段，用于终端逐字显示
- `onComplete`: 所有片段接收完毕后触发，用于显示统计信息
- `onError`: 任何阶段出错都可以捕获处理

### 2. Anthropic 流式实现

Anthropic SDK 支持 `messages.stream()` 方法：

```typescript
// src/services/api/AnthropicClient.ts

private async sendMessageStream(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  tools: Anthropic.Tool[] | undefined,
  callbacks: StreamCallbacks
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];

  // 流式 API 调用
  const stream = await this.client.messages.stream({
    model: this.model,
    max_tokens: this.maxTokens,
    messages,
    tools,
  });

  try {
    // 遍历流式事件
    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          // 文本片段
          const text = event.delta.text;
          textParts.push(text);
          callbacks.onChunk?.(text);  // 实时输出
        } else if (event.delta.type === 'input_json_delta') {
          // 工具参数片段（JSON 增量）
          currentArgBuffer += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_start') {
        // 工具调用开始
        if (event.content_block.type === 'tool_use') {
          currentToolCall = {
            id: event.content_block.id,
            name: event.content_block.name,
            input: {},
          };
        }
      } else if (event.type === 'content_block_stop') {
        // 工具调用结束
        if (currentToolCall) {
          toolCalls.push(currentToolCall);
        }
      }
    }
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }

  callbacks.onComplete?.(textParts.join(''));
  return { text: textParts.join(''), toolCalls };
}
```

**关键点**:
- `client.messages.stream()` 返回一个异步迭代器
- 每个 `event` 是 SSE（Server-Sent Events）格式
- `text_delta` 包含文本片段
- `input_json_delta` 包含工具参数的 JSON 片段（用于工具调用）

### 3. OpenAI 兼容客户端流式实现

OpenAI 兼容 API 使用 SSE（Server-Sent Events）格式：

```typescript
// src/services/api/OpenAICompatClient.ts

private async parseSSEStream(
  response: Response,
  callbacks?: StreamCallbacks
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  const toolCallsMap = new Map<string, ToolCallDelta>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;  // 保留未完成行

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();

      if (data === '[DONE]') continue;

      const chunk = JSON.parse(data);
      const delta = chunk.choices[0]?.delta;

      // 处理文本片段
      if (delta?.content) {
        fullText += delta.content;
        callbacks?.onChunk?.(delta.content);
      }

      // 处理工具调用片段
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id && tc.function?.name) {
            toolCallsMap.set(tc.id, { id: tc.id, name: tc.function.name, arguments: tc.function.arguments || '' });
          } else if (tc.function?.arguments) {
            // 追加参数片段
          }
        }
      }
    }
  }

  callbacks?.onComplete?.(fullText);
  return { text: fullText, toolCalls: [...toolCallsMap.values()] };
}
```

### 4. REPL 中的流式集成

```typescript
// src/core/Repl.ts

/**
 * 创建流式输出回调
 * 在 handleInput 中调用，为每次 API 请求创建新的回调实例
 */
private createStreamCallbacks(): StreamCallbacks {
  let tokenCount = 0;
  const startTime = Date.now();

  return {
    // 每个文本片段到达时触发 - 实时输出到终端
    onChunk: (text: string) => {
      tokenCount++;
      process.stdout.write(text);  // 直接写入 stdout，不换行
    },

    // 响应完成时触发 - 显示统计信息
    onComplete: (_fullText: string) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const speed = elapsed && parseFloat(elapsed) > 0
        ? Math.round(tokenCount / parseFloat(elapsed))
        : 0;
      process.stdout.write(
        `\n\x1b[32m✓\x1b[0m \x1b[90m${tokenCount} tokens, ${elapsed}s (${speed} tok/s)\x1b[0m\n\n`
      );
    },

    // 错误时触发
    onError: (error: Error) => {
      process.stdout.write('\n');
      console.error(terminal.renderError(error.message));
    },
  };
}

/**
 * 处理用户输入
 * 使用流式回调实时显示 AI 响应
 */
private async handleInput(input: string): Promise<void> {
  console.log(terminal.renderDivider());
  console.log(terminal.renderUserMessage(input));

  this.messageCount++;
  if (this.messageCount % 10 === 0) {
    await this.autoSave();
  }

  try {
    this.store.addMessage({ role: 'user', content: input });

    // 创建流式回调
    const callbacks = this.createStreamCallbacks();
    const messagesToSend = this.getMessagesForSending();

    // 发送请求（自动使用流式）
    const { text, toolCalls } = await this.client.sendMessage(
      messagesToSend,
      this.store.getTools(),
      callbacks  // 传入回调，客户端自动使用流式
    );

    // 处理工具调用...
  } catch (error) {
    console.error(terminal.renderError(formatError(error)));
  }
}
```

## 各客户端流式支持状态

| 客户端 | 流式状态 | 实现方式 |
|--------|----------|----------|
| AnthropicClient | ✅ 完整 | `client.messages.stream()` |
| OpenAICompatClient | ✅ 完整 | SSE 解析 |
| GLMClient | ✅ 完整 | SSE 解析 + Web Search |
| GeminiClient | ⚠️ 部分 | 非真正流式，`onChunk` 在最后调用 |

## 关键技术点

### 1. 流式与工具调用共存

流式输出时，工具调用的参数是**增量**传输的：

```
时间线:
[t1] text_delta: "好的，我来"
[t2] text_delta: "执行"
[t3] content_block_start: tool_use { name: "BashTool", id: "abc" }
[t4] input_json_delta: "{"            ← 参数开始
[t5] input_json_delta: "\"command\":"   ← 继续
[t6] input_json_delta: "\"ls\""        ← 参数完成
[t7] input_json_delta: "}"              ← JSON 结束
[t8] content_block_stop
[t9] text_delta: "命令"
```

**处理策略**: 在 `input_json_delta` 事件中累积 JSON 字符串，直到收到 `content_block_stop`。

### 2. 缓冲区处理

SSE 解析时，最后一行可能是不完整的：

```typescript
const lines = buffer.split('\n');
buffer = lines.pop()!;  // 保留未完成行，下次继续处理
```

### 3. 终端输出技巧

```typescript
process.stdout.write(text);  // 不换行追加
process.stdout.write('\n');  // 换行
console.log('text');         // 等于 write + write('\n')
```

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/services/api/AnthropicClient.ts` | 添加 `sendMessageStream` 方法，支持流式输出 |
| `src/services/api/types.ts` | `StreamCallbacks` 接口已存在，无需修改 |
| `src/core/Repl.ts` | `createStreamCallbacks` 方法已存在，无需修改 |

## 测试验证

```bash
cd my_agent
bun run src/index.ts

# 输入测试
> 你好，请介绍一下自己
# 预期：看到文字逐字/逐句出现，而不是等待完整响应

> 列出当前目录的 TypeScript 文件
# 预期：如果需要调用工具，工具调用信息在响应后显示
```

## 下一步

实现 **Step 6: 完整工具执行循环**，让 Agent 能够：
1. 自动检测需要调用的工具
2. 执行工具并获取结果
3. 将结果反馈给 AI
4. 循环直到任务完成

---

## 设计思路总结

### 为什么这样设计？

1. **回调模式 vs Promise 模式**
   - Promise 模式：等待完整响应
   - 回调模式：实时处理片段 ✓
   - 原因：`onChunk` 需要在每个片段到达时被调用

2. **为什么不使用 AsyncIterator 返回流？**
   - 可以，但会增加调用方复杂度
   - 回调模式更简单直接 ✓

3. **为什么工具参数用增量 JSON？**
   - 网络传输分包导致 JSON 可能被截断
   - 需要逐步拼接直到完整 ✓

### 重点关注

1. **流式与工具调用的协调**：参数是流式传输的
2. **错误处理**：流式过程中任何阶段都可能出错
3. **终端刷新**：`process.stdout.write` vs `console.log` 的区别
