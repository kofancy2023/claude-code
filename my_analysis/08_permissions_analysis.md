# 08 权限系统和安全机制分析

## 权限系统概述

Claude Code 有一个复杂的**权限系统**来控制工具执行：

```
┌─────────────────────────────────────────────────────────────┐
│                     权限检查流程                               │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  1. PermissionMode 检查                                       │
│     - auto: 自动允许安全操作                                  │
│     - manual: 全部需要确认                                    │
│     - plan: 计划模式下确认                                    │
│     - yolo: 全部允许 (危险)                                   │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  2. 规则匹配 (PermissionRule)                                │
│     - 路径规则                                               │
│     - 命令模式                                               │
│     - 工具规则                                               │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  3. 分类器决策 (可选)                                        │
│     - YOLO 分类器                                            │
│     - Bash 分类器                                            │
│     - 路径验证                                               │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  4. 权限决策                                                 │
│     - granted: 允许执行                                      │
│     - denied: 拒绝执行                                      │
│     - prompt: 请求用户确认                                   │
└─────────────────────────────────────────────────────────────┘
```

## 权限模式 (PermissionMode)

### 模式类型

```typescript
// types/permissions.ts
export type PermissionMode =
    | 'default'           // 默认模式
    | 'auto'             // 自动模式
    | 'manual'           // 手动确认
    | 'plan'             // 计划模式
    | 'bypassPermissions' // 绕过权限 (危险)
    | 'dontAsk'          // 不询问
    | 'acceptEdits'      // 接受编辑
    | 'yolo'             // YOLO 模式 (最危险)
```

### 模式配置

```typescript
// utils/permissions/PermissionMode.ts
const PERMISSION_MODE_CONFIG: Partial<
    Record<PermissionMode, PermissionModeConfig>
> = {
    default: {
        title: 'Default',
        shortTitle: 'Default',
        symbol: '',
        color: 'text',
        external: 'default',
    },
    plan: {
        title: 'Plan Mode',
        shortTitle: 'Plan',
        symbol: PAUSE_ICON,
        color: 'planMode',
        external: 'plan',
    },
    acceptEdits: {
        title: 'Accept edits',
        shortTitle: 'Accept',
        symbol: '⏵⏵',
        color: 'autoAccept',
        external: 'acceptEdits',
    },
    bypassPermissions: {
        title: 'Bypass Permissions',
        shortTitle: 'Bypass',
        symbol: '⏵⏵',
        color: 'error',
        external: 'bypassPermissions',
    },
    // ...
}
```

## 权限规则 (PermissionRule)

### 规则结构

```typescript
interface PermissionRule {
    id: string
    source: PermissionRuleSource  // 'user' | 'system' | 'managed'
    tool: string                  // 工具名称
    value: PermissionRuleValue    // 规则值
    allow: boolean                // 允许/拒绝
    requiresApproval: boolean    // 是否需要确认
    description?: string          // 规则描述
}

type PermissionRuleValue =
    | { kind: 'path'; pattern: string; basePath?: string }
    | { kind: 'command'; pattern: string }
    | { kind: 'tool'; pattern: string }
    | { kind: 'always' }
    | { kind: 'never' }
```

### 规则匹配

```typescript
// utils/permissions/shellRuleMatching.ts
function matchShellCommand(
    command: string,
    rules: PermissionRule[]
): PermissionDecision | null {
    for (const rule of rules) {
        if (rule.tool !== 'BashTool') continue
        if (rule.value.kind !== 'command') continue

        // 正则匹配命令
        const regex = new RegExp(rule.value.pattern)
        if (regex.test(command)) {
            return {
                allowed: rule.allow,
                reason: rule.requiresApproval ? 'approval_required' : 'auto'
            }
        }
    }
    return null  // 未匹配规则
}
```

## 权限检查流程

### 主检查函数

```typescript
// utils/permissions/permissions.ts
async function checkPermission(
    toolName: string,
    input: unknown,
    context: ToolUseContext
): Promise<PermissionResult> {
    // 1. 获取权限模式
    const mode = getPermissionMode()

    // 2. 模式特定检查
    if (mode === 'bypassPermissions') {
        return { granted: true, bypassed: true }
    }

    if (mode === 'yolo') {
        return { granted: true }  // 不记录
    }

    // 3. 获取规则
    const rules = await getRulesForTool(toolName)

    // 4. 规则匹配
    for (const rule of rules) {
        if (rule.matches(input)) {
            if (!rule.requiresApproval) {
                return { granted: rule.allow }
            }
            return { granted: rule.allow, requiresApproval: true }
        }
    }

    // 5. 分类器检查 (如果启用)
    if (mode === 'auto') {
        const classifierResult = await runClassifier(toolName, input)
        if (classifierResult.confident) {
            return { granted: classifierResult.allowed }
        }
    }

    // 6. 默认: 请求确认
    return { granted: false, requiresApproval: true }
}
```

### BashTool 权限检查

```typescript
// tools/BashTool/bashPermissions.ts
async function checkBashPermission(
    command: string,
    context: ToolUseContext
): Promise<PermissionResult> {
    // 1. 危险命令检测
    if (isDangerousCommand(command)) {
        return { granted: false, reason: 'dangerous_command' }
    }

    // 2. 路径验证
    const paths = extractPaths(command)
    for (const path of paths) {
        if (!isPathAllowed(path, context.cwd)) {
            return { granted: false, reason: 'path_outside_allowed' }
        }
    }

    // 3. 规则匹配
    const ruleResult = matchShellCommand(command, context.rules)
    if (ruleResult) {
        return ruleResult
    }

    // 4. 默认请求确认
    return { requiresApproval: true }
}
```

## 分类器系统

### YOLO 分类器

```typescript
// utils/permissions/yoloClassifier.ts
interface ClassifierResult {
    allowed: boolean
    confident: boolean
    reason: string
}

// YOLO 分类器使用规则模式匹配
function classifyYolo(
    toolName: string,
    input: unknown
): ClassifierResult {
    const rules = getYoloRules(toolName)

    for (const rule of rules) {
        const match = rule.match(input)
        if (match) {
            return {
                allowed: rule.allow,
                confident: true,
                reason: `matched_rule:${rule.id}`
            }
        }
    }

    return {
        allowed: false,
        confident: false,
        reason: 'no_match'
    }
}
```

### Bash 分类器

```typescript
// utils/permissions/bashClassifier.ts
function classifyBashCommand(
    command: string
): ClassifierResult {
    // 读取命令分类
    if (isReadOnlyCommand(command)) {
        return { allowed: true, confident: true, reason: 'read_only' }
    }

    // 危险命令分类
    if (isDangerousCommand(command)) {
        return { allowed: false, confident: true, reason: 'dangerous' }
    }

    // 网络命令
    if (isNetworkCommand(command)) {
        return { allowed: false, confident: false, reason: 'network' }
    }

    return {
        allowed: false,
        confident: false,
        reason: 'unknown'
    }
}

// 判断是否为只读命令
function isReadOnlyCommand(command: string): boolean {
    const readCommands = new Set([
        'cat', 'head', 'tail', 'less', 'more',
        'grep', 'find', 'ls', 'tree', 'wc',
        'stat', 'file', 'which', 'whereis',
        'git status', 'git log', 'git diff',
    ])

    const baseCommand = command.trim().split(/\s+/)[0]
    return readCommands.has(baseCommand)
}
```

## 路径验证

### 路径验证器

```typescript
// utils/permissions/pathValidation.ts
interface PathValidationResult {
    allowed: boolean
    reason?: string
    resolvedPath?: string
}

function validatePath(
    path: string,
    context: {
        cwd: string
        projectRoot: string
        allowedPaths?: string[]
    }
): PathValidationResult {
    // 解析绝对路径
    const resolved = resolve(context.cwd, path)

    // 检查是否在项目目录内
    if (!resolved.startsWith(context.projectRoot)) {
        return {
            allowed: false,
            reason: 'outside_project'
        }
    }

    // 检查允许路径列表
    if (context.allowedPaths?.length) {
        const isAllowed = context.allowedPaths.some(allowed =>
            resolved.startsWith(allowed)
        )
        if (!isAllowed) {
            return {
                allowed: false,
                reason: 'not_in_allowed_paths'
            }
        }
    }

    // 检查危险路径
    const dangerousPaths = [
        '/etc/passwd',
        '/etc/shadow',
        '/.ssh/',
        '/.aws/',
    ]

    for (const dangerous of dangerousPaths) {
        if (resolved.includes(dangerous)) {
            return {
                allowed: false,
                reason: 'dangerous_path'
            }
        }
    }

    return { allowed: true, resolvedPath: resolved }
}
```

## 危险模式检测

### 危险命令

```typescript
// utils/permissions/dangerousPatterns.ts
const DANGEROUS_PATTERNS = [
    // 文件系统破坏
    /^rm\s+-rf\s+\/$/,
    /^rm\s+-rf\s+\/\*/,
    /^dd\s+if=/,
    /^mkfs\./,
    /^format\s+/,

    // Fork bombs
    /:\(\)\{:\|\:&\};/,
    /fork\(\)/,

    // 提权
    /^sudo\s+/,
    /^chmod\s+777/,
    /^chmod\s+4755/,

    // 网络破坏
    /^iptables\s+-F/,
    /^ufw\s+disable/,
]

function isDangerousCommand(command: string): boolean {
    return DANGEROUS_PATTERNS.some(pattern =>
        pattern.test(command)
    )
}
```

## 权限决策追踪

### 拒绝追踪

```typescript
// utils/permissions/denialTracking.ts
interface DenialTrackingState {
    denialCount: number
    lastDenialTime: number
    denialHistory: DenialRecord[]
}

const DENIAL_LIMITS = {
    maxDenials: 10,
    windowMs: 60 * 60 * 1000,  // 1 小时
}

function recordDenial(state: DenialTrackingState): void {
    state.denialCount++
    state.lastDenialTime = Date.now()
    state.denialHistory.push({
        time: Date.now(),
        toolName: '...',
        reason: '...'
    })

    // 检查是否超过限制
    if (state.denialCount > DENIAL_LIMITS.maxDenials) {
        logWarning('Too many permission denials')
    }
}
```

## 沙箱集成

### BashTool 沙箱

```typescript
// tools/BashTool/shouldUseSandbox.ts
function shouldUseSandbox(command: string): boolean {
    // 危险命令必须沙箱
    if (isDangerousCommand(command)) {
        return true
    }

    // 网络命令建议沙箱
    if (isNetworkCommand(command)) {
        return true
    }

    // 用户配置
    return getSettings().sandboxEnabled
}
```

### 沙箱执行

```typescript
// utils/sandbox/sandbox-adapter.ts
class SandboxManager {
    async executeInSandbox(
        command: string,
        context: SandboxContext
    ): Promise<ExecResult> {
        const sandbox = await this.createSandbox({
            timeout: context.timeout,
            memoryLimit: context.memoryLimit,
            network: context.allowNetwork,
        })

        try {
            return await sandbox.exec(command)
        } finally {
            await sandbox.destroy()
        }
    }
}
```

## 关键文件

| 文件 | 行数 | 核心职责 |
|------|------|----------|
| [types/permissions.ts](file:///d:/mySource/cusor-proj/claude-code/src/types/permissions.ts) | 100+ | 权限类型定义 |
| [utils/permissions/PermissionMode.ts](file:///d:/mySource/cusor-proj/claude-code/src/utils/permissions/PermissionMode.ts) | 100+ | 权限模式 |
| [utils/permissions/permissions.ts](file:///d:/mySource/cusor-proj/claude-code/src/utils/permissions/permissions.ts) | 500+ | 核心权限检查 |
| [utils/permissions/permissionsLoader.ts](file:///d:/mySource/cusor-proj/claude-code/src/utils/permissions/permissionsLoader.ts) | 200+ | 规则加载 |
| [utils/permissions/bashClassifier.ts](file:///d:/mySource/cusor-proj/claude-code/src/utils/permissions/bashClassifier.ts) | 200+ | Bash 分类器 |
| [utils/permissions/yoloClassifier.ts](file:///d:/mySource/cusor-proj/claude-code/src/utils/permissions/yoloClassifier.ts) | 100+ | YOLO 分类器 |
| [tools/BashTool/bashPermissions.ts](file:///d:/mySource/cusor-proj/claude-code/src/tools/BashTool/bashPermissions.ts) | 300+ | Bash 权限 |

## 改造优化建议

### 高优先级

1. **增强路径验证**
   ```typescript
   // 添加符号链接解析
   function validatePath(path: string): PathValidationResult {
       const resolved = realpath(path)  // 解析符号链接
       return checkPath(resolved)
   }
   ```

2. **添加命令审计**
   ```typescript
   // 记录所有命令执行
   function logCommandExecution(command: string, result: ExecResult) {
       auditLog.push({
           timestamp: Date.now(),
           command,
           result,
           user: getCurrentUser(),
       })
   }
   ```

### 中优先级

1. **分类器可配置**
   ```typescript
   // 允许用户自定义分类器
   interface ClassifierConfig {
       readCommands: string[]
       dangerousCommands: string[]
       trustedCommands: string[]
   }
   ```

2. **添加规则优先级**
   ```typescript
   interface PermissionRule {
       priority: number  // 更高优先级先匹配
       // ...
   }
   ```

### 低优先级

1. **权限历史可视化**
   - 显示权限请求历史
   - 分析权限使用模式

2. **规则导入/导出**
   - 支持规则 JSON 导入导出
   - 规则版本控制

## 下一步

- [改造优化建议](./09_optimization_suggestions.md)
