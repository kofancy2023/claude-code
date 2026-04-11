# 模块集成指南：权限系统、终端UI与错误处理

## 概述

本文档说明 `permissions.ts`、`terminal.ts` 和 `errors.ts` 三个模块如何与现有代码架构结合使用。

---

## 1. 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           cli.ts (入口)                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  getConfig()              ← 读取环境变量配置                      │   │
│  │  runCLI()                 ← 创建并启动 REPL                      │   │
│  │                            ├─→ createProvider()                   │   │
│  │                            ├─→ createStore()                      │   │
│  │                            └─→ new Repl() → repl.run()           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Repl.ts (核心循环)                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  run()                      ← 启动 REPL 主循环                   │   │
│  │    └─→ this.rl.on('line')   ← 监听用户输入                       │   │
│  │                               └─→ handleInput()                  │   │
│  │                                                                  │   │
│  │  handleInput()                ← 处理用户输入                      │   │
│  │    ├─→ store.addMessage()    ← 添加到历史                        │   │
│  │    ├─→ client.sendMessage()  ← 调用 AI                           │   │
│  │    │                          ├─→ toolCalls ? handleToolCall()  │   │
│  │    │                          └─→ text ? 输出结果                 │   │
│  │    │                                                                  │   │
│  │    └─→ ⚠️ 错误处理 (errors.ts) ← 统一错误捕获和格式化             │   │
│  │                                                                  │   │
│  │  handleToolCall()              ← 处理工具调用                    │   │
│  │    ├─→ toolRegistry.get()     ← 查找工具                        │   │
│  │    ├─→ ✅ 权限检查 (permissions.ts) ← 执行前检查                   │   │
│  │    ├─→ tool.execute()        ← 执行工具                        │   │
│  │    └─→ store.addMessage()    ← 存入结果                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
         │                           │                    │
         ▼                           ▼                    ▼
┌─────────────────┐      ┌─────────────────┐     ┌─────────────────┐
│  permissions.ts │      │   terminal.ts   │     │   errors.ts     │
│                 │      │                 │     │                 │
│ 权限检查钩子      │      │  UI输出美化      │     │ 错误统一处理     │
│                 │      │                 │     │                 │
│ • 工具白名单     │      │ • 彩色输出       │     │ • AppError 类  │
│ • 命令过滤       │      │ • ASCII 边框     │     │ • 错误码       │
│ • 网络控制       │      │ • 时间戳        │     │ • 格式化输出    │
│ • 环境变量控制    │      │ • 欢迎界面      │     │ • 历史记录      │
└─────────────────┘      └─────────────────┘     └─────────────────┘
```

---

## 2. permissions.ts 集成方式

### 2.1 模块职责

`permissions.ts` 是权限系统模块，负责在工具执行前进行安全检查：

| 功能 | 说明 |
|------|------|
| 工具白名单 | 控制哪些工具可以被调用 |
| 命令过滤 | 对 BashTool 执行特定命令进行限制 |
| 网络控制 | 控制是否允许网络访问 |
| 环境变量控制 | 控制是否允许访问环境变量 |

### 2.2 集成位置

**文件**: `src/core/Repl.ts`
**方法**: `handleToolCall()`
**位置**: 工具执行之前

### 2.3 集成代码

在 `handleToolCall()` 方法中，工具执行前添加权限检查：

```typescript
import { permissions } from '../services/permissions.js';

// 在 handleToolCall() 方法中
private async handleToolCall(toolCall: {
  id: string;
  name: string;
  input: Record<string, unknown>;
}): Promise<void> {
  // 打印工具调用信息
  console.log(`  📦 ${toolCall.name}:`, toolCall.input);

  // 从工具注册表中查找对应工具
  const tool = toolRegistry.get(toolCall.name);
  if (!tool) {
    console.error(`  ❌ Tool not found: ${toolCall.name}`);
    this.store.addMessage({
      role: 'user',
      content: JSON.stringify({
        type: 'tool_result',
        tool_call_id: toolCall.id,
        content: `Error: Tool ${toolCall.name} not found`,
        is_error: true,
      }),
    });
    return;
  }

  // ===== 权限检查（新增） =====
  const permResult = permissions.checkPermission({
    toolName: toolCall.name,
    action: 'execute',
    params: toolCall.input,
  });

  if (!permResult.allowed) {
    console.error(`  ❌ Permission denied: ${permResult.reason}`);
    this.store.addMessage({
      role: 'user',
      content: JSON.stringify({
        type: 'tool_result',
        tool_call_id: toolCall.id,
        content: `Permission denied: ${permResult.reason}`,
        is_error: true,
      }),
    });
    return;
  }

  // 执行工具
  try {
    const result = await tool.execute(toolCall.input);
    // ...
  }
}
```

### 2.4 使用示例

```typescript
// 在应用启动时配置权限
import { permissions } from './services/permissions.js';

// 默认允许所有工具（已默认配置）
permissions.allowAllTools();

// 或者设置严格模式 - 只允许特定工具
permissions.denyAllTools();
permissions.allowTool('BashTool');
permissions.allowTool('FileReadTool');
permissions.allowTool('FileWriteTool');
permissions.allowTool('WebSearchTool');
permissions.allowTool('GitHubRepoTool');

// 对 BashTool 命令进行白名单限制
permissions.allowCommand('git');
permissions.allowCommand('ls');
permissions.allowCommand('npm');

// 禁用网络访问（影响 WebSearchTool）
permissions.allowNetworkAccess(false);

// 查看当前权限状态
console.log(permissions.getStatus());
```

---

## 3. terminal.ts 集成方式

### 3.1 模块职责

`terminal.ts` 是终端UI渲染模块，负责美化控制台输出：

| 功能 | 说明 |
|------|------|
| ANSI 颜色 | 使用转义序列实现彩色输出 |
| ASCII 边框 | 绘制专业的界面框 |
| 时间戳 | 可选的执行时间显示 |
| 统一格式化 | 统一各类消息的显示样式 |

### 3.2 集成位置

| 文件 | 位置 | 替换内容 |
|------|------|----------|
| `cli.ts` | `runCLI()` | 欢迎信息、配置显示 |
| `Repl.ts` | `run()` | 欢迎信息 |
| `Repl.ts` | `handleInput()` | 处理中提示 |
| `Repl.ts` | `handleToolCall()` | 工具调用、结果、错误显示 |

### 3.3 cli.ts 集成

```typescript
import { terminal } from '../ui/terminal.js';

export async function runCLI(): Promise<void> {
  console.log(terminal.renderWelcome());

  const config = getConfig();
  const provider = createProvider({...});

  // 使用 terminal 渲染配置信息
  console.log(terminal.renderInfo(`Provider: ${provider.name}`));
  console.log(terminal.renderDivider());
  console.log(terminal.renderInfo('Type your messages or "exit" to quit.\n'));
}
```

### 3.4 Repl.ts 流式输出集成

`Repl.ts` 使用简化的流式输出方案，参考 Claude Code 的实现：

```typescript
import { terminal } from '../ui/terminal.js';

private createStreamCallbacks(): StreamCallbacks {
  let tokenCount = 0;
  const startTime = Date.now();

  return {
    onChunk: (text: string) => {
      tokenCount++;
      process.stdout.write(text);  // 直接输出文本片段
    },
    onComplete: (_fullText: string) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const speed = elapsed && parseFloat(elapsed) > 0
        ? Math.round(tokenCount / parseFloat(elapsed))
        : 0;
      process.stdout.write(
        `\n\x1b[32m✓\x1b[0m \x1b[90m${tokenCount} tokens, ${elapsed}s (${speed} tok/s)\x1b[0m\n\n`
      );
    },
    onError: (error: Error) => {
      process.stdout.write('\n');
      console.error(terminal.renderError(error.message));
    },
  };
}

private async handleInput(input: string): Promise<void> {
  console.log(terminal.renderUserMessage(input));

  try {
    this.store.addMessage({ role: 'user', content: input });

    const callbacks = this.createStreamCallbacks();
    const { text, toolCalls } = await this.client.sendMessage(
      this.store.getMessages(),
      this.store.getTools(),
      callbacks
    );

    if (toolCalls.length > 0) {
      console.log(terminal.renderInfo(`Tool calls detected: ${toolCalls.length}`));
      for (const toolCall of toolCalls) {
        await this.handleToolCall(toolCall);
      }
      const secondCallbacks = this.createStreamCallbacks();
      const { text: finalText } = await this.client.sendMessage(
        this.store.getMessages(),
        this.store.getTools(),
        secondCallbacks
      );
      if (finalText) {
        this.store.addMessage({ role: 'assistant', content: finalText });
      }
    } else if (text) {
      this.store.addMessage({ role: 'assistant', content: text });
    }
  } catch (error) {
    await errorHandler.handle(error, { context: 'handleInput' });
    console.error(terminal.renderError(formatError(error)));
  }
}
```

**流式输出显示效果**：
```
────────────────────────────────────────────────────────────
你好

你好！有什么可以帮助你的吗？

✓ 135 tokens, 15s (9 tok/s)

>
```

---

## 4. errors.ts 集成方式

### 4.1 模块职责

`errors.ts` 是错误处理模块，提供统一的错误管理：

| 功能 | 说明 |
|------|------|
| AppError 类层次 | 9 种特定错误类型 |
| 错误码 | 便于程序化处理 |
| 错误格式化 | 统一的错误字符串格式 |
| 安全异步包装 | safeAsync 返回 Result 类型 |
| 错误历史 | ErrorHandler 记录最近 N 条错误 |

### 4.2 错误类层次

```
AppError (基类)
├── ValidationError      - 参数验证失败
├── AuthenticationError  - 认证失败
├── AuthorizationError   - 权限不足
├── NotFoundError        - 资源不存在
├── RateLimitError       - 请求限流
├── APIError             - API 调用失败
├── NetworkError         - 网络错误
├── ToolExecutionError   - 工具执行失败
└── ConfigurationError   - 配置错误
```

### 4.3 集成位置

| 文件 | 方法 | 作用 |
|------|------|------|
| `Repl.ts` | `handleInput()` | 捕获 AI 调用错误 |
| `Repl.ts` | `handleToolCall()` | 捕获工具执行错误 |

### 4.4 集成代码

```typescript
import { formatError, errorHandler, ToolExecutionError } from '../utils/errors.js';
import { terminal } from '../ui/terminal.js';

// handleInput() 中的错误处理
private async handleInput(input: string): Promise<void> {
  try {
    // ... 业务逻辑 ...
  } catch (error) {
    // 记录错误到历史
    const appError = errorHandler.handle(error, { context: 'handleInput' });
    // 格式化并显示错误
    console.error(terminal.renderError(formatError(appError)));
  }
}

// handleToolCall() 中的错误处理
private async handleToolCall(toolCall: {...}): Promise<void> {
  try {
    const result = await tool.execute(toolCall.input);
    console.log(terminal.renderToolResult(result));
    // ...
  } catch (error) {
    // 包装为统一的 ToolExecutionError
    const appError = new ToolExecutionError(
      toolCall.name,
      error instanceof Error ? error.message : String(error)
    );

    // 记录错误
    errorHandler.handle(appError, { toolCall });

    // 格式化并显示
    console.error(terminal.renderError(formatError(appError)));

    // 返回错误信息给模型
    this.store.addMessage({
      role: 'user',
      content: JSON.stringify({
        type: 'tool_result',
        tool_call_id: toolCall.id,
        content: formatError(appError),
        is_error: true,
      }),
    });
  }
}
```

### 4.5 错误格式化输出示例

```typescript
// ValidationError
[VALIDATION_ERROR] Invalid email format
  Details: { "field": "email" }

// AuthenticationError
[AUTH_ERROR] Authentication failed

// ToolExecutionError
[TOOL_EXECUTION_ERROR] Tool 'BashTool' execution failed: Command timed out
  Details: { "toolName": "BashTool" }
```

---

## 5. 集成后的完整流程

```
用户输入
    │
    ▼
┌─────────────────────────────────────────┐
│           Repl.handleInput()            │
│                                         │
│  1. store.addMessage()                  │
│  2. client.sendMessage()                │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │     toolCalls.length > 0 ?      │    │
│  └─────────────────────────────────┘    │
│         │               │               │
│        YES              NO              │
│         ▼               ▼               │
│  ┌────────────┐  ┌──────────────┐      │
│  │ handle     │  │ terminal.    │      │
│  │ ToolCall() │  │ renderText() │      │
│  └────────────┘  └──────────────┘      │
│         │                               │
│         ▼                               │
│  ┌─────────────────────────────────┐    │
│  │ 权限检查 (permissions.check)   │    │
│  └─────────────────────────────────┘    │
│         │               │               │
│        YES              NO              │
│         ▼               ▼               │
│  ┌──────────┐  ┌──────────────────┐     │
│  │ tool.    │  │ terminal.        │     │
│  │ execute()│  │ renderError()    │     │
│  └──────────┘  └──────────────────┘     │
│         │                               │
│         ▼                               │
│  ┌─────────────────────────────────┐    │
│  │ 错误处理 (errors.ts)            │    │
│  │ • ToolExecutionError            │    │
│  │ • errorHandler.handle()          │    │
│  │ • formatError()                 │    │
│  └─────────────────────────────────┘    │
│         │                               │
│         ▼                               │
│  ┌─────────────────────────────────┐    │
│  │ UI 输出 (terminal.ts)           │    │
│  │ • renderToolCall()              │    │
│  │ • renderToolResult()            │    │
│  │ • renderError()                 │    │
│  └─────────────────────────────────┘    │
│         │                               │
│         ▼                               │
│  ┌─────────────────────────────────┐    │
│  │ store.addMessage(tool_result)  │    │
│  │ 再次调用 client.sendMessage()   │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

---

## 6. 后续优化方向（已实现）

### 6.1 权限系统 - 配置文件加载 ✅

支持从 JSON/YAML 文件加载权限规则：

```typescript
import { PermissionSystem } from '../services/permissions.js';

// 从配置文件创建
const perm = PermissionSystem.fromFile('./permissions.json');

// 编程方式创建
const perm = PermissionSystem.fromConfig({
  defaultMode: 'deny_all',
  allowedTools: ['FileReadTool', 'BashTool'],
  allowedCommands: ['git', 'ls', 'npm'],
  allowNetwork: true,
  rules: [
    { tool: 'BashTool', command: 'rm', allow: false },
    { tool: 'BashTool', command: 'sudo', allow: false },
  ],
});

// 保存配置到文件
perm.saveToFile('./permissions.json');
```

**配置文件示例 (permissions.json)**:
```json
{
  "defaultMode": "custom",
  "allowedTools": ["FileReadTool", "BashTool", "GitHubRepoTool"],
  "deniedTools": ["EditTool"],
  "allowedCommands": ["git", "ls", "npm", "node"],
  "allowNetwork": true,
  "allowEnvAccess": false,
  "rules": [
    { "tool": "BashTool", "command": "rm", "allow": false },
    { "tool": "BashTool", "command": "sudo", "allow": false }
  ]
}
```

### 6.2 终端UI - 流式输出支持 ✅

支持实时渲染流式输出：

```typescript
import { terminal } from '../ui/terminal.js';

// 创建流式渲染器
const streamer = terminal.createStream();

// 开始流式输出
streamer.start('thinking...');

// 实时更新（模拟打字效果）
streamer.update('Typing response...', 15);

// 完成
streamer.finish('Final response text');

// 渲染加载动画帧
const frame = terminal.renderLoadingFrame(0); // '⠋'

// 渲染流式开始标记
const start = terminal.renderStreamStart('thinking...');
```

**流式渲染器功能**：
| 方法 | 说明 |
|------|------|
| `start(prefix)` | 开始流式输出 |
| `update(text, tokens?)` | 实时更新内容，可显示速度 |
| `finish(text)` | 完成输出，显示耗时 |
| `writeLine(text)` | 写入一行（不覆盖） |
| `writeRaw(text)` | 写入原始文本 |
| `cancel()` | 取消输出 |

### 6.3 错误处理 - 错误上报服务 ✅

支持错误上报到远程服务：

```typescript
import { errorHandler, ErrorReporter } from '../utils/errors.js';

// 开发模式（输出到控制台）
const devReporter = ErrorReporter.createDevReporter();
errorHandler.configureReporter({ enabled: true, env: 'development' });

// 生产模式（HTTP 上报）
const prodReporter = ErrorReporter.createProdReporter(
  'https://errors.example.com/report',
  'my-agent'
);
errorHandler.configureReporter({
  enabled: true,
  endpoint: 'https://errors.example.com/report',
  env: 'production',
  metadata: { version: '1.0.0' },
  filter: (error) => error.code !== 'VALIDATION_ERROR',
});

// 启用批量上报（每 10 个错误上报一次）
prodReporter.setBatchMode(true, 10);

// 处理错误
try {
  await riskyOperation();
} catch (error) {
  await errorHandler.handle(error, { userId: '123', operation: 'fetch' });
}

// 获取最近 N 条错误
const recent = errorHandler.getRecent(5);

// 刷新上报缓冲区
await errorHandler.flushReporter();
```

**ErrorReporter 功能**：
| 方法 | 说明 |
|------|------|
| `report(error, context?)` | 上报单个错误 |
| `setBatchMode(enabled, size)` | 启用/禁用批量模式 |
| `flush()` | 刷新缓冲区 |
| `configure(config)` | 配置上报服务 |

---

## 7. 设计思路总结

### 7.1 权限系统设计思路

1. **白名单模式** - 默认拒绝，按需允许
2. **命令前缀匹配** - 支持 `git`, `ls` 等命令前缀
3. **分层控制** - 工具级、命令级、网络级分别控制
4. **静默失败** - 检查失败返回原因，不抛出异常
5. **配置文件支持** - 支持 JSON/YAML 格式加载和保存

### 7.2 终端UI设计思路

1. **ANSI转义序列** - 直接控制终端颜色和光标
2. **Unicode图标** - 🔧 ✓ ✗ ⚠ ℹ 等可视化符号
3. **ASCII边框** - ╔ ═ ╗ ║ ╚ ╝ 等制表符绘制界面
4. **时间戳** - 可选显示操作时间
5. **零依赖** - 不引入 ink、blessed 等外部库
6. **流式渲染** - 支持实时更新的流式输出

### 7.3 错误处理设计思路

1. **层次化错误** - 从基类扩展特定错误类型
2. **错误码** - 便于程序化处理和日志记录
3. **上下文附加** - details 字段可附加任意信息
4. **安全异步包装** - safeAsync 返回 Result 类型
5. **历史记录** - ErrorHandler 记录最近 N 条错误
6. **错误上报** - 支持 HTTP 上报和批量上报