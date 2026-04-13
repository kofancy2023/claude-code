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
| **工具注册表** | `src/tools/registry.ts` | ✅ 完成 | 18 个内置工具 |
| **AI 提供商** | `src/services/api/` | ✅ 完成 | Anthropic, OpenAI, GLM, Gemini |
| **权限系统** | `src/services/permissions.ts` | ✅ 完成 | allow/deny/bypass 模式 |
| **会话管理** | `src/services/session.ts` | ✅ 完成 | 保存/加载会话 |
| **上下文管理** | `src/services/context-manager.ts` | ✅ 完成 | Token 窗口管理 |
| **工具链执行器** | `src/services/tool-chain.ts` | ✅ 完成 | 复杂任务编排 |
| **配置系统** | `src/config/index.ts` | ✅ 完成 | 环境变量/配置文件 |
| **错误处理** | `src/utils/errors.ts` | ✅ 完成 | 统一错误类 |
| **重试机制** | `src/utils/retry.ts` | ✅ 完成 | 指数退避 + 熔断器 |
| **性能优化** | `src/utils/performance.ts` | ✅ 完成 | LRU 缓存、并发控制 |
| **测试框架** | `vitest.config.ts` | ✅ 完成 | **157 个测试全部通过** |
| **安全模块** | `src/utils/security.ts` | ✅ 完成 | 输入验证、命令注入防护 |
| **MCP 支持** | `src/mcp/` | ✅ 完成 | FileSystem/GitHub Provider |
| **Webhook/事件** | `src/events/` | ✅ 完成 | 发布-订阅 + 外部回调 |
| **UI 终端** | `src/ui/terminal.ts` | ✅ 完成 | ANSI 颜色、进度条 |

### 1.2 缺失功能 ❌

| 功能 | 优先级 | 当前状态 |
|------|--------|----------|
| 插件系统 | P3 | 未实现 |
| Agent 自主模式 | P3 | 需验证 |
| 分布式支持 | P3 | 未实现 |

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

### 第三阶段：分布式支持 (5-7天)

**目标：** 支持多实例协同工作

**架构设计：**
```
┌─────────────────────────────────────────────────────┐
│                   分布式架构                         │
├─────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐           │
│  │ Agent 1 │  │ Agent 2 │  │ Agent 3 │           │
│  └────┬────┘  └────┬────┘  └────┬────┘           │
│       │            │            │                  │
│       └────────────┼────────────┘                  │
│                    ▼                                │
│            ┌────────────┐                          │
│            │   消息队列   │                         │
│            │  (Redis)   │                          │
│            └────────────┘                          │
└─────────────────────────────────────────────────────┘
```

**实现方案：**
- 消息队列集成
- 分布式锁
- 任务协调

---

## 三、推荐实施路径

### 路径 A：快速产出优先 (推荐)

```
Week 1-2: 第一阶段（插件系统）
Week 3-4: 第二阶段（Agent 自主模式）
Week 5-6: 完善 + 分布式支持
```

### 路径 B：稳定优先

```
Week 1-2: 第一阶段（插件系统）+ 单元测试
Week 3-4: 第二阶段（Agent 自主模式）+ 集成测试
Week 5-6: 第三阶段（分布式支持）
```

---

## 四、下一步行动

请选择下一步实施方向：

| 阶段 | 内容 | 预计时间 |
|------|------|----------|
| **第一阶段** | 插件系统 | 3-5天 |
| **第二阶段** | Agent 自主模式 | 3-5天 |
| **第三阶段** | 分布式支持 | 5-7天 |

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
