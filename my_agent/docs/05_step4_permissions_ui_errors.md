# Step 4: 权限系统、终端UI与错误处理

## 目标

实现 Phase 2 的三个核心模块：
1. 权限系统 - 控制工具访问和命令执行
2. 终端UI - 美化命令行输出
3. 错误处理 - 统一的错误管理

## 4.1 权限系统 (permissions.ts)

### 为什么需要权限系统？

```
没有权限控制的风险：
┌─────────────────────────────────────────────────────────┐
│  用户: "帮我删除所有文件"                                │
│  AI:   (调用 BashTool 执行 rm -rf /)  ← 危险！          │
└─────────────────────────────────────────────────────────┘

有权限控制：
┌─────────────────────────────────────────────────────────┐
│  AI:   (权限检查发现 rm -rf / 未在白名单)               │
│       → 拒绝执行，返回 "Command not allowed"           │
└─────────────────────────────────────────────────────────┘
```

### PermissionSystem 架构

```typescript
export class PermissionSystem {
  // 允许的工具列表（* 表示全部）
  private allowedTools: Set<string> = new Set();

  // 允许的命令前缀（用于 BashTool）
  private allowedCommands: Set<string> = new Set();

  // 网络访问控制（用于 WebSearchTool）
  private networkEnabled: boolean = true;

  // 环境变量访问控制
  private envAccessEnabled: boolean = true;
}
```

### 核心方法

| 方法 | 功能 |
|------|------|
| `allowTool(name)` | 允许特定工具 |
| `denyTool(name)` | 拒绝特定工具 |
| `allowCommand(cmd)` | 允许特定命令前缀 |
| `allowNetworkAccess(bool)` | 控制网络访问 |
| `isToolAllowed(name)` | 检查工具是否允许 |
| `checkPermission(ctx)` | 完整权限检查 |

### 使用示例

```typescript
import { permissions } from './services/permissions.js';

// 默认允许所有工具
permissions.allowAllTools();

// 只允许特定工具
permissions.denyAllTools();
permissions.allowTool('BashTool');
permissions.allowTool('FileReadTool');

// 白名单命令（只允许 git 和 ls）
permissions.allowCommand('git');
permissions.allowCommand('ls');

// 检查权限
const result = permissions.checkPermission({
  toolName: 'BashTool',
  action: 'execute',
  params: { command: 'git status' }
});

if (!result.allowed) {
  console.log(result.reason); // "Command not allowed"
}
```

## 4.2 终端UI (terminal.ts)

### 设计原则

1. **ANSI颜色** - 使用终端转义序列实现彩色输出
2. **ASCII艺术** - 边框、标题等使用特殊字符
3. **可配置主题** - 支持自定义颜色方案
4. **轻量依赖** - 纯 TypeScript，无外部 UI 库

### 颜色主题

```typescript
export const defaultTheme: TerminalTheme = {
  primary: '\x1b[36m',   // 青色
  secondary: '\x1b[35m', // 紫色
  success: '\x1b[32m',   // 绿色
  error: '\x1b[31m',     // 红色
  warning: '\x1b[33m',   // 黄色
  info: '\x1b[34m',      // 蓝色
  muted: '\x1b[90m',     // 灰色
};
```

### 渲染方法

| 方法 | 功能 |
|------|------|
| `renderWelcome()` | 显示欢迎界面 |
| `renderUserMessage(msg)` | 用户消息 |
| `renderAssistantMessage(msg)` | AI 消息 |
| `renderToolCall(name, input)` | 工具调用 |
| `renderToolResult(result)` | 工具结果 |
| `renderError(error)` | 错误信息 |
| `renderHelp()` | 帮助信息 |
| `renderBox(content)` | 边框盒子 |
| `renderDivider()` | 分隔线 |

### 使用示例

```typescript
import { terminal } from './ui/terminal.js';

// 欢迎信息
console.log(terminal.renderWelcome());

// 用户消息
console.log(terminal.renderUserMessage("帮我列出文件"));

// AI 回复
console.log(terminal.renderAssistantMessage("好的，我来执行 ls 命令"));

// 工具调用
console.log(terminal.renderToolCall("BashTool", { command: "ls" }));

// 工具结果
console.log(terminal.renderToolResult("file1.txt\nfile2.txt"));

// 错误信息
console.log(terminal.renderError("Permission denied"));

// 帮助框
console.log(terminal.renderHelp());
```

### 输出效果

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🤖  My Agent CLI                                           ║
║                                                              ║
║   Type your message or command.                              ║
║   Use /help for available commands.                          ║
║   Use /exit to quit.                                         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

[10:30:15] User: 帮我列出文件
[10:30:15] ▶ 好的，我来执行 ls 命令
[10:30:15] • BashTool
  {
    "command": "ls"
  }
[10:30:15] ✓ Result: file1.txt
           file2.txt
```

## 4.3 错误处理 (errors.ts)

### 错误类层次

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

### 使用示例

```typescript
import {
  AppError,
  ValidationError,
  ToolExecutionError,
  formatError,
  safeAsync,
  errorHandler
} from './utils/errors.js';

// 抛出特定错误
throw new ValidationError('Invalid email format', { field: 'email' });
throw new ToolExecutionError('BashTool', 'Command timed out');

// 安全异步调用
const result = await safeAsync(
  () => fetchUserData(userId),
  'Failed to fetch user'
);

if (!result.success) {
  console.log(result.error.code); // "NOT_FOUND"
  console.log(result.error.message);
}

// 格式化错误输出
try {
  await riskyOperation();
} catch (error) {
  console.log(formatError(error));
  // → [API_ERROR] Request failed: Connection timeout
}

// 全局错误处理
errorHandler.handle(error, { context: 'user_auth' });
console.log(errorHandler.getHistory());
```

### 统一错误格式

```json
{
  "name": "ToolExecutionError",
  "message": "Tool 'BashTool' execution failed: Command timed out",
  "code": "TOOL_EXECUTION_ERROR",
  "statusCode": 0,
  "details": {
    "toolName": "BashTool",
    "originalError": "Command timed out"
  }
}
```

## 4.4 新增文件结构

```
my_agent/src/
├── services/
│   ├── api/
│   │   └── ...
│   └── permissions.ts    ← 新增
├── ui/
│   └── terminal.ts       ← 新增
├── utils/
│   └── errors.ts         ← 新增
└── ...
```

## 4.5 设计思路总结

### 权限系统设计思路

1. **白名单模式** - 默认拒绝，按需允许
2. **命令前缀匹配** - 支持 `git`, `ls` 等命令前缀
3. **分层控制** - 工具级、命令级、网络级分别控制
4. **静默失败** - 检查失败返回原因，不抛出异常

### 终端UI设计思路

1. **ANSI转义序列** - 直接控制终端颜色和光标
2. **Unicode图标** - 🔧 ✓ ✗ ⚠ ℹ 等可视化符号
3. **ASCII边框** - ╔ ═ ╗ ║ ╚ ╝ 等制表符绘制界面
4. **时间戳** - 可选显示操作时间
5. **零依赖** - 不引入 ink、blessed 等外部库

### 错误处理设计思路

1. **层次化错误** - 从基类扩展特定错误类型
2. **错误码** - 便于程序化处理和日志记录
3. **上下文附加** - details 字段可附加任意信息
4. **安全异步包装** - safeAsync 返回 Result 类型
5. **历史记录** - ErrorHandler 记录最近 N 条错误