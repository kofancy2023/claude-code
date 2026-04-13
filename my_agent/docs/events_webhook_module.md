# Webhook 和事件系统设计

## 概述

Webhook 和事件系统提供了一套完整的事件订阅、触发和管理功能，支持实时通知、外部系统集成和异步任务回调。

## 工作原理详解

### 生活比喻：火灾报警器

Webhook 的工作原理可以用**火灾报警器**来完美比喻：

| 生活场景 | Webhook 概念 |
|---------|-------------|
| 安装报警器并设置规则 | 创建 Webhook (`createWebhook`) |
| 设置"着火打119" | 订阅事件 (`events: ['fire:detected']`) |
| 设置"通知物业" | 配置目的地 (`destinations: [...]`) |
| 烟雾触发传感器 | 发射事件 (`emit({ type: 'fire:detected' })`) |
| 报警器响/打电话 | 自动投递 (`callback()` 或 `POST url`) |
| 打不通就重试 | 重试机制 (`retry: { maxAttempts: 3 }`) |
| 物业收到短信 | 目的地收到通知 (HTTP 200 OK) |

### 完整流程对照

```
┌─────────────────────────────────────────────────────────────────┐
│                      商业大楼火灾报警系统                          │
└─────────────────────────────────────────────────────────────────┘

  📍 场景：大楼里装了火灾报警器

  1️⃣ 预设报警规则（= 创建 Webhook）
     "如果发生火灾（事件），就打119+发短信给物业（目的地）"

  2️⃣ 烟雾触发了传感器（= emit 发射事件）

  3️⃣ 报警器按规则动作：
     - 拨打119
     - 发短信给物业
     - 如果119打不通（失败），就重试

  4️⃣ 物业收到短信（= 目的地收到通知）
```

### 代码示例（与比喻配套）

```typescript
// ═══════════════════════════════════════════════════════════════
// 步骤1：安装报警器并设置规则（= 创建 Webhook）
// ═══════════════════════════════════════════════════════════════

const webhook = manager.createWebhook({
  name: '火灾报警',                          // 报警器名字
  events: ['fire:detected'],                // 订阅"火灾"事件
  destinations: [
    {
      id: 'dest_119',
      name: '拨打119',
      type: 'callback',                     // 回调方式
      callback: async () => {
        console.log('📞 正在拨打 119...');
        await call119();                    // 实际执行"拨打119"
      },
      enabled: true,
    },
    {
      id: 'dest_物业',
      name: '通知物业',
      type: 'http',                         // HTTP方式
      url: 'https://property-api.example.com/alert',
      enabled: true,
    },
  ],
  retry: {
    maxAttempts: 3,                         // 打不通就重试3次
    delay: 1000,
    exponentialBackoff: true,               // 1秒→2秒→4秒
  },
  enabled: true,                            // 报警器已启用
});

// ═══════════════════════════════════════════════════════════════
// 步骤2：真的着火了！（= 触发事件）
// ═══════════════════════════════════════════════════════════════

// 烟雾触发了传感器，报警器开始按预设规则工作
await manager.emit({
  id: 'evt_fire_001',
  type: 'fire:detected',                   // ← 事件类型
  data: {
    location: '3楼厨房',                     // ← 事件数据：哪里着火了
    severity: 'high',
  },
  timestamp: Date.now(),
});

// ═══════════════════════════════════════════════════════════════
// 步骤3：报警器按规则执行（= 自动投递到目的地）
// ═══════════════════════════════════════════════════════════════

// 执行过程：
// 1. 找到所有订阅了 "fire:detected" 的 Webhook
// 2. 检查过滤器（如果有的话）
// 3. 依次执行每个目的地：
//    - 执行 callback: () => call119()
//    - POST 到 https://property-api.example.com/alert
// 4. 如果失败，等待 1秒 → 重试 → 等待 2秒 → 重试 → 等待 4秒 → 重试
// 5. 记录日志
```

### 另一个例子：订阅报纸

```typescript
// 1. 去报社订阅报纸（= 创建 Webhook）
const subscription = newspaper.createSubscription({
  events: ['newspaper:published'],     // 订阅"报纸出版"事件
  destinations: [{
    id: 'my_home',
    type: 'callback',                    // 送报上门
    callback: () => deliverToMyDoor(),  // 送到家门口
  }],
  enabled: true,
});

// 2. 今天报纸出版了！（= 发射事件）
newspaper.emit({
  id: 'paper_001',
  type: 'newspaper:published',
  data: { edition: '第1000期', date: '2024-01-01' },
  timestamp: Date.now(),
});

// 3. 报社自动把报纸送到你家（= 自动投递）
//    → 你家门口出现了今天的报纸
```

### 核心概念总结

```
订阅（Webhook）     =  预先登记"如果X发生，就通知Y"
发射（emit）         =  X真的发生了
自动执行             =  系统按预设规则通知Y（调用callback或发HTTP）
```

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
