# Webhook 和事件系统设计

## 概述

Webhook 和事件系统提供了一套完整的事件订阅、触发和管理功能，支持实时通知、外部系统集成和异步任务回调。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    EventEmitter                             │
├─────────────────────────────────────────────────────────────┤
│  事件发射器                                                  │
│  - emit() 发射事件                                          │
│  - on() 订阅事件                                            │
│  - once() 单次订阅                                          │
│  - off() 取消订阅                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   WebhookManager                            │
├─────────────────────────────────────────────────────────────┤
│  Webhook 管理器                                             │
│  - createWebhook() 创建 Webhook                            │
│  - emit() 触发事件并投递                                    │
│  - 多目的地支持 (HTTP/Callback/Queue)                       │
│  - 重试机制                                                 │
│  - 日志记录                                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Destinations                                │
├─────────────────────────────────────────────────────────────┤
│  HTTP Webhook   │  Callback   │  Message Queue              │
│  POST 到 URL    │  函数调用   │  RabbitMQ/Redis            │
└─────────────────────────────────────────────────────────────┘
```

## 目录结构

```
src/events/
├── types.ts         # 类型定义
├── emitter.ts      # 事件发射器
├── webhook.ts      # Webhook 管理器
├── decorators.ts   # 回调装饰器
└── index.ts        # 模块导出
```

## 事件发射器

### 基本用法

```typescript
import { createEventEmitter } from './events';

// 创建事件发射器
const emitter = createEventEmitter();

// 订阅事件
const unsubscribe = emitter.on('user:login', (event) => {
  console.log('User logged in:', event.data);
});

// 发射事件
emitter.emit('user:login', { userId: '123', timestamp: Date.now() });

// 取消订阅
unsubscribe();

// 单次订阅
emitter.once('notification', (event) => {
  console.log('One-time notification:', event.data);
});
```

### 事件结构

```typescript
interface WebhookEvent<T = unknown> {
  id: string;           // 事件 ID
  type: string;        // 事件类型
  data: T;            // 事件数据
  timestamp: number;  // 时间戳
  source?: string;    // 来源
  metadata?: Record<string, unknown>; // 元数据
}
```

## Webhook 管理器

### 创建 Webhook

```typescript
import { createWebhookManager, WebhookEventType, WebhookDestinationType } from './events';

const manager = createWebhookManager();

// 创建 Webhook
const webhook = manager.createWebhook({
  name: 'My Webhook',
  description: '处理文件变更',
  events: [WebhookEventType.FileChanged],
  destinations: [
    {
      id: 'dest1',
      name: 'HTTP Endpoint',
      type: WebhookDestinationType.Http,
      url: 'https://api.example.com/webhook',
      headers: {
        'Authorization': 'Bearer token123',
      },
      enabled: true,
    },
    {
      id: 'dest2',
      name: 'Callback',
      type: WebhookDestinationType.Callback,
      callback: async (event, context) => {
        console.log('Callback received:', event.data);
      },
      enabled: true,
    },
  ],
  retry: {
    maxAttempts: 3,
    delay: 1000,
    exponentialBackoff: true,
  },
  enabled: true,
});
```

### 触发事件

```typescript
// 触发事件
const results = await manager.emit({
  id: 'evt_001',
  type: WebhookEventType.FileChanged,
  data: {
    path: '/project/src/index.ts',
    action: 'modified',
    user: 'admin',
  },
  timestamp: Date.now(),
});

// 检查投递结果
for (const result of results) {
  if (result.success) {
    console.log(`Delivered to ${result.destinationId}`);
  } else {
    console.error(`Failed: ${result.error}`);
  }
}
```

### 事件订阅

```typescript
// 订阅事件
const unsubscribe = manager.on(WebhookEventType.FileChanged, (event) => {
  console.log('File changed:', event.data);
});

// 触发时会通知所有订阅者
await manager.emit({
  id: 'evt_002',
  type: WebhookEventType.FileChanged,
  data: { path: '/test.txt' },
  timestamp: Date.now(),
});

// 取消订阅
unsubscribe();
```

### Webhook 过滤

```typescript
const webhook = manager.createWebhook({
  name: 'Filtered Webhook',
  events: [WebhookEventType.FileChanged],
  destinations: [...],
  filter: {
    // 只处理特定路径
    pathPatterns: ['src/**/*.ts', '*.js'],
    // 只处理特定来源
    sources: ['vscode', 'cli'],
  },
  enabled: true,
});
```

## 回调装饰器

### @OnEvent 装饰器

```typescript
import { OnEvent } from './events/decorators';

class FileWatcher {
  @OnEvent('file:changed')
  handleFileChange(event: WebhookEvent, context: WebhookContext) {
    console.log('File changed:', event.data);
  }

  // 带过滤条件的监听
  @OnEvent('file:changed', {
    filter: (event) => event.data.path.endsWith('.ts'),
  })
  handleTsFileChange(event: WebhookEvent) {
    console.log('TypeScript file changed');
  }
}
```

### @Debounce 防抖

```typescript
import { Debounce } from './events/decorators';

class AutoSaver {
  @Debounce(1000) // 1秒内只执行一次
  async save(event: WebhookEvent) {
    console.log('Saving...', event.data);
  }
}
```

### @Throttle 节流

```typescript
import { Throttle } from './events/decorators';

class RateLimiter {
  @Throttle(5000) // 5秒最多执行一次
  onClick(event: WebhookEvent) {
    console.log('Clicked');
  }
}
```

### @Retry 重试

```typescript
import { Retry } from './events/decorators';

class API caller {
  @Retry(3, 1000) // 最多重试3次，间隔1秒
  async callAPI(event: WebhookEvent) {
    console.log('Calling API...');
  }
}
```

### @ConcurrencyLimit 并发限制

```typescript
import { ConcurrencyLimit } from './events/decorators';

class Worker {
  @ConcurrencyLimit(5) // 最多5个并发
  async processTask(event: WebhookEvent) {
    console.log('Processing...');
  }
}
```

## 预定义事件类型

```typescript
enum WebhookEventType {
  FileChanged = 'file:changed',
  DirectoryChanged = 'directory:changed',
  GitCommit = 'git:commit',
  GitBranch = 'git:branch',
  GitTag = 'git:tag',
  ToolExecutionStart = 'tool:execution:start',
  ToolExecutionComplete = 'tool:execution:complete',
  ToolExecutionFailed = 'tool:execution:failed',
  AIQueryStart = 'ai:query:start',
  AIQueryComplete = 'ai:query:complete',
  AIQueryFailed = 'ai:query:failed',
  MCPResourceChanged = 'mcp:resource:changed',
  MCPConnectionChanged = 'mcp:connection:changed',
  SystemError = 'system:error',
  Custom = 'custom',
}
```

## 投递目的地类型

```typescript
enum WebhookDestinationType {
  Http = 'http',        // HTTP POST
  WebSocket = 'websocket',  // WebSocket
  SSE = 'sse',          // Server-Sent Events
  Callback = 'callback',    // 函数回调
  Queue = 'queue',      // 消息队列
}
```

## 错误处理

```typescript
import { WebhookError } from './events/types';

try {
  await manager.emit({...});
} catch (error) {
  if (error instanceof WebhookError) {
    console.error(`Webhook Error: ${error.code} - ${error.message}`);
  }
}
```

## 最佳实践

1. **事件命名**: 使用 `resource:action` 格式，如 `file:changed`
2. **错误处理**: 始终在回调中捕获异常
3. **重试配置**: 对于外部 HTTP 回调，建议设置重试
4. **并发控制**: 高频事件使用 `@ConcurrencyLimit` 限制并发
5. **防抖节流**: UI 相关事件使用 `@Debounce` 或 `@Throttle`

## 下一步计划

- [ ] WebSocket 目的地支持
- [ ] SSE 目的地支持
- [ ] 消息队列目的地 (RabbitMQ, Redis)
- [ ] Webhook 可视化管理界面
