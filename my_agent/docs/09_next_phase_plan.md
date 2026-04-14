# My Agent 下一阶段详细实施计划

> 最后更新: 2026-04-14

---

## 一、项目现状总结

### 已完成功能 ✅ (共 26 个模块)

| 模块 | 状态 | 核心文件 | 工具/提供商数 |
|------|------|----------|---------------|
| REPL 循环 | ✅ | `src/core/Repl.ts` | - |
| 工具注册表 | ✅ | `src/tools/registry.ts` | 24 个工具 |
| AI 提供商 | ✅ | `src/services/api/` | 10 家 |
| 权限系统 | ✅ | `src/services/permissions.ts` | - |
| 会话管理 | ✅ | `src/services/session.ts` | - |
| 上下文管理 | ✅ | `src/services/context-manager.ts` | - |
| 工具链执行器 | ✅ | `src/services/tool-chain.ts` | - |
| 配置系统 | ✅ | `src/config/`, `src/services/config/` | - |
| 错误处理 | ✅ | `src/utils/errors.ts` | - |
| 重试机制 | ✅ | `src/utils/retry.ts` | - |
| 性能优化 | ✅ | `src/utils/performance.ts` | - |
| 安全模块 | ✅ | `src/utils/security.ts` | - |
| MCP 支持 | ✅ | `src/mcp/` | - |
| Webhook/事件 | ✅ | `src/events/` | - |
| 插件系统 | ✅ | `src/plugins/` | - |
| Agent 自主模式 | ✅ | `src/agent/` | - |
| 流式输出 | ✅ | `src/services/api/types.ts` | - |
| 智能工具参数解析 | ✅ | `src/tools/registry.ts` | - |
| Readline 交互增强 | ✅ | `src/core/readline-enhancer.ts` | - |
| 上下文管理增强 | ✅ | `src/services/context-manager.ts` | - |
| 交互式编辑确认 + Diff | ✅ | `src/core/QueryEngine.ts`, `src/services/diff.ts` | - |
| Git 智能操作 | ✅ | `src/tools/GitTools.ts` | 6 个工具 |
| 单元测试 | ✅ | `src/__tests__/` | 216 个 |
| UI 终端 | ✅ | `src/ui/terminal.ts` | - |
| CLI 参数解析 | ✅ | `src/entrypoints/args.ts` | - |
| 配置热加载 | ✅ | `src/services/config/` | - |

### MVP 核心功能完成度: 98%

---

## 二、缺失功能清单 (对照 Claude Code)

### P0 - 必须实现 (MVP 完整度)

| 功能 | 当前状态 | 优先级 | 工作量 |
|------|----------|--------|--------|
| **流式输出 (Streaming)** | ⚠️ 接口已定义 | P0 | 中 |
| **更智能的 EditTool** | ⚠️ 简单替换 | P0 | 中 |

### P1 - 重要功能 (生产可用性)

| 功能 | 当前状态 | 优先级 | 工作量 |
|------|----------|--------|--------|
| **后台任务管理** | ❌ 无 | P1 | 大 |
| **会话历史搜索** | ⚠️ 基础 | P1 | 中 |
| **多会话管理** | ⚠️ 单会话 | P1 | 中 |
| **BashTool 增强** | ⚠️ 基础 | P1 | 中 |

### P2 - 增强功能 (完整生态)

| 功能 | 当前状态 | 优先级 | 工作量 |
|------|----------|--------|--------|
| **向量存储/记忆系统** | ❌ 无 | P2 | 大 |
| **编辑器 LSP 集成** | ❌ 无 | P2 | 大 |
| **VS Code 扩展** | ❌ 无 | P2 | 很大 |
| **网络搜索增强** | ⚠️ 基础 | P2 | 小 |

### P3 - 高级功能 (差异化竞争力)

| 功能 | 当前状态 | 优先级 | 工作量 |
|------|----------|--------|--------|
| **分布式/多 Agent 协作** | ❌ 无 | P3 | 很大 |
| **CLI 高度可配置** | ⚠️ 基础 | P3 | 中 |

---

## 三、下一阶段详细计划

### 阶段 1: 流式输出实现 (1-2天)

**目标**: 让 AI 输出像 Claude Code 一样实时流式显示

#### 1.1 问题分析

当前状态：流式输出接口已定义在 `src/services/api/types.ts`，但未实际启用。

#### 1.2 实现方案

```
步骤 1: 在 AIProvider 接口添加 sendMessageStream 方法
步骤 2: 在 GLMClient 实现 SSE 流式调用
步骤 3: 在 Repl 中集成流式输出
步骤 4: 在 terminal.ts 添加流式渲染方法
```

#### 1.3 关键文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/services/api/types.ts` | 修改 | 完善流式接口定义 |
| `src/services/api/GLMClient.ts` | 修改 | 实现 SSE 流式 |
| `src/services/api/OpenAICompatClient.ts` | 修改 | 实现 SSE 流式 |
| `src/services/api/AnthropicClient.ts` | 修改 | 实现 SSE 流式 |
| `src/core/Repl.ts` | 修改 | 流式输出处理 |
| `src/ui/terminal.ts` | 修改 | 流式渲染方法 |

#### 1.4 预期效果

```typescript
// 用户体验
// 传统方式：等待完整响应后一次性显示
// 流式方式：逐字/逐句实时显示，像打字机效果

// 示例输出
AI: 我正在分析这个问题...
AI: 首先，我需要查看项目的结构...
AI: 让我检查一下 src 目录...
```

---

### 阶段 2: 智能 EditTool 增强 (1天)

**目标**: 实现更智能的代码编辑，支持多位置编辑、撤销、回滚

#### 2.1 当前问题

- 只支持简单的字符串替换
- 不支持多位置同时编辑
- 没有撤销/回滚机制

#### 2.2 实现方案

```
步骤 1: 添加 EditOperationHistory 类跟踪编辑历史
步骤 2: 支持 multiEdit 模式（一次修改多个位置）
步骤 3: 添加 undo/redo 功能
步骤 4: 增强 oldStr 匹配算法（支持模糊匹配）
```

#### 2.3 关键文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/tools/EditTool.ts` | 重写 | 增强编辑功能 |
| `src/services/edits.ts` | 新增 | 编辑历史管理 |

#### 2.4 预期 API

```typescript
// 单位置编辑
EditTool.execute({
  path: "src/utils/helper.ts",
  oldStr: "function old()",
  newStr: "function new()"
})

// 多位置编辑
EditTool.execute({
  path: "src/utils/helper.ts",
  edits: [
    { oldStr: "old1", newStr: "new1" },
    { oldStr: "old2", newStr: "new2" }
  ]
})

// 撤销
EditTool.execute({
  action: "undo",
  path: "src/utils/helper.ts"
})
```

---

### 阶段 3: 后台任务管理 (2天)

**目标**: 支持长时间运行的任务在后台执行，不阻塞 REPL

#### 3.1 问题分析

- 当前所有工具都是同步执行
- 长时间任务（如大型重构、搜索）会阻塞 REPL
- 用户无法在任务运行时做其他操作

#### 3.2 实现方案

```
步骤 1: 创建 BackgroundTaskManager 类
步骤 2: 支持任务队列和优先级
步骤 3: 在 Repl 中集成任务状态显示
步骤 4: 支持任务取消和进度报告
```

#### 3.3 关键文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/services/task-manager.ts` | 新增 | 后台任务管理 |
| `src/core/Repl.ts` | 修改 | 集成任务管理 |
| `src/ui/terminal.ts` | 修改 | 任务状态显示 |

#### 3.4 预期效果

```typescript
// 用户体验
User: 重构整个项目
Agent: 开始后台重构任务...
       任务 ID: task_123
       状态: 运行中 (45%)

User: 做其他事情...
Agent: 好的，我在这里等你完成

// 查看任务状态
User: /tasks
Agent: 后台任务:
       - task_123: 重构项目 (45%)
       - task_124: 搜索文件 (等待中)
```

---

### 阶段 4: 多会话管理 (1天)

**目标**: 支持同时管理多个会话，可在会话间切换

#### 4.1 实现方案

```
步骤 1: 增强 SessionManager 支持多会话
步骤 2: 添加会话切换命令 /session
步骤 3: 支持会话命名和标签
步骤 4: 会话历史持久化
```

#### 4.2 关键文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/services/session.ts` | 修改 | 多会话支持 |
| `src/core/commands.ts` | 修改 | 添加 session 命令 |

#### 4.3 预期命令

```bash
/session list          # 列出所有会话
/session switch <id>   # 切换会话
/session new <name>    # 创建新会话
/session delete <id>   # 删除会话
/session export <id>   # 导出会话
```

---

### 阶段 5: BashTool 增强 (1天)

**目标**: 更安全的命令执行，支持超时、输出限制、沙箱

#### 5.1 当前问题

- 没有执行超时
- 没有输出长度限制
- 命令注入风险

#### 5.2 实现方案

```
步骤 1: 添加命令超时机制
步骤 2: 添加输出截断机制
步骤 3: 增强危险命令检测
步骤 4: 支持后台执行模式
```

#### 5.3 关键文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/tools/BashTool.ts` | 重写 | 增强功能 |
| `src/utils/security.ts` | 修改 | 增强检测 |

---

### 阶段 6: 向量记忆系统 (3天) - P2

**目标**: 实现长期记忆，让 Agent 能记住跨会话的信息

#### 6.1 实现方案

```
步骤 1: 选择向量数据库（SQLite + embeddings）
步骤 2: 实现 TextEmbedding 服务
步骤 3: 创建 MemoryStore 类
步骤 4: 集成到上下文管理
```

#### 6.2 关键文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/services/memory/embedding.ts` | 新增 | 向量嵌入 |
| `src/services/memory/store.ts` | 新增 | 记忆存储 |
| `src/services/memory/retriever.ts` | 新增 | 记忆检索 |
| `src/services/context-manager.ts` | 修改 | 集成记忆 |

---

## 四、立即行动清单

### 今天可以开始 (P0)

1. **流式输出实现**
   - 修改 `GLMClient.ts` 实现 SSE
   - 修改 `Repl.ts` 启用流式

2. **EditTool 增强**
   - 添加编辑历史
   - 支持多位置编辑

### 明天开始 (P1)

3. **后台任务管理**
   - 创建任务管理器
   - 集成到 REPL

4. **多会话管理**
   - 增强会话管理
   - 添加命令

### 本周完成 (P2)

5. **BashTool 增强**
6. **向量记忆系统设计**

---

## 五、验收标准

每个阶段完成后必须满足：

1. ✅ 所有现有测试通过
2. ✅ 新功能有对应的单元测试
3. ✅ 更新相应的文档
4. ✅ 代码提交到 GitHub

---

## 六、资源评估

| 阶段 | 工作量 | 优先级 | 建议时间 |
|------|--------|--------|----------|
| 流式输出 | 中 | P0 | 1-2 天 |
| EditTool 增强 | 中 | P0 | 1 天 |
| 后台任务 | 大 | P1 | 2 天 |
| 多会话 | 中 | P1 | 1 天 |
| BashTool 增强 | 中 | P1 | 1 天 |
| 向量记忆 | 大 | P2 | 3 天 |

**总预计时间: 9-10 天**
