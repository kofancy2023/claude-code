# My Agent API 参考

> 版本: 0.1.0
> 最后更新: 2026-04-15

---

## 1. 核心类

### 1.1 Repl 类

**用途**：REPL（读取-求值-打印循环）类，管理命令行交互式对话。

**主要方法**：

- `constructor({ client, store })` - 构造函数
  - `client`: AI 提供商实例
  - `store`: 状态存储实例

- `run()` - 启动 REPL 循环

- `getToolChainExecutor()` - 获取工具链执行器

### 1.2 QueryEngine 类

**用途**：查询引擎，管理 AI 对话的多轮工具调用循环。

**主要方法**：

- `constructor(client)` - 构造函数
  - `client`: AI 提供商实例

- `query(messages, tools, callbacks)` - 执行一次完整的查询
  - `messages`: 对话历史消息数组
  - `tools`: 可用的工具列表
  - `callbacks`: 流式输出回调函数
  - **返回**：查询结果，包含响应文本、更新后的消息和工具调用次数

### 1.3 SessionManager 类

**用途**：会话管理器，管理对话会话的持久化。

**主要方法**：

- `constructor(sessionsDir)` - 构造函数
  - `sessionsDir`: 会话存储目录路径

- `save(session)` - 保存会话到文件
  - `session`: 会话数据
  - **返回**：会话 ID

- `load(sessionId)` - 从文件加载会话
  - `sessionId`: 会话 ID
  - **返回**：会话数据，如果不存在则返回 null

- `list()` - 列出所有会话
  - **返回**：会话数据数组

- `delete(sessionId)` - 删除会话
  - `sessionId`: 会话 ID
  - **返回**：是否删除成功

- `exportSession(sessionId)` - 导出会话为 JSON 字符串
  - `sessionId`: 会话 ID
  - **返回**：JSON 字符串，如果不存在则返回 null

- `importSession(jsonContent)` - 从 JSON 字符串导入会话
  - `jsonContent`: JSON 字符串
  - **返回**：导入后的会话数据

- `createSession(options)` - 创建新会话
  - `options`: 会话选项
  - **返回**：新会话数据

### 1.4 MemoryManager 类

**用途**：记忆管理器，管理长期记忆和短期记忆。

**主要方法**：

- `addMemory(content, type, metadata, importance)` - 添加记忆
  - `content`: 记忆内容
  - `type`: 记忆类型（short_term, long_term, working）
  - `metadata`: 元数据
  - `importance`: 重要性
  - **返回**：记忆项

- `retrieveMemory(query, options)` - 检索记忆
  - `query`: 查询文本
  - `options`: 检索选项
  - **返回**：记忆项数组

- `cleanShortTermMemory(ageThreshold)` - 清理短期记忆
  - `ageThreshold`: 时间阈值（毫秒）

- `boostMemoryImportance(memoryId, newImportance)` - 提升记忆重要性
  - `memoryId`: 记忆 ID
  - `newImportance`: 新的重要性
  - **返回**：是否成功

- `getMemoryStats()` - 获取记忆统计信息
  - **返回**：统计信息对象

### 1.5 LspService 类

**用途**：LSP 服务，管理多个 LSP 客户端。

**主要方法**：

- `constructor(config, rootPath)` - 构造函数
  - `config`: LSP 服务配置
  - `rootPath`: 根路径

- `startClient(language)` - 启动指定语言的 LSP 客户端
  - `language`: 语言名称

- `stopClient(language)` - 停止指定语言的 LSP 客户端
  - `language`: 语言名称

- `stopAllClients()` - 停止所有 LSP 客户端

- `getCompletions(language, uri, line, character)` - 获取代码补全
  - `language`: 语言名称
  - `uri`: 文件 URI
  - `line`: 行号
  - `character`: 列号
  - **返回**：补全列表

- `getSignatureHelp(language, uri, line, character)` - 获取签名帮助
  - `language`: 语言名称
  - `uri`: 文件 URI
  - `line`: 行号
  - `character`: 列号
  - **返回**：签名帮助

- `findDefinition(language, uri, line, character)` - 查找定义
  - `language`: 语言名称
  - `uri`: 文件 URI
  - `line`: 行号
  - `character`: 列号
  - **返回**：位置信息

- `findReferences(language, uri, line, character)` - 查找引用
  - `language`: 语言名称
  - `uri`: 文件 URI
  - `line`: 行号
  - `character`: 列号
  - **返回**：位置信息数组

- `getDocumentSymbols(language, uri)` - 获取文档符号
  - `language`: 语言名称
  - `uri`: 文件 URI
  - **返回**：符号数组

- `getCodeActions(language, uri, startLine, startCharacter, endLine, endCharacter)` - 获取代码操作
  - `language`: 语言名称
  - `uri`: 文件 URI
  - `startLine`: 起始行号
  - `startCharacter`: 起始列号
  - `endLine`: 结束行号
  - `endCharacter`: 结束列号
  - **返回**：代码操作数组

- `formatDocument(language, uri, options)` - 格式化文档
  - `language`: 语言名称
  - `uri`: 文件 URI
  - `options`: 格式化选项
  - **返回**：编辑数组

## 2. 工具系统

### 2.1 工具接口

```typescript
interface Tool {
  name: string;
  description: string;
  execute(input: ToolInput): Promise<ToolOutput>;
}

type ToolInput = Record<string, unknown>;
type ToolOutput = string;
```

### 2.2 内置工具

| 工具名称 | 描述 | 参数 |
|---------|------|------|
| `BashTool` | 执行 bash 命令 | `command`: 命令字符串 |
| `FileReadTool` | 读取文件内容 | `path`: 文件路径 |
| `FileWriteTool` | 写入文件内容 | `path`: 文件路径, `content`: 内容 |
| `FileListTool` | 列出目录中的文件 | `path`: 目录路径 |
| `GlobTool` | 使用 glob 模式匹配文件 | `pattern`: glob 模式, `path`: 目录路径 |
| `GrepTool` | 搜索文件内容 | `pattern`: 正则表达式, `path`: 文件路径, `options`: 选项 |
| `EditTool` | 编辑文件内容 | `path`: 文件路径, `oldString`: 旧字符串, `newString`: 新字符串 |
| `MkdirTool` | 创建目录 | `path`: 目录路径 |
| `RmTool` | 删除文件或目录 | `path`: 路径, `recursive`: 是否递归, `force`: 是否强制 |
| `CopyTool` | 复制文件或目录 | `source`: 源路径, `destination`: 目标路径 |
| `MoveTool` | 移动文件或目录 | `source`: 源路径, `destination`: 目标路径 |
| `WebSearchTool` | 进行网络搜索 | `query`: 搜索查询 |
| `DateTool` | 获取当前日期和时间 | 无 |
| `GitStatusTool` | 查看 Git 状态 | 无 |
| `GitCommitTool` | 提交 Git 更改 | `message`: 提交消息 |
| `GitPushTool` | 推送 Git 更改 | 无 |
| `GitPullTool` | 拉取 Git 更改 | 无 |
| `GitBranchTool` | 管理 Git 分支 | `action`: 操作, `name`: 分支名称 |
| `GitDiffTool` | 查看 Git 差异 | 无 |
| `GitHubRepoTool` | 操作 GitHub 仓库 | `action`: 操作, `owner`: 所有者, `repo`: 仓库名 |
| `GitHubIssueTool` | 管理 GitHub Issue | `action`: 操作, `owner`: 所有者, `repo`: 仓库名, `issueNumber`: Issue 编号 |
| `GitHubCodeSearchTool` | 搜索 GitHub 代码 | `query`: 搜索查询, `owner`: 所有者, `repo`: 仓库名 |
| `GitHubPullRequestTool` | 管理 GitHub PR | `action`: 操作, `owner`: 所有者, `repo`: 仓库名, `prNumber`: PR 编号 |
| `GitHubCommitTool` | 管理 GitHub 提交 | `owner`: 所有者, `repo`: 仓库名, `commitSha`: 提交 SHA |
| `GitHubBranchTool` | 管理 GitHub 分支 | `action`: 操作, `owner`: 所有者, `repo`: 仓库名, `branch`: 分支名称 |
| `GitHubUserTool` | 查看 GitHub 用户信息 | `username`: 用户名 |
| `LSPTool` | 代码智能提示和分析 | `action`: 操作, `language`: 语言, `uri`: 文件 URI, `line`: 行号, `character`: 列号 |

## 3. AI 提供商

### 3.1 提供商接口

```typescript
interface AIProvider {
  name: string;
  sendMessage(messages: Message[], tools: Tool[], callbacks: StreamCallbacks): Promise<{ text: string; toolCalls: ToolCall[] }>;
}
```

### 3.2 支持的提供商

| 提供商 | API 密钥环境变量 | 默认模型 |
|-------|----------------|----------|
| `glm` | `AI_API_KEY` | `glm-4` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-3-opus-20240229` |
| `openai` | `OPENAI_API_KEY` | `gpt-4-turbo` |
| `gemini` | `GEMINI_API_KEY` | `gemini-1.5-pro` |

## 4. 事件系统

### 4.1 事件类型

| 事件名称 | 描述 | 事件数据 |
|---------|------|----------|
| `tool:execute` | 工具执行 | `{ tool: string, input: any, output: any }` |
| `tool:error` | 工具执行错误 | `{ tool: string, error: string, input: any }` |
| `message:send` | 发送消息 | `{ message: Message }` |
| `message:receive` | 接收消息 | `{ message: Message }` |
| `session:create` | 创建会话 | `{ session: SessionData }` |
| `session:load` | 加载会话 | `{ session: SessionData }` |
| `session:save` | 保存会话 | `{ session: SessionData }` |

### 4.2 事件监听

```typescript
import { globalEventEmitter } from './services/events';

globalEventEmitter.on('tool:execute', (data) => {
  console.log(`Tool ${data.tool} executed with input:`, data.input);
  console.log(`Output:`, data.output);
});
```

## 5. 插件系统

### 5.1 插件接口

```typescript
interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  activate(): Promise<void>;
  deactivate(): Promise<void>;
  getTools(): Tool[];
}
```

### 5.2 内置插件

- `git-plugin` - Git 相关工具
- `db-plugin` - 数据库相关工具

### 5.3 插件管理

```typescript
import { pluginManager } from './plugins';

// 安装插件
await pluginManager.install('git');

// 卸载插件
await pluginManager.uninstall('git');

// 列出已安装的插件
const plugins = pluginManager.list();
```

## 6. 配置系统

### 6.1 配置层次

```
CLI 参数 > 环境变量 > 配置文件 > 默认值
```

### 6.2 配置文件

配置文件位于 `~/.my-agent/config.json`：

```json
{
  "provider": "glm",
  "model": "glm-4",
  "apiKey": "your-api-key",
  "baseUrl": "",
  "tools": {
    "enabled": true,
    "list": ["BashTool", "FileReadTool", "FileWriteTool"]
  },
  "session": {
    "dir": ".sessions",
    "autoSave": true
  }
}
```

## 7. 类型定义

### 7.1 消息类型

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
}
```

### 7.2 工具调用类型

```typescript
interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}
```

### 7.3 流式回调类型

```typescript
interface StreamCallbacks {
  onChunk?: (text: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
  onConfirm?: (message: string, diff?: string[]) => Promise<boolean>;
}
```

### 7.4 会话数据类型

```typescript
interface SessionData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  metadata: {
    provider?: string;
    model?: string;
    messageCount: number;
  };
}
```

## 8. 错误处理

### 8.1 错误类型

| 错误类型 | 描述 |
|---------|------|
| `ToolExecutionError` | 工具执行错误 |
| `ApiError` | API 调用错误 |
| `PermissionError` | 权限错误 |
| `ConfigurationError` | 配置错误 |
| `SessionError` | 会话错误 |

### 8.2 错误处理

```typescript
import { errorHandler, formatError } from './utils/errors';

try {
  // 执行操作
} catch (error) {
  await errorHandler.handle(error, { context: 'operation' });
  console.error(formatError(error));
}
```

## 9. 性能优化

### 9.1 内存管理

- 使用 `MemoryManager` 管理长期和短期记忆
- 定期清理短期记忆
- 限制工作记忆大小

### 9.2 上下文管理

- 使用 `ContextManager` 智能截断上下文
- 根据模型上下文窗口大小调整消息数量
- 对长对话进行摘要处理

### 9.3 工具执行

- 并行执行独立工具
- 缓存工具执行结果
- 优化工具参数解析

## 10. 安全考虑

### 10.1 权限系统

- 危险操作需要用户确认
- 工具执行前进行权限检查
- 支持自定义权限配置

### 10.2 输入验证

- 验证工具参数
- 防止注入攻击
- 限制工具执行时间

### 10.3 数据安全

- 不存储敏感信息
- API 密钥安全管理
- 会话数据加密存储

## 11. 部署

### 11.1 本地部署

```bash
# 安装依赖
npm install

# 构建
npm run build

# 运行
npm start
```

### 11.2 容器部署

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

ENV AI_PROVIDER=glm
ENV AI_API_KEY=your-api-key

CMD ["npm", "start"]
```

## 12. 测试

### 12.1 运行测试

```bash
# 运行所有测试
npm test

# 运行测试并监视变化
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

### 12.2 测试工具

- `vitest` - 单元测试框架
- `mock` - 模拟 AI 提供商和工具
- `coverage` - 代码覆盖率分析

---

## 13. 版本历史

| 版本 | 日期 | 主要变化 |
|------|------|----------|
| 0.1.0 | 2026-04-15 | 初始版本 |

---

本 API 参考文档提供了 My Agent 的核心 API 和使用方法，更多详细信息请参考源代码和其他文档。