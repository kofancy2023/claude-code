# 事件系统 (Event System) 使用指南

## 目录

1. [概述](#1-概述)
2. [核心概念](#2-核心概念)
3. [工作原理](#3-工作原理)
4. [快速开始](#4-快速开始)
5. [API 参考](#5-api-参考)
6. [事件类型](#6-事件类型)
7. [Webhook 使用](#7-webhook-使用)
8. [最佳实践](#8-最佳实践)
9. [集成状态](#9-集成状态)

---

## 1. 概述

事件系统是 Agent 框架的核心模块，提供统一的发布-订阅机制，用于：

- **监控工具执行** - 记录所有工具调用及其结果
- **错误追踪** - 捕获并传播错误事件
- **远程回调** - 通过 Webhook 通知外部系统
- **业务扩展** - 支持自定义业务逻辑插件

### 特性

| 特性 | 描述 |
|------|------|
| 同步/异步事件 | 支持同步和异步两种事件处理模式 |
| 订阅/取消订阅 | 支持动态添加和移除事件监听器 |
| 错误隔离 | 单个处理器错误不会影响其他处理器 |
| 历史记录 | 自动保存最近 100 条事件历史 |
| 指标统计 | 记录每个事件的触发次数和错误数 |
| Webhook 支持 | 可将事件转发到远程 HTTP 端点 |

---

## 2. 核心概念

### 2.1 发布-订阅模式 (Pub/Sub)

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   发布者    │         │   事件总线   │         │   订阅者    │
│  (Emitter)  │────────►│  (EventBus) │────────►│ (Handler)   │
└─────────────┘         └─────────────┘         └─────────────┘
     │                                                │
     │  emit('event', data)                          │
     └────────────────────────────────────────────────┘
              事件数据流动方向
```

### 2.2 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| `EventEmitter` | `src/services/events.ts` | 事件发射器核心类 |
| `WebhookDispatcher` | `src/services/events.ts` | 远程 Webhook 调度器 |
| `globalEventEmitter` | `src/services/events.ts` | 全局单例实例 |

### 2.3 事件流

```
用户代码                  事件系统                    外部系统
    │                        │                          │
    │  on('tool:execute',    │                          │
    │    handler)             │                          │
    ├────────────────────────►│                          │
    │                        │                          │
    │  emit('tool:execute',   │                          │
    │    {tool, input,        │                          │
    │     output})            │                          │
    ├────────────────────────►│                          │
    │                        │  同步调用 handler()        │
    │◄────────────────────────┤                          │
    │                        │                          │
    │                        │  HTTP POST to webhook     │
    │                        ├───────────────────────────►│
    │                        │                          │
```

---

## 3. 工作原理

### 3.1 EventEmitter 内部结构

```typescript
class EventEmitter<TEventMap> {
  // 事件处理器映射表
  private handlers: Map<EventName, Set<EventHandler>> = new Map();

  // 事件指标统计
  private metrics: Map<EventName, EventMetrics> = new Map();

  // 事件历史记录
  private eventHistory: Array<EventRecord> = [];
}
```

### 3.2 事件触发流程

```
emit('tool:execute', data)
        │
        ▼
┌───────────────────────────────────┐
│ 1. 获取事件处理器集合              │
│    handlers.get('tool:execute')   │
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│ 2. 更新指标                        │
│    metrics.totalEmitted++          │
│    metrics.lastEmittedAt = now()   │
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│ 3. 记录历史                        │
│    eventHistory.push({...})        │
│    如果超过 100 条，移除最旧的     │
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│ 4. 遍历并调用每个处理器            │
│    for (const handler of handlers) │
│      try { handler(data) }        │
│      catch { handleError() }      │
└───────────────────────────────────┘
```

### 3.3 错误处理机制

每个事件处理器都在独立的 try-catch 中执行，单个处理器的错误不会影响其他处理器：

```typescript
// 处理器1 错误 → 只打印错误，继续执行处理器2
for (const handler of handlers) {
  try {
    handler(data);  // 处理器1 抛出异常
  } catch (error) {
    console.error(`Error in handler:`, error);
    // 继续执行下一个处理器
  }
}
// 处理器2 正常执行
```

---

## 4. 快速开始

### 4.1 基本用法

```typescript
import { globalEventEmitter } from './services/events';

// 定义事件处理器
function handleToolExecute(data: { tool: string; input: unknown; output?: string }) {
  console.log(`[LOG] Tool executed: ${data.tool}`);
  if (data.output) {
    console.log(`  Output: ${data.output.substring(0, 100)}...`);
  }
}

// 订阅事件
const unsubscribe = globalEventEmitter.on('tool:execute', handleToolExecute);

// 当工具执行时，处理器会被自动调用
// ...

// 取消订阅（不再接收事件）
unsubscribe();
```

### 4.2 完整示例：日志记录 + Webhook

```typescript
import { globalEventEmitter, webhookDispatcher } from './services/events';

// 1. 添加本地日志处理器
globalEventEmitter.on('tool:execute', (data) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${data.tool}:`, data.input);
});

globalEventEmitter.on('tool:error', (data) => {
  console.error(`[ERROR] ${data.tool}:`, data.error);
});

// 2. 注册远程 Webhook
webhookDispatcher.registerWebhook('my-server', {
  url: 'https://my-server.com/webhook',
  events: ['tool:execute', 'tool:error'],
  retries: 3,
  timeout: 5000,
});

// 3. 现在所有工具执行都会触发本地日志和远程 Webhook
```

### 4.3 在 CLI 中使用

```typescript
// src/entrypoints/cli.ts
import { globalEventEmitter } from '../services/events';

// 在启动时设置事件监听
globalEventEmitter.on('tool:execute', (data) => {
  // 发送到日志服务
  sendToLogService(data);
});

// 在程序结束时取消订阅
process.on('exit', () => {
  globalEventEmitter.clear();
});
```

---

## 5. API 参考

### 5.1 EventEmitter 类

#### `on(event, handler)`

订阅事件。

```typescript
subscribe(): EventSubscription {
  const subscription = globalEventEmitter.on('tool:execute', (data) => {
    console.log(data.tool);
  });
  return subscription;
}
```

**参数：**
- `event`: 事件名称（必须是 `AgentEventMap` 中的键）
- `handler`: 事件处理器函数

**返回：** `EventSubscription` 对象，可调用 `unsubscribe()` 取消订阅

---

#### `once(event, handler)`

订阅事件，但只触发一次。

```typescript
// 只会执行一次
globalEventEmitter.once('session:start', (data) => {
  console.log('Session started:', data.sessionId);
});
```

---

#### `off(event, handler)`

取消订阅。

```typescript
function myHandler(data: { tool: string }) {
  console.log(data.tool);
}

globalEventEmitter.on('tool:execute', myHandler);
// ...
globalEventEmitter.off('tool:execute', myHandler); // 不再接收事件
```

---

#### `emit(event, data)`

同步触发事件。

```typescript
globalEventEmitter.emit('tool:execute', {
  tool: 'BashTool',
  input: { command: 'ls' },
  output: 'file1.txt\nfile2.txt',
});
```

---

#### `emitAsync(event, data)`

异步触发事件，等待所有处理器完成。

```typescript
await globalEventEmitter.emitAsync('tool:execute', {
  tool: 'BashTool',
  input: { command: 'ls' },
});
```

---

#### `hasListeners(event)`

检查是否有监听器。

```typescript
if (globalEventEmitter.hasListeners('tool:execute')) {
  console.log('有工具执行监听器');
}
```

---

#### `listenerCount(event)`

获取监听器数量。

```typescript
const count = globalEventEmitter.listenerCount('tool:execute');
console.log(`当前有 ${count} 个监听器`);
```

---

#### `getMetrics(event)`

获取事件统计指标。

```typescript
const metrics = globalEventEmitter.getMetrics('tool:execute');
if (metrics) {
  console.log(`总触发次数: ${metrics.totalEmitted}`);
  console.log(`处理器数量: ${metrics.totalHandlers}`);
  console.log(`错误次数: ${metrics.errorCount}`);
  console.log(`最后触发: ${new Date(metrics.lastEmittedAt!)}`);
}
```

---

#### `getEventHistory()`

获取事件历史记录。

```typescript
const history = globalEventEmitter.getEventHistory();
history.forEach((record) => {
  console.log(`[${new Date(record.timestamp)}] ${String(record.event)}`);
});
```

---

#### `clear()`

清除所有订阅者和历史记录。

```typescript
globalEventEmitter.clear();
```

---

### 5.2 WebhookDispatcher 类

#### `registerWebhook(id, config)`

注册 Webhook。

```typescript
webhookDispatcher.registerWebhook('my-webhook', {
  url: 'https://example.com/webhook',
  events: ['tool:execute', 'tool:error', 'error:occur'],
  headers: {
    'Authorization': 'Bearer my-token',
  },
  timeout: 10000,
  retries: 3,
});
```

---

#### `unregisterWebhook(id)`

取消注册 Webhook。

```typescript
webhookDispatcher.unregisterWebhook('my-webhook');
```

---

#### `listWebhooks()`

列出所有 Webhook。

```typescript
const webhooks = webhookDispatcher.listWebhooks();
webhooks.forEach(({ id, config }) => {
  console.log(`${id}: ${config.url} (events: ${config.events.join(', ')})`);
});
```

---

#### `dispatch(event, data)`

手动触发 Webhook 发送（通常由事件系统自动调用）。

```typescript
await webhookDispatcher.dispatch('tool:execute', {
  tool: 'BashTool',
  input: {},
});
```

---

## 6. 事件类型

### 6.1 AgentEventMap 完整定义

```typescript
export interface AgentEventMap {
  // 工具相关
  'tool:execute': { tool: string; input: unknown; output?: string };
  'tool:error': { tool: string; error: string; input: unknown };

  // 消息相关
  'message:send': { role: 'user' | 'assistant'; content: string };
  'message:receive': { role: 'user' | 'assistant'; content: string };

  // 错误相关
  'error:occur': { code: string; message: string; details?: unknown };

  // Token 使用
  'token:usage': { promptTokens: number; completionTokens: number; totalTokens: number };

  // 会话相关
  'session:start': { sessionId: string };
  'session:end': { sessionId: string };

  // 配置相关
  'config:change': { key: string; value: unknown };

  // 熔断器相关
  'circuit:open': { name: string };
  'circuit:close': { name: string };

  // 速率限制
  'rate:limit': { provider: string; retryAfter?: number };
}
```

### 6.2 已集成的事件

| 事件名 | 触发位置 | 数据结构 |
|--------|----------|----------|
| `tool:execute` | `QueryEngine.executeToolCall()` | `{ tool, input, output }` |
| `tool:error` | `QueryEngine.executeToolCall()` | `{ tool, input, error }` |

### 6.3 预留事件（待集成）

| 事件名 | 预期触发位置 | 用途 |
|--------|--------------|------|
| `session:start` | `SessionService` | 会话创建时 |
| `session:end` | `SessionService` | 会话结束时 |
| `error:occur` | `ErrorHandler` | 全局错误处理 |
| `token:usage` | `AIProvider` | Token 消耗统计 |
| `message:send` | `AIProvider` | 发送消息时 |
| `message:receive` | `AIProvider` | 接收消息时 |

---

## 7. Webhook 使用

### 7.1 Webhook 配置

```typescript
interface WebhookConfig {
  url: string;           // Webhook 端点 URL
  events: string[];      // 订阅的事件列表，使用 '*' 订阅所有事件
  headers?: Record<string, string>;  // 自定义请求头
  timeout?: number;      // 超时时间（毫秒），默认 10000
  retries?: number;      // 重试次数，默认 0
}
```

### 7.2 Webhook 负载格式

发送到远程服务器的数据格式：

```json
{
  "event": "tool:execute",
  "timestamp": 1712819200000,
  "data": {
    "tool": "BashTool",
    "input": { "command": "ls" },
    "output": "file1.txt\nfile2.txt"
  }
}
```

### 7.3 完整 Webhook 示例

```typescript
import { webhookDispatcher } from './services/events';

// 注册多个 Webhook
webhookDispatcher.registerWebhook('logging-service', {
  url: 'https://logs.example.com/agent-events',
  events: ['tool:execute', 'tool:error', 'error:occur'],
  headers: {
    'X-API-Key': process.env.LOGGING_API_KEY!,
  },
  retries: 3,
});

webhookDispatcher.registerWebhook('analytics', {
  url: 'https://analytics.example.com/events',
  events: ['*'],  // 订阅所有事件
  retries: 1,
});

webhookDispatcher.registerWebhook('slack-alerts', {
  url: 'https://hooks.slack.com/services/xxx/yyy/zzz',
  events: ['tool:error', 'error:occur'],
  retries: 2,
});
```

### 7.4 自定义 Webhook 服务端示例

```typescript
// 使用 Express.js 的服务端示例
import express from 'express';

const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  const { event, timestamp, data } = req.body;

  console.log(`[${new Date(timestamp)}] Event: ${event}`);
  console.log('Data:', JSON.stringify(data, null, 2));

  // 处理特定事件
  if (event === 'tool:error') {
    // 发送告警通知
    sendAlert(data);
  }

  res.status(200).json({ received: true });
});

app.listen(3000);
```

---

## 8. 最佳实践

### 8.1 事件处理器编写规范

```typescript
// ✅ 推荐：使用类型注解
globalEventEmitter.on('tool:execute', (data: { tool: string; input: unknown }) => {
  // ...
});

// ✅ 推荐：处理可能的异常
globalEventEmitter.on('tool:execute', (data) => {
  try {
    await saveToDatabase(data);
  } catch (error) {
    console.error('Failed to save:', error);
  }
});

// ❌ 避免：在处理器中抛出未捕获的异常
globalEventEmitter.on('tool:execute', (data) => {
  throw new Error('This will be caught but pollutes logs');
});
```

### 8.2 订阅管理

```typescript
class MyPlugin {
  private subscriptions: EventSubscription[] = [];

  activate() {
    // 统一保存订阅对象
    this.subscriptions.push(
      globalEventEmitter.on('tool:execute', this.handleToolExecute)
    );
    this.subscriptions.push(
      globalEventEmitter.on('tool:error', this.handleToolError)
    );
  }

  deactivate() {
    // 统一取消所有订阅
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.subscriptions = [];
  }
}
```

### 8.3 性能优化

```typescript
// ✅ 批量处理：使用 once 避免重复处理
globalEventEmitter.once('session:start', (data) => {
  initializeResources(data.sessionId);
});

// ✅ 按需监听：只在需要时订阅
if (process.env.ENABLE_EVENT_LOGGING === 'true') {
  globalEventEmitter.on('tool:execute', logToolExecution);
}

// ✅ 异步处理：使用 emitAsync 避免阻塞
await globalEventEmitter.emitAsync('tool:execute', data);
```

### 8.4 安全性考虑

```typescript
// ✅ 验证事件来源
globalEventEmitter.on('tool:execute', (data) => {
  // 验证输入不包含敏感信息
  if (containsSecrets(data.input)) {
    console.warn('Tool input contains secrets, sanitizing...');
    data.input = sanitizeInput(data.input);
  }
});

// ✅ 限制敏感信息通过 Webhook 发送
webhookDispatcher.registerWebhook('external', {
  url: 'https://external.com/webhook',
  events: ['tool:execute'],
  headers: {
    'X-Webhook-Secret': process.env.WEBHOOK_SECRET!,
  },
});

// 自定义处理器过滤敏感数据
globalEventEmitter.on('tool:execute', (data) => {
  const safeData = {
    tool: data.tool,
    timestamp: Date.now(),
    // 不发送 input 中的敏感信息
  };
  webhookDispatcher.dispatch('tool:execute', safeData);
});
```

---

## 9. 集成状态

### 9.1 当前集成情况

| 组件 | 文件 | 集成事件 | 状态 |
|------|------|----------|------|
| QueryEngine | `src/core/QueryEngine.ts` | `tool:execute`, `tool:error` | ✅ 已完成 |

### 9.2 待集成位置

| 组件 | 待集成事件 | 优先级 |
|------|------------|--------|
| SessionService | `session:start`, `session:end` | 中 |
| ErrorHandler | `error:occur` | 高 |
| AIProvider | `token:usage`, `message:send`, `message:receive` | 中 |
| CircuitBreaker | `circuit:open`, `circuit:close` | 低 |
| RateLimiter | `rate:limit` | 低 |

### 9.3 添加新事件集成

如需在新的位置集成事件，按以下步骤操作：

1. **导入事件发射器**

```typescript
import { globalEventEmitter } from '../services/events/index.js';
```

2. **在适当位置触发事件**

```typescript
// 例如：在会话开始时
globalEventEmitter.emit('session:start', {
  sessionId: generateSessionId(),
});
```

3. **类型安全检查**

确保 `AgentEventMap` 中已定义该事件类型。

---

## 附录 A：完整导入示例

```typescript
// 导入事件系统
import {
  EventEmitter,           // 事件发射器类
  globalEventEmitter,      // 全局单例实例
  webhookDispatcher,       // Webhook 调度器
  type AgentEventMap,      // 事件类型定义
  type WebhookConfig,      // Webhook 配置类型
  type EventSubscription,  // 订阅对象类型
} from './services/events';
```

---

## 附录 B：调试技巧

### 查看当前监听器

```typescript
// 获取所有事件指标
const allMetrics = globalEventEmitter.getAllMetrics();
for (const [event, metrics] of allMetrics) {
  console.log(`${String(event)}: ${metrics.totalEmitted} emits`);
}

// 检查特定事件是否有监听器
console.log('tool:execute listeners:', globalEventEmitter.listenerCount('tool:execute'));
```

### 事件历史回放

```typescript
// 获取最近的事件
const history = globalEventEmitter.getEventHistory();
const recentErrors = history
  .filter((r) => r.event === 'tool:error')
  .slice(-10);  // 最近 10 个错误

recentErrors.forEach((record) => {
  console.log(`[${new Date(record.timestamp)}]`, record.data);
});
```

---

## 相关文档

- [工具执行原理](../faq/1-tool-execute-principle.md)
- [集成指南](../faq/2-integration-guide.md)
- [流式输出机制](../faq/3-streaming-output.md)
- [高级特性](../faq/4-advanced-features.md)
