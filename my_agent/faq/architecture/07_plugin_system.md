# 插件系统开发指南

## 一、插件系统概述

### 1.1 为什么需要插件系统？

插件系统是扩展 Agent 能力的最佳方式：

```
┌─────────────────────────────────────────────────────────┐
│                    核心系统稳定                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  REPL + QueryEngine + 工具注册表 + 安全模块      │   │
│  └─────────────────────────────────────────────────┘   │
│                          │                              │
│           ┌──────────────┼──────────────┐              │
│           ▼              ▼              ▼              │
│      ┌─────────┐    ┌─────────┐    ┌─────────┐          │
│      │Git插件  │    │数据库插件│    │自定义插件│          │
│      │+5工具   │    │+3工具   │    │+?工具   │          │
│      └─────────┘    └─────────┘    └─────────┘          │
│                                                          │
│  核心稳定 × 插件生态 = 无限扩展                           │
└─────────────────────────────────────────────────────────┘
```

### 1.2 插件 vs 内置工具

| 特性 | 内置工具 | 插件 |
|------|----------|------|
| 加载时机 | 启动时 | 按需/启动时 |
| 代码位置 | 核心代码库 | 独立目录/包 |
| 更新方式 | 随主程序 | 独立更新 |
| 第三方 | 不支持 | 支持 |
| 生命周期 | 固定 | 可卸载 |

---

## 二、插件架构设计

### 2.1 核心组件

```
┌─────────────────────────────────────────────────────────────────┐
│                        插件系统架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │   插件 A    │    │   插件 B    │    │   插件 C    │          │
│  │  Git工具    │    │ 数据库工具  │    │  自定义工具 │          │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘          │
│         │                   │                   │                │
│         └───────────────────┼───────────────────┘                │
│                             ▼                                    │
│              ┌────────────────────────┐                         │
│              │     PluginRegistry     │  ← 插件注册表           │
│              │  - register(plugin)   │                         │
│              │  - unregister(name)   │                         │
│              │  - getAll()           │                         │
│              └────────────────────────┘                         │
│                             │                                    │
│                             ▼                                    │
│              ┌────────────────────────┐                         │
│              │      PluginLoader       │  ← 插件加载器           │
│              │  - loadFromPath()      │                         │
│              │  - loadFromConfig()     │                         │
│              │  - autoDiscover()      │                         │
│              └────────────────────────┘                         │
│                             │                                    │
│                             ▼                                    │
│              ┌────────────────────────┐                         │
│              │     Agent 核心          │  ← 插件融入主系统        │
│              │  - getTools()          │                         │
│              │  - emit lifecycle      │                         │
│              └────────────────────────┘                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 三个核心概念

1. **PluginLoader (加载器)**
   - 从文件/目录加载插件代码
   - 验证插件格式
   - 处理第三方插件

2. **PluginRegistry (注册表)**
   - 管理已加载插件
   - 提供工具查询
   - 触发生命周期钩子

3. **PluginHooks (生命周期)**
   - onLoad/onUnload
   - beforeToolExecute/afterToolExecute
   - onSessionStart/onSessionEnd

---

## 三、插件接口定义

### 3.1 AgentPlugin 接口

```typescript
// src/plugins/types.ts

/**
 * 插件接口
 * 所有插件必须实现此接口
 */
export interface AgentPlugin {
  /** 插件元数据 */
  metadata: PluginMetadata;

  /** 插件配置 */
  config?: PluginConfig[];

  /** 插件依赖 */
  dependencies?: PluginDependency[];

  /** 插件资源需求 */
  resources?: PluginResource[];

  /** 注册的工具列表 */
  tools?: Tool[];

  /** 生命周期钩子 */
  hooks?: PluginHooks;

  /** 中间件 */
  middleware?: PluginMiddleware[];

  /** 初始化方法 */
  initialize?: () => void | Promise<void>;

  /** 销毁方法 */
  destroy?: () => void | Promise<void>;
}
```

### 3.2 PluginMetadata 元数据

```typescript
export interface PluginMetadata {
  /** 插件唯一名称 */
  name: string;

  /** 插件版本 */
  version: string;

  /** 插件描述 */
  description?: string;

  /** 作者信息 */
  author?: string;

  /** 插件标签 */
  tags?: string[];

  /** 最低兼容版本 */
  minAgentVersion?: string;
}
```

### 3.3 PluginHooks 生命周期

```typescript
export interface PluginHooks {
  /** 插件加载时 */
  onLoad?: () => void | Promise<void>;

  /** 插件卸载时 */
  onUnload?: () => void | Promise<void>;

  /** 工具执行前 */
  beforeToolExecute?: (
    tool: Tool,
    input: Record<string, unknown>
  ) => void | Promise<void>;

  /** 工具执行后 */
  afterToolExecute?: (
    tool: Tool,
    input: Record<string, unknown>,
    result: string
  ) => void | Promise<void>;

  /** 会话开始/结束 */
  onSessionStart?: (sessionId: string) => void | Promise<void>;
  onSessionEnd?: (sessionId: string) => void | Promise<void>;
}
```

---

## 四、创建插件示例

### 4.1 Git 插件

```typescript
// src/plugins/builtin/git-plugin/index.ts

import type { AgentPlugin } from '../../types.js';

const GitStatusTool = {
  name: 'GitStatus',
  description: '查看 Git 仓库状态',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: '仓库路径', default: '.' },
      short: { type: 'boolean', description: '简短格式', default: false },
    },
  },
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const path = (input.path as string) || '.';
    const short = (input.short as boolean) || false;

    try {
      const { execSync } = await import('child_process');
      const args = short ? ['status', '--short', '-C', path] : ['status', '-C', path];
      const output = execSync(`git ${args.join(' ')}`, { encoding: 'utf-8' });
      return output;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

const gitPlugin: AgentPlugin = {
  metadata: {
    name: 'git-plugin',
    version: '1.0.0',
    description: '提供 Git 版本控制相关工具',
    author: 'My Agent Team',
    tags: ['git', 'vcs'],
  },

  tools: [GitStatusTool],

  hooks: {
    onLoad: () => console.log('[GitPlugin] Loaded'),
    onUnload: () => console.log('[GitPlugin] Unloading'),
  },
};

export default gitPlugin;
```

### 4.2 数据库插件

```typescript
// src/plugins/builtin/db-plugin/index.ts

import type { AgentPlugin } from '../../types.js';

const QueryTool = {
  name: 'DbQuery',
  description: '执行 SQL 查询',
  inputSchema: {
    type: 'object' as const,
    properties: {
      sql: { type: 'string', description: 'SQL 语句' },
    },
    required: ['sql'],
  },
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const sql = input.sql as string;

    // 安全检查
    if (/\b(drop|delete|truncate)\b/i.test(sql)) {
      return 'Error: Dangerous operation blocked';
    }

    // 执行查询...
    return JSON.stringify([{ id: 1, name: 'test' }]);
  },
};

const dbPlugin: AgentPlugin = {
  metadata: {
    name: 'db-plugin',
    version: '1.0.0',
    description: '数据库操作工具',
    tags: ['database', 'sql'],
  },

  tools: [QueryTool],

  hooks: {
    beforeToolExecute: (tool, input) => {
      if (tool.name === 'DbQuery') {
        console.log('[DbPlugin] Query:', (input as { sql?: string }).sql);
      }
    },
  },
};

export default dbPlugin;
```

---

## 五、插件注册表使用

### 5.1 基本用法

```typescript
import { PluginRegistry, createPluginRegistry } from './plugins/registry.js';

// 创建注册表
const registry = createPluginRegistry();

// 注册插件
registry.register(gitPlugin);
registry.register(dbPlugin);

// 获取所有工具
const allTools = registry.getTools();

// 获取特定工具
const statusTool = registry.getTool('GitStatus');

// 获取插件列表
const plugins = registry.getAll();
console.log(`已加载 ${plugins.length} 个插件`);
```

### 5.2 生命周期钩子

```typescript
// 监听插件事件
registry.on('plugin:registered', (event) => {
  console.log(`插件 ${event.plugin} 已注册`);
});

registry.on('plugin:unregistered', (event) => {
  console.log(`插件 ${event.plugin} 已卸载`);
});

// 调用全局钩子
await registry.invokeHook('beforeToolExecute', {
  tool: someTool,
  input: {},
});
```

### 5.3 中间件

```typescript
registry.registerMiddleware({
  name: 'logging-middleware',
  priority: 10,
  handler: async (ctx, next) => {
    console.log(`[Middleware] Before ${ctx.toolName}`);
    const result = await next();
    console.log(`[Middleware] After ${ctx.toolName}`);
    return result;
  },
});
```

---

## 六、加载插件

### 6.1 PluginLoader 用法

```typescript
import { PluginLoader, createPluginLoader } from './plugins/loader.js';

const loader = createPluginLoader({
  builtinDir: './plugins/builtin',
  userPluginsDir: './.agent/plugins',
  autoLoadBuiltin: true,
});

// 加载所有可用插件
const results = await loader.autoDiscover();

for (const result of results) {
  if (result.success) {
    console.log(`✓ ${result.name} 加载成功`);
  } else {
    console.error(`✗ ${result.name} 加载失败: ${result.error}`);
  }
}

// 加载单个插件
const single = await loader.load({
  type: 'user',
  path: './my-plugin/index.ts',
});
```

### 6.2 插件来源类型

```typescript
// 内置插件 (随 Agent 发布)
{ type: 'builtin', path: 'git-plugin' }

// 用户插件 (本地创建)
{ type: 'user', path: './.agent/plugins/my-plugin/index.ts' }

// 第三方插件 (npm 包)
{ type: 'third_party', path: '@agent-plugins/some-plugin' }
```

---

## 七、插件系统集成

### 7.1 集成到 Agent

```typescript
// src/core/Agent.ts

import { PluginRegistry, createPluginRegistry } from '../plugins/index.js';
import { createPluginLoader } from '../plugins/loader.js';

class Agent {
  private registry: PluginRegistry;
  private loader: PluginLoader;

  constructor() {
    this.registry = createPluginRegistry();
    this.loader = createPluginLoader();
  }

  async initialize() {
    // 加载内置插件
    const results = await this.loader.autoDiscover();

    for (const result of results) {
      if (result.success && result.plugin) {
        this.registry.register(result.plugin);
      }
    }

    // 合并到工具注册表
    const pluginTools = this.registry.getTools();
    for (const tool of pluginTools) {
      this.toolRegistry.register(tool);
    }
  }

  // 工具执行时触发钩子
  async executeTool(tool: Tool, input: Record<string, unknown>) {
    await this.registry.invokeHook('beforeToolExecute', { tool, input });

    try {
      const result = await tool.execute(input);
      await this.registry.invokeHook('afterToolExecute', { tool, input, result });
      return result;
    } catch (error) {
      await this.registry.invokeHook('onToolError', { tool, input, error });
      throw error;
    }
  }
}
```

---

## 八、最佳实践

### 8.1 插件设计原则

1. **单一职责**: 每个插件专注于一个功能领域
2. **松耦合**: 插件之间通过注册表通信，不直接依赖
3. **安全第一**: 敏感操作需要权限检查
4. **错误处理**: 所有钩子都需要 try-catch

### 8.2 安全检查

```typescript
const QueryTool = {
  name: 'DbQuery',
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const sql = input.sql as string;

    // 1. SQL 注入检查
    const dangerous = ['drop', 'delete', 'truncate', '--', '/*', '*/'];
    for (const pattern of dangerous) {
      if (sql.toLowerCase().includes(pattern)) {
        return 'Error: Dangerous SQL pattern detected';
      }
    }

    // 2. 执行查询...
    return result;
  },
};
```

### 8.3 配置管理

```typescript
const dbPlugin: AgentPlugin = {
  metadata: { name: 'db-plugin', version: '1.0.0' },

  config: [
    {
      key: 'connectionLimit',
      value: 10,
      type: 'number',
      description: '最大连接数',
    },
    {
      key: 'apiKey',
      value: '',
      type: 'string',
      sensitive: true,  // 不在日志中显示
    },
  ],
};
```

---

## 九、文件结构

```
src/plugins/
├── index.ts           # 导出
├── types.ts           # 接口定义
├── loader.ts          # 加载器
├── registry.ts        # 注册表
└── builtin/
    ├── git-plugin/
    │   └── index.ts
    └── db-plugin/
        └── index.ts
```

---

## 十、测试

```typescript
// src/__tests__/unit/plugin.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry, createPluginRegistry } from '../plugins/registry.js';

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = createPluginRegistry();
  });

  it('should register and retrieve plugins', () => {
    registry.register(myPlugin);

    expect(registry.has('my-plugin')).toBe(true);
    expect(registry.get('my-plugin')?.metadata.name).toBe('my-plugin');
  });

  it('should return all tools from plugins', () => {
    registry.register(plugin1);
    registry.register(plugin2);

    const tools = registry.getTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should emit events on register/unregister', () => {
    let registered = false;

    registry.on('plugin:registered', () => { registered = true; });
    registry.register(myPlugin);

    expect(registered).toBe(true);
  });
});
```
