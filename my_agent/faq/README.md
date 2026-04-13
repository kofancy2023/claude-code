# My Agent CLI 文档中心

> 本目录包含 My Agent CLI 的完整技术文档，分为架构、指南和模块三类。

## 目录结构

```
faq/
├── README.md              # 本文档（索引）
├── architecture/          # 核心架构文档
├── guide/                # 使用指南
└── modules/              # 模块详细文档
```

## 核心架构 (architecture/)

| 文档 | 说明 |
|------|------|
| [1-tool-execute-principle.md](architecture/1-tool-execute-principle.md) | 工具执行原理：策略模式 + 注册表 |
| [8_event_system.md](architecture/8_event_system.md) | 事件系统：发布-订阅 + Webhook |

## 使用指南 (guide/)

| 文档 | 说明 |
|------|------|
| [2-integration-guide.md](guide/2-integration-guide.md) | 模块集成指南：权限、终端UI、错误处理 |
| [4-advanced-features.md](guide/4-advanced-features.md) | 高级功能：会话持久化、上下文管理、工具链 |
| [5_streaming.md](guide/5_streaming.md) | 流式输出实现详解 |
| [6_query_engine.md](guide/6_query_engine.md) | QueryEngine 完整工具执行循环 |

## 模块文档 (modules/)

| 文档 | 说明 |
|------|------|
| [security_module.md](modules/security_module.md) | 安全模块：输入验证、命令注入防护 |
| [mcp_module.md](modules/mcp_module.md) | MCP 协议：AI 与外部资源的连接标准 |
| [events_webhook_module.md](modules/events_webhook_module.md) | Webhook 模块：事件触发外部回调 |

## 快速导航

### 新手入门
1. [MVP 计划](../../docs/01_mvp_plan.md) - 项目概述和核心架构
2. [项目结构](../../docs/02_step1_project_structure.md) - TypeScript + Bun 项目搭建
3. [REPL 循环](../../docs/03_step2_repl_loop.md) - 命令行交互核心

### 进阶开发
4. [API 与工具调用](../../docs/04_step3_api_and_tools.md) - 工具调用 Agent 循环
5. [权限与错误处理](../../docs/05_step4_permissions_ui_errors.md) - 安全和控制
6. [下一阶段计划](../../docs/06_next_phase_plan.md) - 开发路线图

### 深入理解
- [工具执行原理](architecture/1-tool-execute-principle.md) - execute() 到底做了什么
- [事件系统](architecture/8_event_system.md) - 事件驱动架构
- [流式输出](guide/5_streaming.md) - SSE 实时响应
- [QueryEngine](guide/6_query_engine.md) - 多轮工具循环

---

最后更新: 2026-04-13
