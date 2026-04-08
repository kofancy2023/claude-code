# 02 核心入口和启动流程分析

## 启动流程图

```
用户执行 bun run dev
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  src/entrypoints/cli.tsx (真正入口)                          │
│  - 注入 feature() polyfill (始终返回 false)                   │
│  - 注入 MACRO 全局变量 (VERSION, BUILD_TIME)                  │
│  - 设置 BUILD_TARGET, BUILD_ENV, INTERFACE_TYPE               │
│  - 解析 --version 快速路径                                   │
│  - 解析 --dump-system-prompt 快速路径                        │
│  - 解析 --claude-in-chrome-mcp 模式                          │
│  - 解析 --chrome-native-host 模式                            │
│  - 解析 --daemon-worker 模式                                 │
│  - 解析 remote-control/bridge 模式                            │
└─────────────────────────┬───────────────────────────────────┘
                          ▼ (正常启动路径)
┌─────────────────────────────────────────────────────────────┐
│  src/main.tsx (Commander.js CLI 定义)                         │
│  - 导入性能分析器 profileCheckpoint                          │
│  - 启动 MDM 原始读取 (startMdmRawRead)                       │
│  - 启动钥匙串预取 (startKeychainPrefetch)                    │
│  - 导入所有核心模块 (~135ms 并行加载)                         │
│  - 定义 CLI 命令结构                                          │
│  - 调用 init() 进行初始化                                      │
│  - 调用 launchRepl() 启动 REPL                               │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  src/replLauncher.tsx                                        │
│  - 动态导入 App 和 REPL 组件                                  │
│  - 调用 renderAndRun() 渲染 Ink 应用                         │
└─────────────────────────────────────────────────────────────┘
```

## cli.tsx 详细分析

### 1. 关键 Polyfill 注入

```typescript
// 第 1-7 行: 核心 polyfill
const feature = (_name: string) => false;  // 所有 feature flag 返回 false

(globalThis as any).MACRO = {
    VERSION: "2.1.888",        // 版本号 (888 = CCB 特殊版本)
    BUILD_TIME: new Date().toISOString(),
    FEEDBACK_CHANNEL: "",
    ISSUES_EXPLAINER: "",
    NATIVE_PACKAGE_URL: "",
    PACKAGE_URL: "",
    VERSION_CHANGELOG: "",
};

(globalThis as any).BUILD_TARGET = "external";
(globalThis as any).BUILD_ENV = "production";
(globalThis as any).INTERFACE_TYPE = "stdio";
```

**重要性**：这是整个项目的运行时基础，所有 feature flag 相关代码都是死代码。

### 2. 环境优化

```typescript
// 第 32-43 行: CCR 环境内存优化
if (process.env.CLAUDE_CODE_REMOTE === "true") {
    process.env.NODE_OPTIONS = `--max-old-space-size=8192`;
}
```

### 3. 快速路径设计

cli.tsx 实现了多个快速路径，避免加载完整模块：

| 快速路径 | 用途 | 性能收益 |
|----------|------|----------|
| `--version` / `-v` | 仅输出版本号 | 零模块加载 |
| `--dump-system-prompt` | 导出系统提示词 | 最小化加载 |
| `--claude-in-chrome-mcp` | Chrome MCP 模式 | 独立加载路径 |
| `--chrome-native-host` | Chrome 原生宿主 | 独立加载路径 |
| `--daemon-worker` | 守护进程工作器 | 轻量级启动 |
| `remote-control/bridge` | 桥接模式 | 独立加载路径 |

### 4. 关键代码片段

```typescript
// --version 快速路径 (第 55-67 行)
if (
    args.length === 1 &&
    (args[0] === "--version" || args[0] === "-v" || args[0] === "-V")
) {
    console.log(`${MACRO.VERSION} (Claude Code)`);
    return;
}

// 启动性能分析 (第 73-77 行)
const { profileCheckpoint } = await import("../utils/startupProfiler.js");
profileCheckpoint("cli_entry");
```

## main.tsx 详细分析

### 1. 导入策略

main.tsx 使用了多种优化导入策略：

```typescript
// 顶层导入 - 性能分析器 (最先运行)
import { profileCheckpoint, profileReport } from './utils/startupProfiler.js';

// 并行启动优化 (在导入时立即执行)
startMdmRawRead();                    // MDM 子进程并行启动
startKeychainPrefetch();              // 钥匙串读取并行启动

// 延迟导入 - 避免循环依赖
const getTeammateUtils = () => require('./utils/teammate.js');

// 条件导入 - 基于 feature flag
const coordinatorModeModule = feature('COORDINATOR_MODE')
    ? require('./coordinator/coordinatorMode.js')
    : null;
```

### 2. CLI 命令定义

main.tsx 使用 Commander.js 定义 CLI 结构：

```typescript
// 命令结构 (简化)
claude [command] [options]

Commands:
  claude              启动交互式 REPL
  claude --version    输出版本
  claude --help       显示帮助
  claude remote       远程模式
  claude init         初始化项目
  claude doctor       运行诊断
  ...
```

### 3. 核心初始化流程

```typescript
// 初始化流程
async function main() {
    // 1. 检查信任对话框
    checkHasTrustDialogAccepted();

    // 2. 初始化遥测 (信任后)
    initializeTelemetryAfterTrust();

    // 3. 加载配置
    const settings = await getInitialSettings();

    // 4. 初始化工具权限
    initializeToolPermissionContext();

    // 5. 启动 REPL
    launchRepl();
}
```

### 4. 服务初始化

| 服务 | 文件 | 职责 |
|------|------|------|
| Auth | `utils/auth.js` | API 密钥/OAuth 认证 |
| Analytics | `services/analytics/` | 事件追踪 (已 stub) |
| MCP | `services/mcp/` | Model Context Protocol |
| Policy | `services/policyLimits/` | 策略限制检查 |
| Settings | `utils/settings/` | 配置管理 |

## replLauncher.tsx 分析

```typescript
export async function launchRepl(root, appProps, replProps, renderAndRun) {
    // 动态导入组件
    const { App } = await import('./components/App.js');
    const { REPL } = await import('./screens/REPL.js');

    // 渲染 App 组件树
    await renderAndRun(root,
        <App {...appProps}>
            <REPL {...replProps} />
        </App>
    );
}
```

## 启动性能优化点

1. **并行导入**: MDM、钥匙串读取与主导入并行
2. **快速路径**: 特殊模式跳过完整加载
3. **动态导入**: REPL 组件延迟导入
4. **条件导入**: feature flag 控制死代码消除

## 改造优化建议

### 高优先级

1. **启用 Feature Flags**
   - 位置: `cli.tsx` 第 3 行
   - 当前: `const feature = (_name: string) => false;`
   - 建议: 实现真正的 feature flag 读取逻辑

2. **添加性能标记**
   - 使用 `profileCheckpoint` 标记关键阶段
   - 监控模块加载时间

### 中优先级

1. **优化导入顺序**
   - 将大模块改为动态导入
   - 分析并优化依赖树

2. **添加启动缓存**
   - 缓存解析结果
   - 复用认证状态

### 低优先级

1. **分离关注点**
   - 将 main.tsx 拆分为更小的模块
   - 按功能分组导入

## 相关源文件

| 文件 | 关键行数 | 说明 |
|------|----------|------|
| [cli.tsx](file:///d:/mySource/cusor-proj/claude-code/src/entrypoints/cli.tsx) | 1-50 | Polyfill 和快速路径 |
| [cli.tsx](file:///d:/mySource/cusor-proj/claude-code/src/entrypoints/cli.tsx) | 50-150 | 特殊模式处理 |
| [main.tsx](file:///d:/mySource/cusor-proj/claude-code/src/main.tsx) | 1-100 | 导入和初始化 |
| [main.tsx](file:///d:/mySource/cusor-proj/claude-code/src/main.tsx) | 100-200 | CLI 定义 |
| [replLauncher.tsx](file:///d:/mySource/cusor-proj/claude-code/src/replLauncher.tsx) | 1-22 | REPL 启动器 |

## 下一步

- [核心循环和查询引擎分析](./03_query_engine_analysis.md)
- [API 层和服务通信分析](./04_api_layer_analysis.md)
