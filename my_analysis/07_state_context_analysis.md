# 07 状态管理和上下文构建分析

## 状态管理架构

Claude Code 使用**多层状态管理**：

```
┌─────────────────────────────────────────────────────────────┐
│  全局状态 (bootstrap/state.ts)                               │
│  - sessionId, cwd, model                                    │
│  - 模块级单例                                               │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  应用状态 (state/AppState.tsx)                               │
│  - messages, tools, permissions                             │
│  - Zustand-style store                                     │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  组件状态 (React useState)                                   │
│  - 本地 UI 状态                                            │
│  - 临时状态                                                │
└─────────────────────────────────────────────────────────────┘
```

## 引导状态 (bootstrap/state.ts)

### 全局单例状态

```typescript
// bootstrap/state.ts
type State = {
    // 会话标识
    sessionId: SessionId

    // 路径
    originalCwd: string
    projectRoot: string
    cwd: string

    // 模型
    mainLoopModelOverride: ModelSetting | undefined
    initialMainLoopModel: ModelSetting

    // 成本追踪
    totalCostUSD: number
    totalAPIDuration: number

    // Token 预算
    currentTurnTokenBudget: number
    turnOutputTokens: number

    // 时间追踪
    startTime: number
    lastInteractionTime: number

    // 开关状态
    kairosActive: boolean
    isInteractive: boolean

    // 遥测
    meter: Meter | null
    sessionCounter: AttributedCounter | null
}
```

### 信号量模式

```typescript
// 使用信号量进行状态管理
import { createSignal } from './utils/signal.js'

// 创建信号
const [sessionId, setSessionId] = createSignal<SessionId>()

// 读取
const id = sessionId.get()

// 设置
setSessionId(newId)
```

### Token 预算管理

```typescript
// Turn token 预算
export function getCurrentTurnTokenBudget(): number {
    return currentTurnTokenBudget
}

export function setCurrentTurnTokenBudget(budget: number): void {
    currentTurnTokenBudget = budget
}

export function incrementBudgetContinuationCount(): void {
    budgetContinuationCount++
}
```

## 应用状态 (state/AppState.tsx)

### AppState 结构

```typescript
interface AppState {
    // 消息
    messages: Message[]
    pendingMessages: Message[]

    // 工具
    tools: Tools
    toolPermissionContext: ToolPermissionContext

    // MCP
    mcpClients: MCPServerConnection[]

    // 代理
    activeAgents: AgentDefinition[]

    // UI 状态
    mode: 'chat' | 'plan' | 'agent'
    isLoading: boolean
    error: Error | null

    // 设置
    settings: Settings
    permissionMode: PermissionMode

    // 会话
    sessionUrl: string | null
    transcriptPath: string | null
}
```

### AppStateStore (Zustand-style)

```typescript
// state/store.ts - 简单 Zustand 实现
export type Store<T> = {
    getState: () => T
    setState: (updater: (prev: T) => T) => void
    subscribe: (listener: Listener) => () => void
}

export function createStore<T>(
    initialState: T,
    onChange?: OnChange<T>
): Store<T> {
    let state = initialState
    const listeners = new Set<Listener>()

    return {
        getState: () => state,

        setState: (updater: (prev: T) => T) => {
            const prev = state
            const next = updater(prev)
            if (Object.is(next, prev)) return
            state = next
            onChange?.({ newState: next, oldState: prev })
            for (const listener of listeners) listener()
        },

        subscribe: (listener: Listener) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
    }
}
```

### AppStateProvider

```typescript
// state/AppState.tsx
export function AppStateProvider({ children, initialState }) {
    const [store] = useState(() =>
        createStore(initialState ?? getDefaultAppState())
    )

    // 订阅设置变更
    useEffect(() => {
        const unsubscribe = store.subscribe(() => {
            const { toolPermissionContext } = store.getState()
            // 处理变更
        })
        return unsubscribe
    }, [store])

    return (
        <AppStoreContext.Provider value={store}>
            {children}
        </AppStoreContext.Provider>
    )
}

// Hook 方式访问状态
function useAppState(): AppState {
    const store = useContext(AppStoreContext)
    const [state, setState] = useState(store.getState())

    useEffect(() => {
        return store.subscribe(() => {
            setState(store.getState())
        })
    }, [store])

    return state
}
```

## 上下文构建 (context.ts)

### 系统上下文

```typescript
// context.ts - getSystemContext
export const getGitStatus = memoize(async (): Promise<string | null> => {
    const [branch, mainBranch, status, log, userName] = await Promise.all([
        getBranch(),
        getDefaultBranch(),
        execFileNoThrow(gitExe(), ['status', '--short']),
        execFileNoThrow(gitExe(), ['log', '--oneline', '-n', '5']),
        execFileNoThrow(gitExe(), ['config', 'user.name']),
    ])

    return formatGitStatus({ branch, mainBranch, status, log, userName })
})
```

### 用户上下文

```typescript
// context.ts - getUserContext
export const getUserContext = memoize(async (): Promise<string> => {
    const parts: string[] = []

    // 1. Git 状态
    const gitStatus = await getGitStatus()
    if (gitStatus) {
        parts.push(`Git Status:\n${gitStatus}`)
    }

    // 2. CLAUDE.md 内容
    const claudeMdFiles = await getClaudeMds()
    for (const file of claudeMdFiles) {
        const content = await readFile(file.path)
        parts.push(`\n# ${file.relativePath}\n${content}`)
    }

    // 3. Memory 文件
    const memoryFiles = await getMemoryFiles()
    for (const file of memoryFiles) {
        parts.push(`\n# Memory: ${file.name}\n${file.content}`)
    }

    // 4. 日期时间
    parts.push(`\nCurrent Date: ${new Date().toISOString()}`)

    return parts.join('\n')
})
```

### 上下文注入

```typescript
// 将上下文注入到系统提示词
function buildSystemPrompt(
    basePrompts: SystemPrompt[],
    additionalContext: ContextResult
): string {
    const parts: string[] = []

    // 基础提示词
    for (const prompt of basePrompts) {
        parts.push(renderSystemPrompt(prompt))
    }

    // 用户上下文
    if (additionalContext.userContext) {
        parts.push(additionalContext.userContext)
    }

    // 系统上下文
    if (additionalContext.systemContext) {
        parts.push(additionalContext.systemContext)
    }

    return parts.join('\n\n')
}
```

## 消息管理

### 消息类型

```typescript
type Message =
    | UserMessage
    | AssistantMessage
    | SystemMessage
    | ToolMessage
    | ElicitMessage

interface UserMessage {
    type: 'user'
    id: string
    content: MessageContent[]
    timestamp: number
}

interface AssistantMessage {
    type: 'assistant'
    id: string
    content: MessageContent[]
    toolCalls?: ToolCall[]
    thinking?: string
    timestamp: number
}
```

### 消息存储

```typescript
// 在 AppState 中
interface AppState {
    messages: Message[]
    pendingMessages: Message[]
}

// 添加消息
function addMessage(state: AppState, message: Message): AppState {
    return {
        ...state,
        messages: [...state.messages, message]
    }
}

// 更新消息
function updateMessage(
    state: AppState,
    id: string,
    updater: (msg: Message) => Message
): AppState {
    return {
        ...state,
        messages: state.messages.map(msg =>
            msg.id === id ? updater(msg) : msg
        )
    }
}
```

## Compaction (对话压缩)

### Compaction 触发

```typescript
// 检查是否需要压缩
function shouldCompact(messages: Message[], usage: Usage): boolean {
    const tokenCount = calculateTokenCount(messages)
    const maxTokens = getContextWindowSize()

    // 超过 80% 则压缩
    return tokenCount > maxTokens * 0.8
}
```

### Compaction 执行

```typescript
// 构建压缩后的消息
function buildPostCompactMessages(
    messages: Message[],
    boundary: CompactBoundary
): Message[] {
    // 1. 保留系统消息
    const systemMessages = messages.filter(m => m.type === 'system')

    // 2. 保留压缩边界之后的消息
    const recentMessages = messages.filter(m =>
        m.index > boundary.index
    )

    // 3. 创建摘要消息
    const summary = createCompactSummary(messages, boundary)

    return [
        ...systemMessages,
        summary,
        ...recentMessages
    ]
}
```

## 关键文件

| 文件 | 行数 | 核心职责 |
|------|------|----------|
| [bootstrap/state.ts](file:///d:/mySource/cusor-proj/claude-code/src/bootstrap/state.ts) | 300+ | 全局单例状态 |
| [state/store.ts](file:///d:/mySource/cusor-proj/claude-code/src/state/store.ts) | 100+ | Zustand store |
| [state/AppState.tsx](file:///d:/mySource/cusor-proj/claude-code/src/state/AppState.tsx) | 300+ | AppState 定义 |
| [state/AppStateStore.ts](file:///d:/mySource/cusor-proj/claude-code/src/state/AppStateStore.ts) | 200+ | AppState store |
| [context.ts](file:///d:/mySource/cusor-proj/claude-code/src/context.ts) | 500+ | 上下文构建 |

## 改造优化建议

### 高优先级

1. **状态持久化**
   ```typescript
   // 添加状态恢复
   async function restoreState(): Promise<AppState | null> {
       const saved = localStorage.getItem('claude-state')
       return saved ? JSON.parse(saved) : null
   }

   // 定期保存
   useEffect(() => {
       const interval = setInterval(() => {
           localStorage.setItem('claude-state',
               JSON.stringify(store.getState())
           )
       }, 5000)
       return () => clearInterval(interval)
   }, [])
   ```

2. **状态历史**
   ```typescript
   // 添加 undo/redo
   const historyStore = createStore<{
       past: AppState[]
       future: AppState[]
   }>({ past: [], future: [] })
   ```

### 中优先级

1. **状态分割**
   - 将大状态拆分为小模块
   - 使用 Context 分离关注点

2. **Selector 优化**
   ```typescript
   // 避免不必要的重渲染
   const messages = useAppStateSelector(s => s.messages)
   ```

### 低优先级

1. **状态调试工具**
   - 添加状态检查器
   - 可视化状态变化

2. **性能监控**
   - 追踪状态更新频率
   - 检测性能问题

## 下一步

- [权限系统和安全机制分析](./08_permissions_analysis.md)
- [改造优化建议](./09_optimization_suggestions.md)
