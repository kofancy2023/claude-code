# My Agent 开发计划 - 对照 Claude Code

> 本文档对照 Claude Code 的核心功能，评估当前实现状态，并制定后续开发计划。

---

## 一、Claude Code 核心功能评估

### 1.1 已完成功能 ✅

| 功能模块 | 状态 | 说明 |
|----------|------|------|
| **REPL 交互** | ✅ 完成 | 命令行交互、消息处理 |
| **流式输出** | ✅ 完成 | 实时显示 AI 响应 |
| **多轮工具调用** | ✅ 完成 | QueryEngine 管理循环 |
| **工具注册表** | ✅ 完成 | 15+ 内置工具 |
| **权限系统** | ✅ 完成 | allow/deny/bypass 模式 |
| **会话管理** | ✅ 完成 | 保存/加载会话 |
| **CLI 命令** | ✅ 完成 | /help, /clear, /model 等 |
| **多 AI 提供商** | ✅ 完成 | Anthropic, OpenAI, GLM, Gemini 等 |
| **重试机制** | ✅ 完成 | 指数退避 + 抖动 |
| **熔断器** | ✅ 完成 | 故障保护 |
| **速率限制** | ✅ 完成 | 令牌桶算法 |
| **配置系统** | ✅ 完成 | 环境变量/配置文件/默认值 |
| **错误处理** | ✅ 完成 | 统一错误类 + 上报机制 |
| **上下文管理** | ✅ 完成 | 消息历史 + Token 统计 |
| **性能优化** | ✅ 完成 | LRU缓存、并发控制、去重 |

### 1.2 缺失功能 ❌

| 功能模块 | 优先级 | 说明 |
|----------|--------|------|
| **测试框架** | P1 | Jest/Bun test 集成 |
| **安全加固** | P1 | 输入验证、输出过滤、命令注入防护 |
| **Webhook/回调** | P2 | 事件通知机制 |
| **Agent 模式** | P2 | 自主决策执行 |
| **文件系统监视** | P2 | 文件变化自动触发 |
| **编辑器集成** | P3 | VSCode/IDE 插件 |
| **分布式支持** | P3 | 多实例协调 |
| **插件系统** | P3 | 外部扩展机制 |

---

## 二、当前项目结构

```
my_agent/
├── src/
│   ├── entrypoints/
│   │   └── cli.ts              # CLI 入口
│   ├── core/
│   │   ├── Repl.ts             # REPL 核心
│   │   ├── QueryEngine.ts      # 多轮对话引擎
│   │   └── commands.ts         # CLI 命令系统
│   ├── services/
│   │   ├── api/                # AI 提供商
│   │   ├── permissions.ts      # 权限系统
│   │   ├── session.ts          # 会话管理
│   │   ├── context-manager.ts  # 上下文管理
│   │   └── tool-chain.ts       # 工具链
│   ├── tools/                  # 工具集 (15+)
│   ├── config/                  # 配置系统
│   ├── state/                   # 状态管理
│   ├── ui/                      # 终端 UI
│   └── utils/
│       ├── errors.ts            # 错误处理
│       ├── retry.ts             # 重试 + 熔断器
│       └── performance.ts       # 性能优化
├── docs/                        # 教程文档
├── faq/                         # FAQ 文档
└── config/                      # 配置文件
```

---

## 三、后续开发计划

### Step 11: 测试框架 (预计 1-2 天)

**目标：** 建立可靠的测试体系

```
src/
├── __tests__/
│   ├── unit/
│   │   ├── Repl.test.ts
│   │   ├── QueryEngine.test.ts
│   │   ├── Config.test.ts
│   │   ├── tools/
│   │   │   └── BashTool.test.ts
│   │   └── utils/
│   │       ├── retry.test.ts
│   │       └── performance.test.ts
│   └── integration/
│       └── cli.test.ts
├── vitest.config.ts             # Vitest 配置
└── bun.lockb
```

**关键实现：**
- Vitest 测试框架
- Mock AI 客户端
- 工具隔离测试
- 集成测试

**验收标准：**
- 核心模块测试覆盖率 > 80%
- 所有工具函数有单元测试

---

### Step 12: 安全加固 (预计 1-2 天)

**目标：** 防止命令注入、保护敏感信息

```
src/utils/
├── security.ts              # 新增：安全工具
│   ├── InputValidator      # 输入验证
│   ├── OutputSanitizer      # 输出过滤
│   ├── CommandSanitizer     # 命令清理
│   └── SecretScanner        # 敏感信息扫描
```

**关键实现：**
- **输入验证：** 路径遍历检测 (`../`)、特殊字符过滤
- **命令清理：** BashTool 执行前清理危险命令
- **输出过滤：** 敏感信息（API Key、Token）自动脱敏
- **Secret Scanner：** 扫描可能泄露的密钥

**验收标准：**
- 所有用户输入经过验证
- API Key 不会出现在日志/输出中

---

### Step 13: Webhook/回调机制 (预计 2-3 天)

**目标：** 支持外部系统集成

```typescript
// 使用示例
const client = new MyAgent({
  onToolExecute: (tool, input, output) => {
    // 通知外部系统
    fetch('https://webhook.example.com', {
      method: 'POST',
      body: JSON.stringify({ tool, input, output, timestamp: Date.now() })
    });
  },
  onError: (error) => { /* 上报错误 */ },
  onTokenUsage: (tokens) => { /* 统计用量 */ }
});
```

**关键实现：**
- 事件发射器 (EventEmitter)
- 回调钩子注册
- 异步回调处理

---

### Step 14: Agent 模式 (预计 3-5 天)

**目标：** 支持自主决策执行

```typescript
// Agent 模式：自动执行直到完成
await agent.run({
  task: '修复所有 ESLint 错误',
  maxIterations: 10,
  autoApprove: true  // 自动批准工具执行
});
```

**关键实现：**
- 自主决策循环
- 任务分解
- 进度跟踪
- 自动重试

---

### Step 15: 文件系统监视 (预计 1-2 天)

**目标：** 响应文件变化

```typescript
// 监视文件变化
watcher.watch('./src/**/*.ts', async (event) => {
  if (event.type === 'modified') {
    await agent.analyze(event.files);
  }
});
```

---

### Step 16: 插件系统 (预计 3-5 天)

**目标：** 外部扩展机制

```typescript
// 加载插件
agent.use(require('./plugins/eslint'));
agent.use(require('./plugins/prettier'));

// 插件接口
interface Plugin {
  name: string;
  tools?: Tool[];           // 添加新工具
  hooks?: Record<string, Function>; // 钩子函数
  middleware?: Middleware[]; // 中间件
}
```

---

### Step 17: 分布式支持 (预计 5-7 天)

**目标：** 多实例协调

- Redis 会话共享
- 负载均衡
- 分布式熔断器

---

## 四、推荐实施路径

### 路径 A：快速产出优先 (推荐)

```
Week 1: Step 11 (测试框架) + Step 12 (安全加固)
Week 2: Step 13 (Webhook)
Week 3: Step 14 (Agent 模式)
Week 4: Step 15 (文件系统监视) + Step 16 (插件系统)
```

### 路径 B：稳定优先

```
Week 1-2: Step 11 (测试框架)
Week 3-4: Step 12 (安全加固)
Week 5-6: 完善现有功能 + Bug 修复
Week 7-8: Step 13 + Step 14
```

---

## 五、下一步行动

**立即执行：Step 11 - 测试框架**

请回复 **"继续"** 开始实现测试框架。

或回复 **"跳过"** 直接进入 Step 12 (安全加固)。

或回复 **"详细"** 获取 Step 11 的详细实现方案。
