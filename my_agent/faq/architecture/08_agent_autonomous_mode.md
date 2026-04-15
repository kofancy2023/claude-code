# Agent 自主模式

## 概述

Agent 自主模式是 `my_agent` 的高级功能，允许 AI 自主分解复杂任务为多个子任务，并自动按依赖关系顺序执行这些子任务，而无需用户逐个确认每个步骤。

## 工作原理

### 核心组件

```
┌─────────────────────────────────────────────────────────────────┐
│                         AutoExecutor                            │
│                      (自主执行主入口)                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │TaskDecomposer│  │ExecutionPlanner│  │AutoExecuteEngine│        │
│  │ (任务分解器)  │  │ (执行计划器)  │  │ (自主执行引擎) │            │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘            │
│         │                 │                 │                     │
│         └─────────────────┼─────────────────┘                     │
│                           ▼                                       │
│                  ┌──────────────────┐                             │
│                  │  ExecutionPlan    │                             │
│                  │    (执行计划)      │                             │
│                  └──────────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

### 任务流程

```
用户输入复杂任务
       │
       ▼
┌──────────────────┐
│  TaskDecomposer  │  利用 AI 分解任务
│    任务分解器     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ExecutionPlanner  │  生成执行计划
│   执行计划器      │  拓扑排序
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│AutoExecuteEngine │  自动执行计划
│  自主执行引擎     │  处理重试/超时
└────────┬─────────┘
         │
         ▼
     执行结果
```

## 完整运作流程详解

### 一、用户输入到执行的整体流程

```
┌─────────────────────────────────────────────────────────────────┐
│  用户在 REPL 输入:                                               │
│                                                                  │
│  my_agent> /auto 帮我把所有 TODO 找出来并生成报告                  │
└─────────────────────────────────┬─────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: REPL 识别命令 (Repl.ts)                                  │
│                                                                  │
│  if (trimmed.startsWith('/')) {                                   │
│    await commandRegistry.execute(trimmed, { client, store });     │
│  }                                                               │
└─────────────────────────────────┬─────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: CommandRegistry 解析命令 (commands.ts)                   │
│                                                                  │
│  parse(input) 返回:                                               │
│  {                                                               │
│    command: 'auto',     ← 提取命令名                              │
│    args: ['帮我把所有TODO找出来并生成报告']  ← 提取参数                │
│  }                                                               │
└─────────────────────────────────┬─────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: 查找并执行 auto 命令                                      │
│                                                                  │
│  const command = this.get('auto');  ← 找到 createAutoCommand     │
│  await command.execute(args, context);                            │
└─────────────────────────────────┬─────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: createAutoCommand().execute() 开始执行                    │
│                                                                  │
│  auto-command.ts 第 30-59 行                                      │
└─────────────────────────────────┬─────────────────────────────────┘
                                  │
                                  ▼
                        ┌─────────────────┐
                        │   任务分解       │
                        │ TaskDecomposer  │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  生成执行计划     │
                        │ExecutionPlanner │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  执行计划        │
                        │AutoExecuteEngine│
                        └────────┬────────┘
                                 │
                                 ▼
                           执行结果/报告
```

### 二、createAutoCommand().execute() 详解

**文件**: `src/core/auto-command.ts`

```typescript
// 第 30-59 行
async (args: string[], context: CommandContext): Promise<void> => {
  // 1. 获取用户任务描述
  const taskDescription = args.join(' ');
  // taskDescription = "帮我把所有 TODO 找出来并生成报告"

  // 2. 创建自主执行器
  const executor = createAutoExecutor({
    aiProvider: client,  // AI 客户端
    config: {
      enabled: true,
      showProgress: true,
      requirePlanApproval: true,  // 需要用户确认
    },
  });

  // 3. 设置进度回调
  executor.onProgress((progress) => {
    console.log(`[${progress.completed}/${progress.total}] ${progress.percentage}%`);
  });

  // 4. 设置计划确认回调 (显示计划，等待用户确认)
  executor.setApprovalCallback(async (plan) => {
    console.log('\n执行计划:');
    for (let i = 0; i < plan.tasks.length; i++) {
      const task = plan.tasks[i];
      console.log(`  ${i + 1}. ${task.description} (${task.tool.name})`);
    }
    return true;  // 自动执行，无需确认
  });

  // 5. 执行任务!
  const result = await executor.execute(taskDescription);
}
```

### 三、AutoExecutor.execute() 详解

**文件**: `src/agent/auto-executor.ts`

```typescript
// 第 50-80 行
async execute(query: string): Promise<ExecutionResult> {
  // ══════════════════════════════════════════════════════════════
  // 阶段 1: 任务分解 - 让 AI 思考如何完成这个任务
  // ══════════════════════════════════════════════════════════════

  // 初始化分解器 (如果还没初始化)
  this.initDecomposer();

  // 调用分解器，把任务分解成多个子任务
  const decomposition = await this.decomposer!.decompose(query);
  // 返回示例:
  // {
  //   success: true,
  //   tasks: [
  //     { description: "搜索 TODO 注释", tool: GrepTool, input: {...}, priority: 1, dependencies: [] },
  //     { description: "生成报告文件", tool: WriteTool, input: {...}, priority: 1, dependencies: ["task-1"] }
  //   ],
  //   reasoning: "首先搜索文件中的 TODO，然后生成报告"
  // }

  // ══════════════════════════════════════════════════════════════
  // 阶段 2: 生成执行计划 - 排序任务，处理依赖关系
  // ══════════════════════════════════════════════════════════════

  // 调用计划器，生成拓扑排序后的执行计划
  const plan = this.planner.generatePlan(decomposition, query);
  // 返回示例:
  // {
  //   id: "plan-123",
  //   tasks: [task-1, task-2],  // 已按依赖排序
  //   status: "planning"
  // }

  // ══════════════════════════════════════════════════════════════
  // 阶段 3: (可选) 用户确认
  // ══════════════════════════════════════════════════════════════

  if (this.config.requirePlanApproval && this.approvalCallback) {
    const approved = await this.approvalCallback(plan);
    if (!approved) {
      return { success: false, summary: '用户取消' };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 阶段 4: 执行计划 - 真正运行任务
  // ══════════════════════════════════════════════════════════════

  // 调用引擎执行计划
  return this.engine.execute(plan, async (task) => {
    return task.tool.execute(task.input);  // 调用 GrepTool.execute() 或 WriteTool.execute()
  });
}
```

### 四、TaskDecomposer.decompose() 详解

**文件**: `src/agent/decomposer.ts`

```
┌─────────────────────────────────────────────────────────────────┐
│  TaskDecomposer.decompose() 内部流程                              │
└─────────────────────────────────────────────────────────────────┘

第 1 步: 获取所有可用工具的描述
─────────────────────────────────────────────────────────────────
private getToolsDescription(): string {
  return this.availableTools
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join('\n');
}

输出示例:
`
- GrepTool: 在文件中搜索指定的文本模式
- WriteTool: 向文件中写入内容
- ReadTool: 读取文件内容
- BashTool: 执行 bash 命令
...
`

第 2 步: 构建 AI 提示词
─────────────────────────────────────────────────────────────────
const decompositionPrompt = `${TASK_DECOMPOSITION_PROMPT}
可用工具：
${toolsDescription}

用户任务：${userQuery}`;

TASK_DECOMPOSITION_PROMPT 模板 (types.ts):
`
你是一个任务分解专家...
规则:
1. 每个子任务必须使用一个现有工具
2. 子任务之间可能存在依赖关系
3. 按执行顺序排列任务

请按以下格式分解任务:
## 任务列表
1. [任务描述]: [工具名], {"参数": "值"}, 依赖: [依赖任务]
2. ...

分解理由：[简要说明为什么要这样分解]
`

第 3 步: 调用 AI 分解任务
─────────────────────────────────────────────────────────────────
const response = await this.aiProvider.sendMessage(
  [{ role: 'user', content: decompositionPrompt }],
  undefined,
  {}
);

AI 返回示例:
## 任务列表
1. 搜索项目中的 TODO 注释: GrepTool, {"pattern": "TODO"}, 依赖: 无
2. 将结果写入报告文件: WriteTool, {"path": "todo-report.md"}, 依赖: 1

分解理由: 首先使用 GrepTool 搜索所有 TODO 注释，然后将结果写入文件生成报告。

第 4 步: 解析 AI 返回
─────────────────────────────────────────────────────────────────
const parsed = this.parseDecomposition(content);
// 解析成结构化数据:
{
  success: true,
  tasks: [
    { description: "搜索项目中的 TODO 注释", toolName: "GrepTool", input: {pattern: "TODO"}, priority: 1, dependencies: [] },
    { description: "将结果写入报告文件", toolName: "WriteTool", input: {path: "todo-report.md"}, priority: 1, dependencies: ["task-1"] }
  ],
  reasoning: "首先使用 GrepTool..."
}
```

### 五、ExecutionPlanner.generatePlan() 详解

**文件**: `src/agent/planner.ts`

```
┌─────────────────────────────────────────────────────────────────┐
│  拓扑排序 - 处理任务之间的依赖关系                                  │
└─────────────────────────────────────────────────────────────────┘

输入 (TaskDecomposer 返回):
┌─────────────────────────────────────────────────────────────────┐
│ task-1: 搜索 TODO (依赖: [])                                      │
│ task-2: 生成报告 (依赖: [task-1])                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
拓扑排序算法 (planner.ts):
─────────────────────────────────────────────────────────────────

步骤 1: 构建入度表
入度 = 有多少个任务依赖它

  taskMap = {
    'task-1' → { description: "搜索 TODO", dependencies: [] },
    'task-2' → { description: "生成报告", dependencies: ['task-1'] }
  }

  inDegree = {
    'task-1' → 0,    ← 没有任何任务依赖它，所以入度=0
    'task-2' → 1    ← 依赖 task-1，所以入度=1
  }

步骤 2: 找出入度为 0 的任务 (可以立即执行)
  queue = [task-1]  ← task-1 入度=0，可以立即执行

步骤 3: BFS 遍历
  while (queue.length > 0) {

    第 1 轮:
    ─────────
    current = queue.shift() → task-1
    result = [task-1]

    遍历所有任务，检查谁依赖 task-1:
    - task-2 依赖 task-1，所以 task-2 的入度 -1
    - task-2 的新入度 = 1 - 1 = 0
    - task-2 入度变成 0，加入 queue

    queue = [task-2]

    第 2 轮:
    ─────────
    current = queue.shift() → task-2
    result = [task-1, task-2]

    遍历所有任务，检查谁依赖 task-2:
    - 没有任务依赖 task-2

    queue = []

步骤 4: 返回排序结果
  sortedTasks = [task-1, task-2]
  ← task-1 必须在 task-2 之前执行

输出:
┌─────────────────────────────────────────────────────────────────┐
│ 执行顺序:                                                         │
│   1. task-1: 搜索 TODO (入度=0, 无依赖)                           │
│   2. task-2: 生成报告 (入度=1, 依赖 task-1)                       │
└─────────────────────────────────────────────────────────────────┘
```

### 六、AutoExecuteEngine.execute() 详解

**文件**: `src/agent/engine.ts`

```
┌─────────────────────────────────────────────────────────────────┐
│  AutoExecuteEngine.execute() 内部流程                              │
└─────────────────────────────────────────────────────────────────┘

第 1 步: 初始化 (engine.ts)
─────────────────────────────────────────────────────────────────
async execute(plan, executeTaskFn): Promise<ExecutionResult> {
  if (this.isRunning) {
    throw new Error('Engine is already running');  ← 防止并发
  }

  this.isRunning = true;
  plan.status = 'executing';

  const startTime = Date.now();

  this.emit({ type: 'plan_started', planId: plan.id, timestamp: Date.now() });

  try {
    await this.executePlan(plan, executeTaskFn);  ← 核心执行逻辑
  } catch (error) {
    this.emit({ type: 'plan_failed', planId: plan.id, ... });
  }
}

第 2 步: 主循环 (executePlan 方法)
─────────────────────────────────────────────────────────────────
private async executePlan(plan, executeTaskFn): Promise<void> {
  // 最大总执行时间
  const maxEndTime = Date.now() + this.config.maxTotalTimeout;

  // 主循环: 直到计划完成或被取消
  while (!this.planner.isPlanComplete(plan) && !this.shouldCancel) {

    // ① 检查总超时
    if (Date.now() > maxEndTime) {
      console.warn('[Engine] Max total timeout reached');
      break;
    }

    // ② 获取所有可执行的任务 (依赖都已完成的任务)
    const nextTasks = this.planner.getNextExecutableTasks(plan);
    // nextTasks = [task-1] ← task-1 入度=0，可以执行

    if (nextTasks.length === 0) {
      await this.delay(100);  ← 等待 100ms 再检查
      continue;
    }

    // ③ 控制并发数量 (一次最多执行 N 个任务)
    const tasksToRun = nextTasks.slice(0, this.config.maxConcurrentTasks);
    // maxConcurrentTasks = 3 (默认)

    // ④ 并发执行本批任务
    const promises = tasksToRun.map((task) =>
      this.executeTaskWithRetry(plan, task, executeTaskFn)
    );

    await Promise.all(promises);  ← 等待本批全部完成

    // ⑤ 发出进度更新事件
    this.emitProgress(plan);

    // ⑥ 取消超时任务 (可选)
    if (this.config.autoCancelStale) {
      await this.cancelStaleTasks(plan);
    }
  }
}
```

### 七、重试机制详解

```
┌─────────────────────────────────────────────────────────────────┐
│  重试机制实现                                                     │
└─────────────────────────────────────────────────────────────────┘

private async executeTaskWithRetry(plan, task, executeTaskFn): Promise<void> {

  while (task.retryCount <= this.config.maxRetries) {
    // maxRetries = 3 (默认)

    try {
      // 尝试执行任务
      await this.executeSingleTask(plan, task, executeTaskFn);
      return;  ← 成功就直接返回

    } catch (error) {
      task.retryCount++;  ← 失败次数 +1

      if (task.retryCount > this.config.maxRetries) {
        // 重试次数用完了，标记为失败
        this.planner.updateTaskStatus(plan, task.id, TS.Failed, undefined, error.message);

        this.emit({
          type: 'task_failed',
          planId: plan.id,
          taskId: task.id,
          data: { error: error.message }
        });
      } else {
        // 还没到最大重试次数，等待后重试 (指数退避)
        console.log(`[Engine] Retrying task ${task.id} (${task.retryCount}/${this.config.maxRetries})`);
        await this.delay(1000 * task.retryCount);  ← 1s, 2s, 3s...
      }
    }
  }
}
```

### 八、超时控制详解

```
┌─────────────────────────────────────────────────────────────────┐
│  Promise.race 实现超时控制                                        │
└─────────────────────────────────────────────────────────────────┘

private async executeSingleTask(plan, task, executeTaskFn): Promise<void> {

  // ① 标记任务开始
  this.planner.updateTaskStatus(plan, task.id, TS.Running);

  this.emit({
    type: 'task_started',
    planId: plan.id,
    taskId: task.id,
    data: { description: task.description }
  });

  // ② 创建超时 Promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${this.config.taskTimeout}ms`));
    }, this.config.taskTimeout);
  });
  // taskTimeout = 30000ms (默认 30 秒)

  try {
    // ③ 竞速: 谁先完成用谁的结果
    const result = await Promise.race([
      executeTaskFn(task),      ← 实际执行工具
      timeoutPromise            ← 超时 Promise
    ]);

    // ④ 成功: 标记完成，保存结果
    this.planner.updateTaskStatus(plan, task.id, TS.Completed, result);

    this.emit({
      type: 'task_completed',
      planId: plan.id,
      taskId: task.id,
      data: { result }
    });

  } catch (error) {
    // ⑤ 失败: 标记失败，抛出错误让重试机制处理
    this.planner.updateTaskStatus(
      plan,
      task.id,
      TS.Failed,
      undefined,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}
```

## 完整执行时序图

```
用户输入: /auto 帮我把所有 TODO 找出来并生成报告
    │
    │  auto-command.ts:30
    ▼
createAutoExecutor({ aiProvider: client })
    │
    │  auto-executor.ts:50
    ▼
executor.execute(taskDescription)
    │
    ├──────────────────────────────────────────────────────────────┐
    │  阶段 1: TaskDecomposer.decompose()                          │
    │                                                             │
    │  ① getToolsDescription() → 工具列表文本                       │
    │  ② 构建提示词                                                │
    │  ③ aiProvider.sendMessage() → AI 返回分解结果                 │
    │  ④ parseDecomposition() → 解析成结构化数据                    │
    │                                                             │
    │  返回: { tasks: [{desc, tool, input, deps}, ...] }            │
    └──────────────────────────────────────────────────────────────┘
    │
    ├──────────────────────────────────────────────────────────────┐
    │  阶段 2: ExecutionPlanner.generatePlan()                     │
    │                                                             │
    │  ① topologicalSort() → 拓扑排序                              │
    │  ② validatePlan() → 验证计划                                 │
    │                                                             │
    │  返回: { id, tasks: [task-1, task-2], status: 'planning' }  │
    └──────────────────────────────────────────────────────────────┘
    │
    ├──────────────────────────────────────────────────────────────┐
    │  阶段 3: (可选) 用户确认                                     │
    │                                                             │
    │  executor.setApprovalCallback() 显示计划                      │
    │  用户确认后继续                                                │
    └──────────────────────────────────────────────────────────────┘
    │
    ├──────────────────────────────────────────────────────────────┐
    │  阶段 4: AutoExecuteEngine.execute()                         │
    │                                                             │
    │  ┌─ 主循环 begin ─────────────────────────────────────┐     │
    │  │                                                     │     │
    │  │  while (!planComplete && !shouldCancel) {          │     │
    │  │                                                     │     │
    │  │    ① getNextExecutableTasks()                      │     │
    │  │       → [task-1] (task-2 还依赖 task-1)             │     │
    │  │                                                     │     │
    │  │    ② tasksToRun = [task-1].slice(0, 3)             │     │
    │  │       → [task-1]                                    │     │
    │  │                                                     │     │
    │  │    ③ promises = [executeTaskWithRetry(task-1)]     │     │
    │  │                                                     │     │
    │  │    ④ await Promise.all(promises)                  │     │
    │  │       │                                             │     │
    │  │       ├── task-1 开始执行                          │     │
    │  │       │   └── GrepTool.execute({pattern: "TODO"})  │     │
    │  │       │   └── 返回搜索结果                          │     │
    │  │       │   └── task-1 标记为 Completed              │     │
    │  │       │                                             │     │
    │  │       └── 本批完成                                 │     │
    │  │                                                     │     │
    │  │    ⑤ emitProgress() → 进度更新                     │     │
    │  │                                                     │     │
    │  │    继续循环...                                      │     │
    │  │    → nextTasks = [task-2]                          │     │
    │  │    → task-2 开始执行                                │     │
    │  │    → WriteTool.execute({path: "report.md"})        │     │
    │  │    → task-2 标记为 Completed                       │     │
    │  │                                                     │     │
    │  │  } 条件不满足，退出循环                             │     │
    │  │  → planComplete = true                              │     │
    │  │                                                     │     │
    │  └─ 主循环 end ───────────────────────────────────────┘     │
    │                                                             │
    │  返回: ExecutionResult { success: true, completedTasks: 2 }  │
    └──────────────────────────────────────────────────────────────┘
    │
    ▼
执行成功! Plan plan-xxx: 100% complete (2 done, 0 failed)
```

## 类型定义

### 任务状态 (TaskStatus)

```typescript
export enum TaskStatus {
  Pending = 'pending',         // 等待执行
  Running = 'running',        // 执行中
  Completed = 'completed',     // 已完成
  Failed = 'failed',          // 执行失败
  Cancelled = 'cancelled',    // 已取消
  WaitingForDeps = 'waiting_for_deps',  // 等待依赖完成
}
```

### 任务优先级 (TaskPriority)

```typescript
export enum TaskPriority {
  Low = 0,      // 低优先级
  Normal = 1,   // 普通优先级
  High = 2,     // 高优先级
  Critical = 3, // 关键优先级
}
```

### 子任务 (SubTask)

```typescript
export interface SubTask {
  id: string;              // 唯一 ID
  description: string;     // 任务描述
  status: TaskStatus;      // 任务状态
  tool: Tool;              // 使用的工具
  input: Record<string, unknown>;  // 工具输入参数
  priority: TaskPriority;   // 任务优先级
  dependencies: string[];   // 依赖的任务 ID 列表
  result?: string;         // 执行结果
  error?: string;          // 错误信息
  startTime?: number;      // 开始时间
  endTime?: number;       // 结束时间
  retryCount: number;      // 当前重试次数
  maxRetries: number;     // 最大重试次数
}
```

### 执行计划 (ExecutionPlan)

```typescript
export interface ExecutionPlan {
  id: string;                      // 计划唯一 ID
  originalQuery: string;           // 用户原始查询
  tasks: SubTask[];                // 子任务列表
  createdAt: number;               // 创建时间
  status: PlanStatus;              // 计划状态
  estimatedDuration?: number;      // 预估执行时间
}
```

## 核心类

| 类 | 文件 | 职责 |
|---|------|------|
| TaskDecomposer | `src/agent/decomposer.ts` | 使用 AI 分解复杂任务 |
| ExecutionPlanner | `src/agent/planner.ts` | 拓扑排序、依赖管理、进度跟踪 |
| AutoExecuteEngine | `src/agent/engine.ts` | 并发执行、超时重试、事件系统 |
| AutoExecutor | `src/agent/auto-executor.ts` | 整合所有组件，提供简洁 API |

## 关键设计点总结

| 设计点 | 问题 | 解决方案 | 代码位置 |
|--------|------|----------|----------|
| **任务分解** | AI 怎么知道该用什么工具？ | 把工具列表转成文本喂给 AI | decomposer.ts:230 |
| **依赖排序** | 任务 A 依赖 B，怎么排顺序？ | 拓扑排序 (BFS) | planner.ts:46 |
| **超时控制** | 任务执行太久怎么办？ | Promise.race + setTimeout | engine.ts:180 |
| **失败重试** | 任务失败了怎么办？ | 计数器 + 指数退避 | engine.ts:150 |
| **并发控制** | 一次执行太多任务会卡死？ | slice + Promise.all | engine.ts:85 |
| **进度跟踪** | 怎么知道执行到哪了？ | 事件回调系统 | engine.ts:100 |
| **命令集成** | 怎么让 /auto 命令可用？ | CommandRegistry.register() | Repl.ts:81 |

## 使用示例

### CLI 使用

```
my_agent> /auto 帮我把所有 TODO 找出来并生成报告
正在分析任务: 帮我把所有 TODO 找出来并生成报告

执行计划:
  1. 搜索 TODO 注释 (GrepTool)
  2. 生成报告文件 (WriteTool)

开始自动执行...

[1/2] 50%
✓ Task 1 完成
✓ Task 2 完成

执行成功! Plan plan-xxx: 100% complete (2 done, 0 failed)
```

### 代码使用

```typescript
import { createAutoExecutor } from '../agent/index.js';

const executor = createAutoExecutor({ aiProvider });

executor.onProgress((progress) => {
  console.log(`[${progress.completed}/${progress.total}] ${progress.percentage}%`);
});

const result = await executor.execute('搜索项目中的所有 TODO 并生成报告');

if (result.success) {
  console.log(result.summary);
}
```

## 适用场景

### 适合的场景

1. **多步骤复杂任务**：需要按顺序执行多个工具才能完成的任务
2. **有明确依赖关系的任务**：子任务之间有前后依赖
3. **批量处理任务**：需要对多个文件/条目执行相同操作
4. **需要用户确认的计划**：执行前需要用户审核计划

### 不适合的场景

1. **简单单步任务**：一个工具调用就能完成的任务
2. **需要实时交互的任务**：每一步都需要用户输入
3. **高度不确定的任务**：AI 无法准确分解的任务

### 示例

**适合使用自主模式：**

- "帮我把所有 TODO 找出来并生成报告"
- "检查项目中的安全问题并修复它们"
- "清理所有临时文件并更新文档"

**不适合使用自主模式：**

- "帮我解释这段代码"（单步任务）
- "写一个 hello world 程序"（简单任务）
- "明天天气怎么样"（不需要工具）
