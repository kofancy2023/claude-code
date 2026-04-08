# 05 工具系统架构分析

## 工具系统概述

Claude Code 的工具系统是一个**可扩展的插件架构**，允许执行各种操作：

```
用户请求
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Tool 调用 (query.ts)                                        │
│  - 解析 tool_use 块                                          │
│  - 查找工具定义                                               │
│  - 检查权限                                                   │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Tool 执行 (各工具实现)                                       │
│  - 验证输入                                                  │
│  - 执行操作                                                  │
│  - 返回结果                                                  │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  结果渲染 (UI 组件)                                          │
│  - 格式化输出                                                │
│  - 显示进度                                                  │
│  - 错误处理                                                  │
└─────────────────────────────────────────────────────────────┘
```

## 工具架构

### 核心接口 (Tool.ts)

```typescript
// 工具定义接口
export interface Tool {
    name: string;                              // 工具名称
    description: string;                       // 工具描述
    inputSchema: ToolInputJSONSchema;          // 输入 JSON Schema
    call: (input: unknown, context: ToolUseContext) => Promise<ToolResult>;
    validate: (input: unknown) => ValidationResult;
    render?: React.ComponentType<ToolProps>;   // 可选的 UI 渲染
}

// 工具使用上下文
export interface ToolUseContext {
    cwd: string;
    env: Record<string, string>;
    sessionId: string;
    canUseTool: CanUseToolFn;
    // ...
}
```

### 工具注册 (tools.ts)

```typescript
// 核心工具 (始终加载)
const coreTools = [
    AgentTool,        // 子代理派生
    SkillTool,        // Skill 调用
    BashTool,         // Shell 执行
    FileEditTool,     // 文件编辑
    FileReadTool,     // 文件读取
    FileWriteTool,    // 文件写入
    GlobTool,         // 文件匹配
    NotebookEditTool, // Notebook 编辑
    WebFetchTool,     // URL 抓取
    WebSearchTool,    // 网页搜索
    GrepTool,         // 代码搜索
    TodoWriteTool,    // Todo 列表
    // ...
];

// 条件加载的工具 (基于 feature flag)
const conditionalTools = [
    // AGENT_TRIGGERS: CronCreateTool, CronDeleteTool, CronListTool
    // KAIROS: SleepTool, SendUserFileTool
    // COORDINATOR_MODE: 协调器工具
    // HISTORY_SNIP: SnipTool
    // ...
];
```

### 工具目录结构

```
src/tools/
├── BashTool/              # Shell 执行
│   ├── BashTool.tsx       # 核心实现
│   ├── UI.tsx             # 结果渲染
│   ├── prompt.ts          # 提示词
│   ├── utils.ts           # 工具函数
│   ├── bashPermissions.ts # 权限检查
│   ├── pathValidation.ts  # 路径验证
│   └── sandbox/           # 沙箱支持
├── FileReadTool/          # 文件读取
│   ├── FileReadTool.ts    # 核心实现
│   ├── UI.tsx             # 结果渲染
│   ├── imageProcessor.ts  # 图片处理
│   └── limits.ts          # 限制
├── FileEditTool/          # 文件编辑
│   ├── FileEditTool.ts    # 核心实现
│   ├── UI.tsx             # 结果渲染
│   └── utils.ts           # diff 算法
├── FileWriteTool/         # 文件写入
├── GlobTool/              # 文件匹配
├── GrepTool/              # 代码搜索
├── AgentTool/             # 子代理
├── WebFetchTool/          # URL 抓取
├── WebSearchTool/         # 网页搜索
├── MCPTool/               # MCP 协议
├── LSPTool/               # 语言服务器
├── SkillTool/             # Skill 系统
├── TodoWriteTool/         # Todo 列表
└── ...                   # 更多工具
```

## BashTool 详细分析

### 功能

- **Shell 命令执行**: 执行任意 shell 命令
- **沙箱支持**: 可选的隔离执行环境
- **权限检查**: 命令级别的权限验证
- **路径验证**: 确保操作在允许范围内
- **进度显示**: 长时间运行的命令显示进度

### 安全机制

```typescript
// 1. 危险命令检测
const DANGEROUS_COMMANDS = new Set([
    'rm -rf /',
    'dd if=',
    ':(){:|:&};:',  // Fork bomb
    '> /dev/sda',
    // ...
]);

// 2. 路径验证
function validatePath(path: string): boolean {
    // 确保不超出项目目录
    const resolved = resolve(path);
    return isWithinAllowedDir(resolved);
}

// 3. 权限规则
interface PermissionRule {
    pattern: RegExp;      // 命令模式
    allow: boolean;       // 允许/拒绝
    requiresApproval: boolean;  // 需要确认
}
```

### 执行流程

```typescript
async function executeBash(command: string, context: ToolUseContext) {
    // 1. 解析命令
    const parsed = parseCommand(command);

    // 2. 安全检查
    if (isDangerous(command)) {
        return { error: 'Dangerous command blocked' };
    }

    // 3. 路径验证
    if (!validatePaths(parsed.paths)) {
        return { error: 'Path outside allowed directory' };
    }

    // 4. 权限检查
    const permission = await checkPermission(parsed);
    if (!permission.granted) {
        return { error: `Permission denied: ${permission.reason}` };
    }

    // 5. 执行
    if (shouldUseSandbox(command)) {
        return executeInSandbox(command, context);
    } else {
        return executeDirect(command, context);
    }
}
```

## FileEditTool 详细分析

### 功能

- **字符串替换编辑**: 基于字符串匹配的内容替换
- **Diff 追踪**: 记录每次编辑的变更
- **多文件编辑**: 支持同时编辑多个文件

### 编辑算法

```typescript
// 编辑流程
async function editFile(params: EditParams) {
    const { path, oldString, newString } = params;

    // 1. 读取原文件
    const content = await readFile(path);

    // 2. 查找替换位置
    const index = content.indexOf(oldString);
    if (index === -1) {
        throw new Error(`String not found: ${oldString}`);
    }

    // 3. 执行替换
    const newContent = content.substring(0, index) +
                       newString +
                       content.substring(index + oldString.length);

    // 4. 写入文件
    await writeFile(path, newContent);

    // 5. 记录 diff
    recordDiff(path, oldString, newString);
}
```

## AgentTool 详细分析

### 功能

- **子代理派生**: 创建新的 Claude Agent 会话
- **异步执行**: 后台任务支持
- **远程执行**: 支持远程机器上执行
- **颜色管理**: 多代理时的颜色分配

### 执行模式

```typescript
type AgentExecutionMode =
    | 'fork'      // 派生新会话
    | 'async'     // 异步执行
    | 'background' // 后台运行
    | 'remote';   // 远程执行

interface AgentConfig {
    prompt: string;
    model?: string;
    tools?: string[];
    executionMode: AgentExecutionMode;
}
```

## MCPTool 详细分析

Model Context Protocol (MCP) 工具允许调用外部 MCP 服务器：

```typescript
// MCP 工具定义
interface MCPTool {
    name: string;
    description: string;
    server: MCPServerConnection;
    toolDefinition: {
        name: string;
        description: string;
        inputSchema: object;
    };
}

// 调用流程
async function callMCPTool(tool: MCPTool, input: unknown) {
    // 1. 获取 MCP 客户端
    const client = getMCPClient(tool.server);

    // 2. 调用工具
    const result = await client.callTool({
        name: tool.toolDefinition.name,
        arguments: input,
    });

    // 3. 格式化结果
    return formatMCPResult(result);
}
```

## 工具执行编排 (services/tools/)

### 工具编排器

```typescript
// toolOrchestration.ts
export async function runTools(
    tools: ToolUse[],
    context: ToolUseContext
): Promise<ToolResult[]> {
    // 1. 分析依赖
    const executionPlan = analyzeDependencies(tools);

    // 2. 分组执行
    const groups = groupByParallel(executionPlan);

    for (const group of groups) {
        // 3. 并行执行独立工具
        const results = await Promise.all(
            group.map(tool => executeTool(tool, context))
        );

        // 4. 收集结果
        for (const result of results) {
            yield result;
        }
    }
}
```

### 流式工具执行

```typescript
// StreamingToolExecutor.ts
export class StreamingToolExecutor {
    async *execute(
        tool: ToolUse,
        context: ToolUseContext
    ): AsyncGenerator<ToolProgress> {
        // 发送开始事件
        yield { type: 'start', tool: tool.name };

        // 执行并发送进度
        const result = await tool.execute(context, (progress) => {
            yield { type: 'progress', progress };
        });

        // 发送完成事件
        yield { type: 'complete', result };
    }
}
```

## 权限系统集成

### 权限检查点

```typescript
// 工具调用前的权限检查
async function checkToolPermission(
    toolName: string,
    input: unknown,
    context: ToolUseContext
): Promise<PermissionResult> {
    // 1. 获取工具的权限规则
    const rules = getPermissionRules(toolName);

    // 2. 检查规则匹配
    for (const rule of rules) {
        if (rule.matches(input)) {
            return rule.result;
        }
    }

    // 3. 返回默认结果
    return { granted: true };
}
```

### 权限模式

```typescript
type PermissionMode =
    | 'auto'    // 自动允许安全操作
    | 'manual'  // 全部需要确认
    | 'plan'    // 计划模式下确认
    | 'yolo';   // 全部允许 (危险)
```

## 关键文件

| 文件 | 工具 | 核心职责 |
|------|------|----------|
| [Tool.ts](file:///d:/mySource/cusor-proj/claude-code/src/Tool.ts) | - | 核心接口定义 |
| [tools.ts](file:///d:/mySource/cusor-proj/claude-code/src/tools.ts) | - | 工具注册表 |
| [BashTool/BashTool.tsx](file:///d:/mySource/cusor-proj/claude-code/src/tools/BashTool/BashTool.tsx) | BashTool | Shell 执行 |
| [FileEditTool/FileEditTool.ts](file:///d:/mySource/cusor-proj/claude-code/src/tools/FileEditTool/FileEditTool.ts) | FileEditTool | 文件编辑 |
| [AgentTool/AgentTool.ts](file:///d:/mySource/cusor-proj/claude-code/src/tools/AgentTool/AgentTool.ts) | AgentTool | 子代理 |
| [MCPTool/MCPTool.ts](file:///d:/mySource/cusor-proj/claude-code/src/tools/MCPTool/MCPTool.ts) | MCPTool | MCP 协议 |

## 改造优化建议

### 高优先级

1. **添加工具缓存**
   ```typescript
   // 缓存频繁访问的工具
   const toolCache = new LRUCache<string, Tool>({ max: 50 });
   ```

2. **实现工具别名**
   ```typescript
   // 支持工具别名
   const toolAliases = {
       'rm': 'BashTool',
       'cat': 'FileReadTool',
       'edit': 'FileEditTool',
   };
   ```

### 中优先级

1. **并行工具执行**
   ```typescript
   // 对于独立的工具调用并行执行
   const independentTools = tools.filter(t => !hasDependencies(t));
   const results = await Promise.all(
       independentTools.map(t => executeTool(t, context))
   );
   ```

2. **工具性能监控**
   ```typescript
   // 记录工具执行时间
   const start = performance.now();
   const result = await tool.call(input, context);
   logToolMetrics(tool.name, performance.now() - start);
   ```

### 低优先级

1. **自定义工具支持**
   - 允许用户添加自己的工具
   - 工具市场/插件系统

2. **工具组合宏**
   - 定义常用工具组合
   - 简化重复操作

## 下一步

- [UI 层（Ink）渲染系统分析](./06_ink_ui_analysis.md)
- [状态管理和上下文构建分析](./07_state_context_analysis.md)
