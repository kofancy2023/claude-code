# My Agent 开发路线图

> 本文档对照 Claude Code 的核心功能，制定从当前状态到完整实现的详细路线图。

---

## 一、项目现状概览

### 1.1 已完成功能 ✅

| 功能模块 | 文件位置 | 状态 | 说明 |
|----------|----------|------|------|
| **REPL 循环** | `src/core/Repl.ts` | ✅ 完成 | 命令行交互、消息处理 |
| **多轮工具调用** | `src/core/QueryEngine.ts` | ✅ 完成 | 工具循环执行 |
| **CLI 命令系统** | `src/core/commands.ts` | ✅ 完成 | /help, /clear, /model 等 |
| **工具注册表** | `src/tools/registry.ts` | ✅ 完成 | 15 个内置工具 |
| **AI 提供商** | `src/services/api/` | ✅ 完成 | Anthropic, OpenAI, GLM, Gemini |
| **权限系统** | `src/services/permissions.ts` | ✅ 完成 | allow/deny/bypass 模式 |
| **会话管理** | `src/services/session.ts` | ✅ 完成 | 保存/加载会话 |
| **上下文管理** | `src/services/context-manager.ts` | ✅ 完成 | Token 窗口管理 |
| **工具链执行器** | `src/services/tool-chain.ts` | ✅ 完成 | 复杂任务编排 |
| **配置系统** | `src/config/index.ts` | ✅ 完成 | 环境变量/配置文件 |
| **错误处理** | `src/utils/errors.ts` | ✅ 完成 | 统一错误类 |
| **重试机制** | `src/utils/retry.ts` | ✅ 完成 | 指数退避 + 熔断器 |
| **性能优化** | `src/utils/performance.ts` | ✅ 完成 | LRU 缓存、并发控制 |
| **测试框架** | `vitest.config.ts` | ⚠️ 配置完成 | 仅 3 个基础测试 |

### 1.2 缺失功能 ❌

| 功能 | 优先级 | 当前状态 |
|------|--------|----------|
| 完整测试套件 | P1 | 仅有 3 个基础测试 |
| 安全加固 | P1 | 仅有框架 |
| 常用工具补充 | P2 | 缺少 GrepTool 等 |
| MCP 支持 | P2 | 未实现 |
| Webhook/回调 | P2 | 仅有框架 |
| Agent 模式 | P3 | 需验证 |
| 插件系统 | P3 | 未实现 |

---

## 二、分阶段实施计划

### 第一阶段：测试框架完善 (1-2天)

**目标：** 建立可靠的测试体系，确保代码质量

**为什么先做测试？**
```
无测试 → 代码随时可能坏 + 重构恐惧症
有测试 → 信心满满 + 快速验证 + 放心重构
```

**需要补充的测试：**

| 测试文件 | 测试内容 | 优先级 |
|----------|----------|--------|
| `Repl.test.ts` | REPL 循环、命令处理、会话恢复 | 🔴 高 |
| `QueryEngine.test.ts` | 工具调用循环、错误处理 | 🔴 高 |
| `AnthropicClient.test.ts` | API 调用、流式输出 | 🔴 高 |
| `tool-registry.test.ts` | 工具注册、获取 | 🟡 中 |
| `BashTool.test.ts` | 命令执行、权限验证 | 🟡 中 |
| `GLMClient.test.ts` | 国内 API 测试 | 🟡 中 |
| `context-manager.test.ts` | Token 计算、截断 | 🟡 中 |

**实现方案：**

1. **创建 Mock AI 客户端**
   ```typescript
   // src/__tests__/mocks/MockAIProvider.ts
   export class MockAIProvider implements AIProvider {
     name = 'Mock';
     private responses: Partial<Response>[] = [];

     addResponse(response: Partial<Response>) { ... }
     async sendMessage(): Promise<Response> { ... }
   }
   ```

2. **编写 Repl 测试**
   ```typescript
   // src/__tests__/unit/Repl.test.ts
   describe('Repl', () => {
     it('should handle user input', async () => { ... });
     it('should process commands', async () => { ... });
     it('should restore session', async () => { ... });
   });
   ```

3. **编写 QueryEngine 测试**
   ```typescript
   // src/__tests__/unit/QueryEngine.test.ts
   describe('QueryEngine', () => {
     it('should execute tool calls', async () => { ... });
     it('should stop at max rounds', async () => { ... });
     it('should handle empty responses', async () => { ... });
   });
   ```

---

### 第二阶段：安全加固 (1-2天)

**目标：** 防止命令注入、保护敏感信息

**当前风险：**
- BashTool 可能存在命令注入
- 用户输入未充分验证
- 敏感信息可能泄露

**需要实现：**

| 安全功能 | 文件位置 | 说明 |
|----------|----------|------|
| 输入验证器 | `src/utils/security.ts` | 路径遍历检测、特殊字符过滤 |
| 命令清理器 | `BashTool` | 危险命令拦截 |
| 敏感信息扫描 | `security.ts` | API Key、Token 自动脱敏 |
| 输出过滤器 | `terminal.ts` | 敏感信息屏蔽 |

**实现方案：**

```typescript
// src/utils/security.ts

/** 危险命令黑名单 */
const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'format',
  'del /f /s /q',
  ':(){ :|:& };:',  // Fork bomb
];

/** 路径遍历检测 */
export function isPathTraversal(input: string): boolean {
  return input.includes('../') || input.includes('..\\');
}

/** 命令注入检测 */
export function isCommandInjection(input: string): boolean {
  const patterns = [/\|\s*\w+/, /;\s*\w+/, /&&\s*\w+/, /\$\(/, /`/];
  return patterns.some(p => p.test(input));
}

/** 敏感信息扫描 */
export function maskSecrets(text: string): string {
  const patterns = [
    /([a-zA-Z0-9_-]{20,})/g,  // API Keys
    /sk-[a-zA-Z0-9]{20,}/g,   // OpenAI keys
    /ghp_[a-zA-Z0-9]{36}/g,   // GitHub tokens
  ];
  return patterns.reduce((t, p) => t.replace(p, '[REDACTED]'), text);
}
```

---

### 第三阶段：常用工具补充 (1-2天)

**缺失的常用工具：**

| 工具 | 功能 | 实现难度 |
|------|------|----------|
| GrepTool | 文件内容搜索 | 🟡 中 |
| ReadLineTool | 逐行读取文件 | 🟢 低 |
| MkdirTool | 创建目录 | 🟢 低 |
| RmTool | 删除文件/目录 | 🟢 低 |
| CopyTool | 复制文件 | 🟢 低 |
| MoveTool | 移动文件 | 🟢 低 |

**GrepTool 实现示例：**
```typescript
// src/tools/GrepTool.ts
export const GrepTool: Tool = {
  name: 'GrepTool',
  description: 'Search for patterns in files',

  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Search pattern (regex)' },
      path: { type: 'string', description: 'Directory to search' },
      recursive: { type: 'boolean', default: true },
      caseSensitive: { type: 'boolean', default: false },
    },
    required: ['pattern', 'path'],
  },

  execute: async (input) => {
    // 实现 grep 逻辑
  },
};
```

---

### 第四阶段：MCP 支持 (2-3天)

**MCP (Model Context Protocol)** 是 Claude Code 连接外部工具的标准协议。

**架构设计：**
```
┌─────────────────────────────────────────────────────┐
│                    My Agent                         │
├─────────────────────────────────────────────────────┤
│  MCP Client                                        │
│  ├── FileSystemResourceProvider                    │
│  ├── GitHubResourceProvider                         │
│  ├── PostgreSQLResourceProvider                    │
│  └── CustomResourceProvider                        │
└─────────────────────────────────────────────────────┘
```

**实现步骤：**
1. 定义 MCP 协议接口
2. 实现 MCP 客户端
3. 添加 FileSystem 资源提供者
4. 添加 GitHub 资源提供者

---

### 第五阶段：Webhook/回调机制 (2-3天)

**使用场景：**
```typescript
const agent = new MyAgent({
  hooks: {
    onToolExecute: (tool, input, output) => {
      // 通知外部系统
      fetch('https://webhook.example.com', {
        method: 'POST',
        body: JSON.stringify({ tool, input, output })
      });
    },
    onError: (error) => { /* 上报错误 */ },
    onTokenUsage: (tokens) => { /* 统计用量 */ }
  }
});
```

---

### 第六阶段：Agent 模式 (3-5天)

**目标：** 支持自主决策执行，无需用户逐轮确认

**实现方案：**
```typescript
// src/core/AgentRunner.ts
export interface AgentConfig {
  task: string;
  maxIterations: number;
  autoApprove: boolean;
  onProgress?: (state: AgentState) => void;
}

export class AgentRunner {
  async run(config: AgentConfig): Promise<AgentResult> {
    // 1. 解析任务
    // 2. 执行 QueryEngine 循环
    // 3. 自动批准工具执行
    // 4. 跟踪进度
    // 5. 返回结果
  }
}
```

---

### 第七阶段：插件系统 (3-5天)

**目标：** 支持外部扩展机制

**接口设计：**
```typescript
interface Plugin {
  name: string;
  version: string;
  tools?: Tool[];
  hooks?: Record<string, Function>;
  middleware?: Middleware[];
}

interface PluginManager {
  load(plugin: Plugin): void;
  unload(name: string): void;
  getTools(): Tool[];
}
```

---

## 三、推荐实施路径

### 路径 A：快速产出优先 (推荐)

```
Week 1: 第一阶段（测试框架）+ 第二阶段（安全加固）
Week 2: 第三阶段（常用工具）+ 第四阶段（MCP 支持）
Week 3: 第五阶段（Webhook）+ 第六阶段（Agent 模式）
Week 4: 第七阶段（插件系统）+ 完善
```

### 路径 B：稳定优先

```
Week 1-2: 第一阶段（测试框架）+ 完善现有测试
Week 3-4: 第二阶段（安全加固）+ 安全审计
Week 5-6: 第三阶段（常用工具）
Week 7-8: 第四阶段 + 第五阶段
Week 9-10: 第六阶段 + 第七阶段
```

---

## 四、快速启动指南

### 下一步行动

请回复以下指令之一开始实施：

| 指令 | 行动 |
|------|------|
| `继续测试` | 开始第一阶段：测试框架完善 |
| `继续安全` | 开始第二阶段：安全加固 |
| `继续工具` | 开始第三阶段：常用工具补充 |
| `查看详情` | 获取某个阶段的详细实现方案 |
| `跳过` | 直接进入特定阶段 |

---

## 五、项目文件结构

```
my_agent/
├── src/
│   ├── entrypoints/
│   │   └── cli.ts              # CLI 入口点
│   ├── core/
│   │   ├── Repl.ts             # REPL 核心
│   │   ├── QueryEngine.ts      # 查询引擎
│   │   └── commands.ts        # CLI 命令
│   ├── services/
│   │   ├── api/                # AI 提供商
│   │   │   ├── types.ts        # 接口定义
│   │   │   ├── provider-factory.ts
│   │   │   ├── AnthropicClient.ts
│   │   │   ├── GLMClient.ts
│   │   │   ├── GeminiClient.ts
│   │   │   └── OpenAICompatClient.ts
│   │   ├── permissions.ts      # 权限系统
│   │   ├── session.ts          # 会话管理
│   │   ├── context-manager.ts # 上下文管理
│   │   ├── tool-chain.ts       # 工具链
│   │   └── events/             # 事件系统
│   ├── tools/                  # 工具集 (15+)
│   │   ├── registry.ts         # 工具注册表
│   │   ├── BashTool.ts
│   │   ├── FileReadTool.ts
│   │   ├── FileWriteTool.ts
│   │   ├── GlobTool.ts
│   │   ├── GrepTool.ts         # 待实现
│   │   └── GitHub*.ts
│   ├── config/                 # 配置系统
│   ├── state/                  # 状态管理
│   ├── ui/                     # 终端 UI
│   ├── utils/
│   │   ├── errors.ts           # 错误处理
│   │   ├── retry.ts            # 重试 + 熔断器
│   │   ├── performance.ts      # 性能优化
│   │   └── security.ts         # 安全工具
│   └── __tests__/              # 测试
├── docs/                       # 文档
├── config/
│   └── permissions.json        # 权限配置
├── package.json
├── tsconfig.json
└── vitest.config.ts
```
