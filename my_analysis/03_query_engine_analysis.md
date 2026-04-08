# 03 核心循环和查询引擎分析

## 核心循环概述

Claude Code 的核心是一个**消息循环 + 工具调用循环**：

```
用户输入
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  QueryEngine.ts                                              │
│  - 管理对话状态                                               │
│  - 处理用户输入                                               │
│  - 维护消息历史                                               │
│  - 协调 compaction                                            │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  query.ts                                                    │
│  - 发送消息到 Claude API                                     │
│  - 处理流式响应                                               │
│  - 执行工具调用循环                                           │
│  - 管理 token 预算                                            │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  API 响应处理                                                 │
│  - 解析 AssistantMessage                                     │
│  - 提取 tool_use 块                                           │
│  - 执行工具                                                   │
│  - 循环直到 stop_reason                                       │
└─────────────────────────────────────────────────────────────┘
```

## QueryEngine.ts 详细分析

### 核心职责

**QueryEngine** 是对话状态的高层协调者：

1. **状态管理**: 维护消息历史、会话 ID、文件状态
2. **输入处理**: 处理用户输入，构建消息
3. **Compaction**: 压缩对话历史以节省 token
4. **归因**: 追踪工具使用和代码变更来源
5. **会话持久化**: 保存/恢复对话

### 关键类型定义

```typescript
// QueryEngine 配置 (第 100-130 行)
export type QueryEngineConfig = {
    cwd: string;
    tools: Tools;
    commands: Command[];
    mcpClients: MCPServerConnection[];
    agents: AgentDefinition[];
    canUseTool: CanUseToolFn;
    getAppState: () => AppState;
    setAppState: (f: (prev: AppState) => AppState) => void;
    initialMessages?: Message[];
    readFileCache: FileStateCache;
    customSystemPrompt?: string;
    appendSystemPrompt?: string;
    userSpecifiedModel?: string;
    fallbackModel?: string;
    thinkingConfig?: ThinkingConfig;
    // ...
};
```

### 关键方法

| 方法 | 职责 |
|------|------|
| `query()` | 执行单次查询 |
| `processUserInput()` | 处理用户输入 |
| `compact()` | 压缩对话历史 |
| `saveSession()` | 保存会话状态 |
| `resumeSession()` | 恢复会话 |

## query.ts 详细分析

### 核心查询函数

**query.ts** 是核心的 API 调用循环：

```typescript
// 核心签名 (第 100+ 行)
export async function query(
    params: QueryParams,
    deps: QueryDeps
): Promise<QueryResult>
```

### 参数结构

```typescript
interface QueryParams {
    messages: Message[];           // 对话历史
    systemPrompts: SystemPrompt[]; // 系统提示词
    tools: Tool[];                 // 可用工具
    toolsContext: ToolUseContext;  // 工具使用上下文
    model?: string;                // 模型选择
    maxTokens?: number;            // 最大输出 token
    // ...
}
```

### 工具调用循环流程

```
┌─────────────────────────────────────────────────────────────┐
│                     开始查询循环                              │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  1. 构建 API 请求                                            │
│     - 组装 messages + systemPrompt                           │
│     - 设置工具 schema                                         │
│     - 配置 model/maxTokens                                    │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  2. 调用 API (流式)                                          │
│     - messages.createStreaming()                             │
│     - 处理 delta 事件                                         │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  3. 处理响应事件                                              │
│     - content_block_start: 内容块开始                         │
│     - content_block_delta: 内容块增量                        │
│     - message_delta: 消息完成                                 │
│     - message_stop: 消息结束                                  │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  4. 检查 stop_reason                                         │
│     - end_turn: 用户需要回复                                  │
│     - tool_use: 需要执行工具                                  │
│     - stop_sequence: 停止序列触发                            │
└─────────────────────────┬───────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
    ┌─────────────────┐     ┌─────────────────┐
    │  stop_reason     │     │  tool_use       │
    │  = end_turn      │     │  提取工具调用    │
    │  返回结果给用户   │     │  执行工具循环    │
    └─────────────────┘     └────────┬────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │ 工具执行结果     │
                            │ 添加到 messages  │
                            │ 继续 API 调用    │
                            └─────────────────┘
```

### 工具调用处理 (第 200-400 行)

```typescript
// 工具调用循环的核心模式
for (const toolUse of toolUses) {
    // 1. 查找工具
    const tool = findToolByName(toolUse.name);
    if (!tool) {
        yield createErrorMessage(`Tool not found: ${toolUse.name}`);
        continue;
    }

    // 2. 检查权限
    if (!canUseTool(toolUse.name)) {
        yield createPermissionDenial(toolUse.name);
        continue;
    }

    // 3. 执行工具
    const result = await tool.call(toolUse.input);

    // 4. 生成工具结果消息
    yield createToolResultMessage(toolUse.id, result);
}
```

### Token 预算管理 (第 500-700 行)

```typescript
// Token 预算检查
const budgetTracker = createBudgetTracker(
    getCurrentTurnTokenBudget(),
    getTurnOutputTokens()
);

// 检查是否超过预算
const budgetState = checkTokenBudget(budgetTracker, responseUsage);
if (budgetState.exceeded) {
    // 触发 compaction 或返回错误
    yield* handleTokenBudgetExceeded(budgetState);
}
```

### 自动压缩 (第 700-900 行)

```typescript
// 自动压缩触发
const autoCompactState = isAutoCompactEnabled();
if (autoCompactState.triggered) {
    // 执行压缩
    const compactedMessages = await buildPostCompactMessages(
        messages,
        autoCompactState.boundary
    );

    // 继续使用压缩后的消息
    return query({ ...params, messages: compactedMessages }, deps);
}
```

### 错误处理和重试

```typescript
// 可重试错误分类
const retryable = categorizeRetryableAPIError(error);
if (retryable.canRetry) {
    // 指数退避重试
    for (let i = 0; i < MAX_RETRIES; i++) {
        await sleep(calculateBackoff(i));
        try {
            return await callAPI(params);
        } catch (e) {
            continue;
        }
    }
}
```

## 关键文件

| 文件 | 行数 | 核心职责 |
|------|------|----------|
| [QueryEngine.ts](file:///d:/mySource/cusor-proj/claude-code/src/QueryEngine.ts) | 1300+ | 状态管理和协调 |
| [query.ts](file:///d:/mySource/cusor-proj/claude-code/src/query.ts) | 1700+ | API 调用循环 |
| [query/config.ts](file:///d:/mySource/cusor-proj/claude-code/src/query/config.ts) | - | 查询配置 |
| [query/deps.ts](file:///d:/mySource/cusor-proj/claude-code/src/query/deps.ts) | - | 依赖注入 |
| [query/transitions.ts](file:///d:/mySource/cusor-proj/claude-code/src/query/transitions.ts) | - | 状态转换 |

## 改造优化建议

### 高优先级

1. **实现真正的 Feature Flags**
   ```
   // 当前 (cli.tsx)
   const feature = (_name: string) => false;

   // 建议实现
   const featureCache = new Map();
   const feature = (name: string) => {
       if (featureCache.has(name)) return featureCache.get(name);
       const value = readFeatureFromConfig(name);
       featureCache.set(name, value);
       return value;
   };
   ```

2. **添加详细日志**
   - 在 query.ts 添加请求/响应日志
   - 追踪工具执行时间
   - 监控 token 使用

### 中优先级

1. **工具执行并行化**
   ```typescript
   // 当前: 串行执行
   for (const toolUse of toolUses) {
       const result = await tool.call(toolUse.input);
   }

   // 建议: 并行执行 (对于独立工具)
   const results = await Promise.all(
       independentTools.map(tool => tool.call(tool.input))
   );
   ```

2. **Compaction 优化**
   - 实现增量 compaction
   - 添加 compaction 策略配置

### 低优先级

1. **缓存优化**
   - 缓存工具 schema
   - 复用 API 连接

2. **错误恢复增强**
   - 实现断点续传
   - 添加重试队列

## 学习要点

1. **理解消息循环**: 这是 Claude Code 的"心跳"
2. **掌握工具调用模式**: `tool_use` → `tool_result` → 循环
3. **理解 compaction**: 对话历史的自动压缩机制
4. **Token 预算**: 理解 `maxTokens` 和预算管理

## 下一步

- [API 层和服务通信分析](./04_api_layer_analysis.md)
- [工具系统架构分析](./05_tools_analysis.md)
