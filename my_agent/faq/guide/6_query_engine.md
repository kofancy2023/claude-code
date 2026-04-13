# Step 6: 完整工具执行循环

## 目标

实现 Agent 的**多轮工具调用循环**，让 AI 能够：
1. 自动判断何时需要调用工具
2. 执行工具并获取结果
3. 将结果反馈给 AI 继续处理
4. 循环直到任务完成或达到限制

## 问题分析

### 旧实现的问题

```typescript
// ❌ 硬编码最多 3 轮工具调用
if (toolCalls.length > 0) {
  // 第一轮...
  const { toolCalls: secondToolCalls } = await ...;
  if (secondToolCalls.length > 0) {
    // 第二轮...
    const { text: finalFinalText } = await ...;
    // 第三轮...（无法继续扩展）
  }
}
```

**问题**:
1. **硬编码限制**: 最多只能处理 3 轮工具调用
2. **代码重复**: 每一轮都需要相同的处理逻辑
3. **无法扩展**: 如果需要更多轮，需要复制粘贴
4. **没有循环检测**: 可能进入无限循环

### 新实现的改进

```typescript
// ✅ 使用 QueryEngine 实现真正的循环
for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
  const { text, toolCalls } = await this.client.sendMessage(...);

  if (toolCalls.length === 0) {
    return { response: text, ... };  // 没有更多工具调用，结束
  }

  for (const toolCall of toolCalls) {
    const result = await this.executeToolCall(toolCall);
    messages.push({ role: 'user', content: result });  // 添加结果
  }
  // 循环继续...
}
```

## 架构设计

### 核心组件：QueryEngine

```typescript
// src/core/QueryEngine.ts

export interface QueryResult {
  response: string;           // 最终响应文本
  messages: Message[];         // 更新后的消息列表
  toolCallsExecuted: number;   // 执行的工具调用数量
}

export class QueryEngine {
  private client: AIProvider;

  async query(
    messages: Message[],      // 对话历史
    tools: Tool[],            // 可用工具列表
    callbacks: StreamCallbacks // 流式回调
  ): Promise<QueryResult>
}
```

### 工具循环流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                    QueryEngine.query()                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐                                                │
│  │   Start     │                                                │
│  └──────┬──────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────┐                    │
│  │  Round 1: Send to AI                    │                    │
│  │  messages = [user msg, ...prev msgs]    │                    │
│  └──────┬─────────────────────────────────┘                    │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────────────────────────────────┐                    │
│  │  AI Response: { text?, toolCalls? }     │                    │
│  └──────┬─────────────────────────────────┘                    │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────────────────────────────────┐                    │
│  │  toolCalls.length === 0?                 │───No──▶ Execute   │
│  └──────┬─────────────────────────────────┘        tools       │
│         │Yes                                          │           │
│         ▼                                              ▼           │
│  ┌─────────────┐                            ┌───────────────┐   │
│  │  Return     │                            │  Round 2:     │   │
│  │  response   │                            │  Send to AI   │   │
│  └─────────────┘                            └───────┬───────┘   │
│                                                      │           │
│                                                      ▼           │
│                              (循环直到无工具调用或达到限制)        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 关键实现细节

### 1. 循环限制机制

```typescript
const MAX_TOOL_CALL_ROUNDS = 20;    // 最多 20 轮
const MAX_TOOL_CALLS_TOTAL = 100;   // 最多 100 次工具调用
```

**为什么需要限制？**
- 防止无限循环（AI 可能一直调用工具）
- 防止资源耗尽
- 用户体验考虑

### 2. 空响应检测

```typescript
if (toolCalls.length === 0) {
  if (!text || text.trim() === '') {
    consecutiveEmptyResponses++;
    if (consecutiveEmptyResponses >= 2) {
      break;  // 连续 2 次空响应，停止
    }
  } else {
    return { response: text, ... };
  }
}
```

**处理三种情况**:
1. `有文本 + 无工具调用` → 返回文本
2. `无文本 + 无工具调用` → 继续等待（最多 2 次）
3. `有工具调用` → 执行工具，继续循环

### 3. 工具执行

```typescript
private async executeToolCall(
  toolCall: ToolCall,
  callbacks: StreamCallbacks
): Promise<string> {
  // 1. 查找工具
  const tool = toolRegistry.get(toolCall.name);
  if (!tool) {
    return JSON.stringify({
      type: 'tool_result',
      tool_call_id: toolCall.id,
      content: `Error: Tool not found: ${toolCall.name}`,
      is_error: true,
    });
  }

  // 2. 权限检查
  const permResult = permissions.checkPermission({
    toolName: toolCall.name,
    action: 'execute',
    params: toolCall.input,
  });

  if (!permResult.allowed) {
    return JSON.stringify({
      type: 'tool_result',
      tool_call_id: toolCall.id,
      content: `Error: Permission denied: ${permResult.reason}`,
      is_error: true,
    });
  }

  // 3. 执行工具
  try {
    const result = await tool.execute(toolCall.input);
    callbacks.onChunk?.(`\n${terminal.renderSuccess('[Tool executed] ')}`);
    return JSON.stringify({
      type: 'tool_result',
      tool_call_id: toolCall.id,
      content: result,
    });
  } catch (error) {
    return JSON.stringify({
      type: 'tool_result',
      tool_call_id: toolCall.id,
      content: `Error: ${error.message}`,
      is_error: true,
    });
  }
}
```

### 4. REPL 简化

```typescript
// src/core/Repl.ts - handleInput 方法

private async handleInput(input: string): Promise<void> {
  console.log(terminal.renderDivider());
  console.log(terminal.renderUserMessage(input));

  this.messageCount++;
  if (this.messageCount % 10 === 0) {
    await this.autoSave();
  }

  try {
    this.store.addMessage({
      role: 'user',
      content: input,
    });

    const callbacks = this.createStreamCallbacks();
    const messagesToSend = this.getMessagesForSending();

    // ✅ 使用 QueryEngine，一行搞定！
    const { response, toolCallsExecuted } = await this.queryEngine.query(
      messagesToSend,
      this.store.getTools(),
      callbacks
    );

    if (response) {
      this.store.addMessage({
        role: 'assistant',
        content: response,
      });
    }

    if (toolCallsExecuted > 0) {
      console.log(terminal.renderSuccess(`[Completed ${toolCallsExecuted} tool calls]`));
    }
  } catch (error) {
    await errorHandler.handle(error, { context: 'handleInput' });
    console.error(terminal.renderError(formatError(error)));
  }
}
```

## 对比：旧 vs 新

| 方面 | 旧实现 | 新实现 |
|------|--------|--------|
| 工具调用轮数 | 硬编码 3 轮 | 动态循环，最多 20 轮 |
| 代码行数 | ~150 行 | ~50 行 |
| 可扩展性 | 差 | 好 |
| 循环检测 | 无 | 有（连续空响应检测） |
| 总调用限制 | 无 | 100 次 |
| 流式输出 | 部分支持 | 完整支持 |

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/core/QueryEngine.ts` | **新建** - 查询引擎实现 |
| `src/core/Repl.ts` | 简化 `handleInput`，移除 `handleToolCall` |

## 测试场景

### 场景 1：简单文本对话

```
> 你好
──────────────────────────────────────────────────────────────
User: 你好
ℹ [Round 1] 好的，你好！有什么我可以帮助你的吗？
✓ [Tool executed] Completed 0 tool calls
```

### 场景 2：单次工具调用

```
> 列出当前目录的文件
──────────────────────────────────────────────────────────────
User: 列出当前目录的文件
ℹ [Round 1]
• BashTool
  { "command": "ls" }
✓ Result: src/ package.json/ README.md/
✓ [Tool executed]
ℹ [Round 2]
好的，当前目录包含以下文件和文件夹：
- src/
- package.json
- README.md
✓ [Tool executed] Completed 1 tool calls
```

### 场景 3：多次工具调用

```
> 帮我查看 src 目录下的所有 TypeScript 文件，并统计数量
──────────────────────────────────────────────────────────────
User: 帮我查看 src 目录下的所有 TypeScript 文件，并统计数量
ℹ [Round 1]
• GlobTool
  { "pattern": "src/**/*.ts" }
✓ [Tool executed]
ℹ [Round 2]
好的，找到了文件。现在我来统计数量。
✓ [Tool executed]
ℹ [Round 3]
src 目录下共有 15 个 TypeScript 文件。
✓ [Tool executed] Completed 2 tool calls
```

## 下一步

实现 **Step 7: CLI 命令处理**，添加常用命令：
- `/help` - 显示帮助
- `/exit` - 退出程序
- `/clear` - 清除对话历史
- `/model` - 切换 AI 模型

---

## 设计思路总结

### 为什么创建 QueryEngine？

1. **关注点分离**: REPL 负责交互，QueryEngine 负责查询逻辑
2. **可测试性**: 独立组件更容易单元测试
3. **可复用性**: QueryEngine 可以被其他组件使用

### 为什么不直接用 while 循环？

- 显式循环更清晰
- 每一轮都可以添加日志、统计
- 更容易添加断点调试

### 重点关注

1. **循环终止条件**: 无工具调用、达到限制、空响应连续次数
2. **错误恢复**: 工具执行失败不影响整体流程
3. **消息累积**: 每轮工具结果都添加到消息历史
