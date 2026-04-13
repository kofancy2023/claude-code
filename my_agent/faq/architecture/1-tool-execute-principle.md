# tool.execute(toolCall.input) 执行原理

> 源码位置：`src/core/Repl.ts:187`

```ts
const result = await tool.execute(toolCall.input);
```

## 整体架构：策略模式 + 注册表

这是一套经典的**策略模式（Strategy Pattern）**实现，核心链路分 4 层。

---

## 1. Tool 接口（统一契约）

`src/types/index.ts` 定义了所有工具必须遵守的接口：

```ts
interface Tool {
  name: string;           // 工具名称，如 "BashTool"
  description: string;    // 给 LLM 看的描述
  inputSchema: ToolInputSchema;  // JSON Schema，告诉 LLM 参数格式
  execute: (input: Record<string, unknown>) => Promise<string>;  // 执行逻辑
}
```

关键点：`execute` 是一个**函数属性**，每个工具对象自带自己的执行实现。

---

## 2. 具体工具（各自实现 execute）

每个工具是一个满足 `Tool` 接口的对象字面量。例如：

- **BashTool**（`src/tools/BashTool.ts`）— `execute` 内部用 `child_process.spawn()` 执行 shell 命令
- **FileReadTool**（`src/tools/FileReadTool.ts`）— `execute` 内部用 `fs.readFileSync()` 读取文件

它们做的事情完全不同，但对外**签名一致**：都是 `(input) => Promise<string>`。

以 BashTool 为例：

```ts
export const BashTool: Tool = {
  name: 'BashTool',
  description: 'Execute a bash command in the terminal...',
  inputSchema: { ... },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const command = input.command as string;
    // 内部用 child_process.spawn 执行命令
    return new Promise((resolve, reject) => {
      const child = spawn(command, [], { shell: true });
      // ... 收集 stdout/stderr，返回结果
    });
  },
};
```

---

## 3. ToolRegistry（注册表）

`src/tools/registry.ts` 在构造时把所有工具实例注册到一个 `Map<string, Tool>` 中：

```ts
class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    this.register(BashTool);       // "BashTool" → BashTool 对象
    this.register(FileReadTool);   // "FileReadTool" → FileReadTool 对象
    // ...
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }
}
```

`toolRegistry.get("BashTool")` 返回的就是 `BashTool` 对象本身。

---

## 4. 执行时刻

```ts
// Repl.ts:187
const result = await tool.execute(toolCall.input);
```

这行能工作是因为 **JavaScript 的多态性**，完整调用链路如下：

```
LLM 返回 → { name: "BashTool", input: { command: "ls" } }
                    ↓
toolRegistry.get("BashTool")  →  拿到 BashTool 对象
                    ↓
tool.execute({ command: "ls" })  →  调用 BashTool.execute()
                    ↓
内部执行 spawn("ls", ...)  →  返回文件列表字符串
```

`tool` 变量的**运行时类型**决定了实际执行哪个 `execute`。TypeScript 的类型系统只保证 `tool` 满足 `Tool` 接口（有 `execute` 方法可调用），而具体执行什么逻辑由运行时的对象决定。

---

## 简单类比：函数分发表

| 步骤 | 代码 | 作用 |
|------|------|------|
| 注册 | `tools.set("BashTool", BashTool)` | 把函数存进表里 |
| 查找 | `toolRegistry.get(toolCall.name)` | 按名取出函数 |
| 执行 | `tool.execute(toolCall.input)` | 调用对应的函数 |

本质就是 **用 Map 做了一次间接调用（indirection）**，让调用方不需要知道具体有哪些工具、每个工具怎么执行——只需要面向 `Tool` 接口编程。

---

## 涉及的文件

| 文件 | 职责 |
|------|------|
| `src/types/index.ts` | 定义 `Tool` 接口 |
| `src/tools/registry.ts` | 工具注册表，管理所有工具实例 |
| `src/tools/BashTool.ts` | Shell 命令执行工具 |
| `src/tools/FileReadTool.ts` | 文件读取工具 |
| `src/tools/*.ts` | 其他工具实现 |
| `src/core/Repl.ts` | REPL 主循环，调用 `tool.execute()` |
