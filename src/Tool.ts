import type {
  ToolResultBlockParam,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type {
  ElicitRequestURLParams,
  ElicitResult,
} from '@modelcontextprotocol/sdk/types.js'
import type { UUID } from 'crypto'
import type { z } from 'zod/v4'
import type { Command } from './commands.js'
import type { CanUseToolFn } from './hooks/useCanUseTool.js'
import type { ThinkingConfig } from './utils/thinking.js'

export type ToolInputJSONSchema = {
  [x: string]: unknown
  type: 'object'
  properties?: {
    [x: string]: unknown
  }
}

import type { Notification } from './context/notifications.js'
import type {
  MCPServerConnection,
  ServerResource,
} from './services/mcp/types.js'
import type {
  AgentDefinition,
  AgentDefinitionsResult,
} from './tools/AgentTool/loadAgentsDir.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  Message,
  ProgressMessage,
  SystemLocalCommandMessage,
  SystemMessage,
  UserMessage,
} from './types/message.js'
// Import permission types from centralized location to break import cycles
// 从集中位置导入权限类型以打破导入循环
// Import PermissionResult from centralized location to break import cycles
// 从集中位置导入 PermissionResult 以打破导入循环
import type {
  AdditionalWorkingDirectory,
  PermissionMode,
  PermissionResult,
} from './types/permissions.js'
// Import tool progress types from centralized location to break import cycles
// 从集中位置导入工具进度类型以打破导入循环
import type {
  AgentToolProgress,
  BashProgress,
  MCPProgress,
  REPLToolProgress,
  SkillToolProgress,
  TaskOutputProgress,
  ToolProgressData,
  WebSearchProgress,
} from './types/tools.js'
import type { FileStateCache } from './utils/fileStateCache.js'
import type { DenialTrackingState } from './utils/permissions/denialTracking.js'
import type { SystemPrompt } from './utils/systemPromptType.js'
import type { ContentReplacementState } from './utils/toolResultStorage.js'

// Re-export progress types for backwards compatibility
// 重新导出进度类型以保持向后兼容
export type {
  AgentToolProgress,
  BashProgress,
  MCPProgress,
  REPLToolProgress,
  SkillToolProgress,
  TaskOutputProgress,
  WebSearchProgress,
}

import type { SpinnerMode } from './components/Spinner.js'
import type { QuerySource } from './constants/querySource.js'
import type { SDKStatus } from './entrypoints/agentSdkTypes.js'
import type { AppState } from './state/AppState.js'
import type {
  HookProgress,
  PromptRequest,
  PromptResponse,
} from './types/hooks.js'
import type { AgentId } from './types/ids.js'
import type { DeepImmutable } from './types/utils.js'
import type { AttributionState } from './utils/commitAttribution.js'
import type { FileHistoryState } from './utils/fileHistory.js'
import type { Theme, ThemeName } from './utils/theme.js'

export type QueryChainTracking = {
  chainId: string
  depth: number
}

export type ValidationResult =
  | { result: true }
  | {
      result: false
      message: string
      errorCode: number
    }

export type SetToolJSXFn = (
  args: {
    jsx: React.ReactNode | null
    shouldHidePromptInput: boolean
    shouldContinueAnimation?: true
    showSpinner?: boolean
    isLocalJSXCommand?: boolean
    isImmediate?: boolean
    /** Set to true to clear a local JSX command (e.g., from its onDone callback)
   * 设为 true 以清除本地 JSX 命令（例如从其 onDone 回调中） */
    clearLocalJSX?: boolean
  } | null,
) => void

// Import tool permission types from centralized location to break import cycles
// 从集中位置导入工具权限类型以打破导入循环
import type { ToolPermissionRulesBySource } from './types/permissions.js'

// Re-export for backwards compatibility
// 重新导出以保持向后兼容
export type { ToolPermissionRulesBySource }

// Apply DeepImmutable to the imported type
// 对导入的类型应用 DeepImmutable
export type ToolPermissionContext = DeepImmutable<{
  mode: PermissionMode
  additionalWorkingDirectories: Map<string, AdditionalWorkingDirectory>
  alwaysAllowRules: ToolPermissionRulesBySource
  alwaysDenyRules: ToolPermissionRulesBySource
  alwaysAskRules: ToolPermissionRulesBySource
  isBypassPermissionsModeAvailable: boolean
  isAutoModeAvailable?: boolean
  strippedDangerousRules?: ToolPermissionRulesBySource
  /** When true, permission prompts are auto-denied (e.g., background agents that can't show UI)
   *  为 true 时，权限提示自动拒绝（例如无法显示 UI 的后台代理） */
  shouldAvoidPermissionPrompts?: boolean
  /** When true, automated checks (classifier, hooks) are awaited before showing the permission dialog (coordinator workers)
   *  为 true 时，在显示权限对话框前等待自动化检查（分类器、钩子）完成（协调器工作线程） */
  awaitAutomatedChecksBeforeDialog?: boolean
  /** Stores the permission mode before model-initiated plan mode entry, so it can be restored on exit
   *  存储模型发起计划模式进入前的权限模式，以便在退出时恢复 */
  prePlanMode?: PermissionMode
}>

export const getEmptyToolPermissionContext: () => ToolPermissionContext =
  () => ({
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  })

export type CompactProgressEvent =
  | {
      type: 'hooks_start'
      hookType: 'pre_compact' | 'post_compact' | 'session_start'
    }
  | { type: 'compact_start' }
  | { type: 'compact_end' }

export type ToolUseContext = {
  options: {
    commands: Command[]
    debug: boolean
    mainLoopModel: string
    tools: Tools
    verbose: boolean
    thinkingConfig: ThinkingConfig
    mcpClients: MCPServerConnection[]
    mcpResources: Record<string, ServerResource[]>
    isNonInteractiveSession: boolean
    agentDefinitions: AgentDefinitionsResult
    maxBudgetUsd?: number
    /** Custom system prompt that replaces the default system prompt
     * 替换默认系统提示词的自定义系统提示词 */
    customSystemPrompt?: string
    /** Additional system prompt appended after the main system prompt
     * 追加在主系统提示词之后的附加系统提示词 */
    appendSystemPrompt?: string
    /** Override querySource for analytics tracking
     * 覆盖用于分析追踪的 querySource */
    querySource?: QuerySource
    /** Optional callback to get the latest tools (e.g., after MCP servers connect mid-query)
     * 获取最新工具的可选回调（例如 MCP 服务器在查询中途连接后） */
    refreshTools?: () => Tools
  }
  abortController: AbortController
  readFileState: FileStateCache
  getAppState(): AppState
  setAppState(f: (prev: AppState) => AppState): void
  /**
   * Always-shared setAppState for session-scoped infrastructure (background
   * tasks, session hooks). Unlike setAppState, which is no-op for async agents
   * (see createSubagentContext), this always reaches the root store so agents
   * at any nesting depth can register/clean up infrastructure that outlives
   * a single turn. Only set by createSubagentContext; main-thread contexts
   * fall back to setAppState.
   *
   * 始终共享的 setAppState，用于会话级别的基础设施（后台任务、会话钩子）。
   * 与 setAppState 不同（对异步代理是空操作，见 createSubagentContext），
   * 这总是直达根存储，使任何嵌套深度的代理都能注册/清理超出单轮的基础设施。
   * 仅由 createSubagentContext 设置；主线程上下文回退到 setAppState。
   */
  setAppStateForTasks?: (f: (prev: AppState) => AppState) => void
  /**
   * Optional handler for URL elicitations triggered by tool call errors (-32042).
   * In print/SDK mode, this delegates to structuredIO.handleElicitation.
   * In REPL mode, this is undefined and the queue-based UI path is used.
   *
   * 用于处理工具调用错误 (-32042) 触发的 URL 请求的可选处理器。
   * 在 print/SDK 模式下，委托给 structuredIO.handleElicitation。
   * 在 REPL 模式下，此值为 undefined，使用基于队列的 UI 路径。
   */
  handleElicitation?: (
    serverName: string,
    params: ElicitRequestURLParams,
    signal: AbortSignal,
  ) => Promise<ElicitResult>
  setToolJSX?: SetToolJSXFn
  addNotification?: (notif: Notification) => void
  /** Append a UI-only system message to the REPL message list. Stripped at the
   *  normalizeMessagesForAPI boundary — the Exclude<> makes that type-enforced.
   *  向 REPL 消息列表追加仅用于 UI 的系统消息。在 normalizeMessagesForAPI 边界处被剥离——
   *  Exclude<> 使这一点在类型层面得到保证。 */
  appendSystemMessage?: (
    msg: Exclude<SystemMessage, SystemLocalCommandMessage>,
  ) => void
  /** Send an OS-level notification (iTerm2, Kitty, Ghostty, bell, etc.)
   *  发送操作系统级通知（iTerm2、Kitty、Ghostty、响铃等） */
  sendOSNotification?: (opts: {
    message: string
    notificationType: string
  }) => void
  nestedMemoryAttachmentTriggers?: Set<string>
  /**
   * CLAUDE.md paths already injected as nested_memory attachments this
   * session. Dedup for memoryFilesToAttachments — readFileState is an LRU
   * that evicts entries in busy sessions, so its .has() check alone can
   * re-inject the same CLAUDE.md dozens of times.
   *
   * 本次会话中已作为 nested_memory 附件注入的 CLAUDE.md 路径。
   * 用于 memoryFilesToAttachments 去重——readFileState 是 LRU 缓存，
   * 在繁忙会话中会驱逐条目，因此仅靠 .has() 检查可能会重复注入
   * 同一个 CLAUDE.md 数十次。
   */
  loadedNestedMemoryPaths?: Set<string>
  dynamicSkillDirTriggers?: Set<string>
  /** Skill names surfaced via skill_discovery this session. Telemetry only (feeds was_discovered).
   *  本次会话中通过 skill_discovery 展示的技能名称。仅用于遥测（提供给 was_discovered）。 */
  discoveredSkillNames?: Set<string>
  userModified?: boolean
  setInProgressToolUseIDs: (f: (prev: Set<string>) => Set<string>) => void
  /** Only wired in interactive (REPL) contexts; SDK/QueryEngine don't set this.
   *  仅在交互式 (REPL) 上下文中连接；SDK/QueryEngine 不设置此值。 */
  setHasInterruptibleToolInProgress?: (v: boolean) => void
  setResponseLength: (f: (prev: number) => number) => void
  /** Ant-only: push a new API metrics entry for OTPS tracking.
   *  Called by subagent streaming when a new API request starts.
   *  仅 Anthropic 内部使用：为 OTPS 追踪推送新的 API 指标条目。
   *  在子代理流式传输发起新 API 请求时调用。 */
  pushApiMetricsEntry?: (ttftMs: number) => void
  setStreamMode?: (mode: SpinnerMode) => void
  onCompactProgress?: (event: CompactProgressEvent) => void
  setSDKStatus?: (status: SDKStatus) => void
  openMessageSelector?: () => void
  updateFileHistoryState: (
    updater: (prev: FileHistoryState) => FileHistoryState,
  ) => void
  updateAttributionState: (
    updater: (prev: AttributionState) => AttributionState,
  ) => void
  setConversationId?: (id: UUID) => void
  agentId?: AgentId // Only set for subagents; use getSessionId() for session ID. Hooks use this to distinguish subagent calls.
  // 仅对子代理设置；使用 getSessionId() 获取会话 ID。钩子使用此值区分子代理调用。
  agentType?: string // Subagent type name. For the main thread's --agent type, hooks fall back to getMainThreadAgentType().
  // 子代理类型名称。对于主线程的 --agent 类型，钩子回退到 getMainThreadAgentType()。
  /** When true, canUseTool must always be called even when hooks auto-approve.
   *  Used by speculation for overlay file path rewriting.
   *  为 true 时，即使钩子自动批准，也必须始终调用 canUseTool。
   *  用于推测模式中的覆盖文件路径重写。 */
  requireCanUseTool?: boolean
  messages: Message[]
  fileReadingLimits?: {
    maxTokens?: number
    maxSizeBytes?: number
  }
  globLimits?: {
    maxResults?: number
  }
  toolDecisions?: Map<
    string,
    {
      source: string
      decision: 'accept' | 'reject'
      timestamp: number
    }
  >
  queryTracking?: QueryChainTracking
  /** Callback factory for requesting interactive prompts from the user.
   * Returns a prompt callback bound to the given source name.
   * Only available in interactive (REPL) contexts.
   * 用于请求用户交互式输入的回调工厂。
   * 返回绑定到给定源名称的提示回调。
   * 仅在交互式 (REPL) 上下文中可用。 */
  requestPrompt?: (
    sourceName: string,
    toolInputSummary?: string | null,
  ) => (request: PromptRequest) => Promise<PromptResponse>
  toolUseId?: string
  criticalSystemReminder_EXPERIMENTAL?: string
  /** When true, preserve toolUseResult on messages even for subagents.
   * Used by in-process teammates whose transcripts are viewable by the user.
   * 为 true 时，即使对子代理也保留消息上的 toolUseResult。
   * 用于其转录记录可被用户查看的进程内协作代理。 */
  preserveToolUseResults?: boolean
  /** Local denial tracking state for async subagents whose setAppState is a
   *  no-op. Without this, the denial counter never accumulates and the
   *  fallback-to-prompting threshold is never reached. Mutable — the
   *  permissions code updates it in place.
   *  异步子代理的本地拒绝追踪状态，因为其 setAppState 是空操作。
   *  没有此状态，拒绝计数器永远不会累积，回退到提示的阈值永远不会达到。
   *  可变——权限代码会就地更新它。 */
  localDenialTracking?: DenialTrackingState
  /**
   * Per-conversation-thread content replacement state for the tool result
   * budget. When present, query.ts applies the aggregate tool result budget.
   * Main thread: REPL provisions once (never resets — stale UUID keys
   * are inert). Subagents: createSubagentContext clones the parent's state
   * by default (cache-sharing forks need identical decisions), or
   * resumeAgentBackground threads one reconstructed from sidechain records.
   *
   * 每个会话线程的工具结果预算内容替换状态。存在时，query.ts 应用聚合工具结果预算。
   * 主线程：REPL 一次性提供（永不重置——过期的 UUID 键无效）。
   * 子代理：createSubagentContext 默认克隆父级状态（缓存共享分支需要一致的决策），
   * 或 resumeAgentBackground 线程从侧链记录重建。
   */
  contentReplacementState?: ContentReplacementState
  /**
   * Parent's rendered system prompt bytes, frozen at turn start.
   * Used by fork subagents to share the parent's prompt cache — re-calling
   * getSystemPrompt() at fork-spawn time can diverge (GrowthBook cold→warm)
   * and bust the cache. See forkSubagent.ts.
   *
   * 父级在轮次开始时冻结的已渲染系统提示词字节。
   * 用于分支子代理共享父级的提示词缓存——在分支生成时重新调用
   * getSystemPrompt() 可能产生偏差（GrowthBook 冷→热）并破坏缓存。
   * 参见 forkSubagent.ts。
   */
  renderedSystemPrompt?: SystemPrompt
}

// Re-export ToolProgressData from centralized location
// 从集中位置重新导出 ToolProgressData
export type { ToolProgressData }

export type Progress = ToolProgressData | HookProgress

export type ToolProgress<P extends ToolProgressData> = {
  toolUseID: string
  data: P
}

export function filterToolProgressMessages(
  progressMessagesForMessage: ProgressMessage[],
): ProgressMessage<ToolProgressData>[] {
  return progressMessagesForMessage.filter(
    (msg): msg is ProgressMessage<ToolProgressData> =>
      (msg.data as { type?: string })?.type !== 'hook_progress',
  )
}

export type ToolResult<T> = {
  data: T
  newMessages?: (
    | UserMessage
    | AssistantMessage
    | AttachmentMessage
    | SystemMessage
  )[]
  // contextModifier is only honored for tools that aren't concurrency safe.
  // contextModifier 仅对非并发安全的工具生效。
  contextModifier?: (context: ToolUseContext) => ToolUseContext
  /** MCP protocol metadata (structuredContent, _meta) to pass through to SDK consumers
   *  MCP 协议元数据（structuredContent, _meta），传递给 SDK 消费者 */
  mcpMeta?: {
    _meta?: Record<string, unknown>
    structuredContent?: Record<string, unknown>
  }
}

export type ToolCallProgress<P extends ToolProgressData = ToolProgressData> = (
  progress: ToolProgress<P>,
) => void

// Type for any schema that outputs an object with string keys
// 输出具有字符串键的对象的任意 schema 的类型
export type AnyObject = z.ZodType<{ [key: string]: unknown }>

/**
 * Checks if a tool matches the given name (primary name or alias).
 * 检查工具是否匹配给定名称（主名称或别名）。
 */
export function toolMatchesName(
  tool: { name: string; aliases?: string[] },
  name: string,
): boolean {
  return tool.name === name || (tool.aliases?.includes(name) ?? false)
}

/**
 * Finds a tool by name or alias from a list of tools.
 * 从工具列表中按名称或别名查找工具。
 */
export function findToolByName(tools: Tools, name: string): Tool | undefined {
  return tools.find(t => toolMatchesName(t, name))
}

export type Tool<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = {
  /**
   * Optional aliases for backwards compatibility when a tool is renamed.
   * The tool can be looked up by any of these names in addition to its primary name.
   *
   * 工具重命名时用于向后兼容的可选别名。
   * 除主名称外，工具还可以通过这些名称中的任何一个进行查找。
   */
  aliases?: string[]
  /**
   * One-line capability phrase used by ToolSearch for keyword matching.
   * Helps the model find this tool via keyword search when it's deferred.
   * 3–10 words, no trailing period.
   * Prefer terms not already in the tool name (e.g. 'jupyter' for NotebookEdit).
   *
   * ToolSearch 用于关键词匹配的单行能力描述。
   * 帮助模型在工具被延迟加载时通过关键词搜索找到此工具。
   * 3-10 个词，不以句号结尾。
   * 优先使用不在工具名称中的术语（例如 NotebookEdit 用 'jupyter'）。
   */
  searchHint?: string
  call(
    args: z.infer<Input>,
    context: ToolUseContext,
    canUseTool: CanUseToolFn,
    parentMessage: AssistantMessage,
    onProgress?: ToolCallProgress<P>,
  ): Promise<ToolResult<Output>>
  description(
    input: z.infer<Input>,
    options: {
      isNonInteractiveSession: boolean
      toolPermissionContext: ToolPermissionContext
      tools: Tools
    },
  ): Promise<string>
  readonly inputSchema: Input
  // Type for MCP tools that can specify their input schema directly in JSON Schema format
  // rather than converting from Zod schema
  // MCP 工具的类型，可直接以 JSON Schema 格式指定输入 schema，而无需从 Zod schema 转换
  readonly inputJSONSchema?: ToolInputJSONSchema
  // Optional because TungstenTool doesn't define this. TODO: Make it required.
  // When we do that, we can also go through and make this a bit more type-safe.
  // 可选，因为 TungstenTool 未定义此项。TODO: 设为必需。
  // 届时还可以让这个字段更类型安全。
  outputSchema?: z.ZodType<unknown>
  inputsEquivalent?(a: z.infer<Input>, b: z.infer<Input>): boolean
  isConcurrencySafe(input: z.infer<Input>): boolean
  isEnabled(): boolean
  isReadOnly(input: z.infer<Input>): boolean
  /** Defaults to false. Only set when the tool performs irreversible operations (delete, overwrite, send).
   *  默认为 false。仅在工具执行不可逆操作（删除、覆盖、发送）时设置。 */
  isDestructive?(input: z.infer<Input>): boolean
  /**
   * What should happen when the user submits a new message while this tool
   * is running.
   *
   * - `'cancel'` — stop the tool and discard its result
   * - `'block'`  — keep running; the new message waits
   *
   * Defaults to `'block'` when not implemented.
   *
   * 当用户在此工具运行时提交新消息时应该发生什么。
   *
   * - `'cancel'` — 停止工具并丢弃其结果
   * - `'block'`  — 继续运行；新消息等待
   *
   * 未实现时默认为 `'block'`。
   */
  interruptBehavior?(): 'cancel' | 'block'
  /**
   * Returns information about whether this tool use is a search or read operation
   * that should be collapsed into a condensed display in the UI. Examples include
   * file searching (Grep, Glob), file reading (Read), and bash commands like find,
   * grep, wc, etc.
   *
   * Returns an object indicating whether the operation is a search or read operation:
   * - `isSearch: true` for search operations (grep, find, glob patterns)
   * - `isRead: true` for read operations (cat, head, tail, file read)
   * - `isList: true` for directory-listing operations (ls, tree, du)
   * - All can be false if the operation shouldn't be collapsed
   *
   * 返回有关此工具使用是否为搜索或读取操作的信息，这些操作应在 UI 中折叠为简洁显示。
   * 示例包括文件搜索（Grep、Glob）、文件读取（Read）以及 find、grep、wc 等 bash 命令。
   *
   * 返回一个对象，指示操作是否为搜索或读取操作：
   * - `isSearch: true` 用于搜索操作（grep、find、glob 模式）
   * - `isRead: true` 用于读取操作（cat、head、tail、文件读取）
   * - `isList: true` 用于目录列表操作（ls、tree、du）
   * - 如果操作不应折叠，全部可以为 false
   */
  isSearchOrReadCommand?(input: z.infer<Input>): {
    isSearch: boolean
    isRead: boolean
    isList?: boolean
  }
  isOpenWorld?(input: z.infer<Input>): boolean
  requiresUserInteraction?(): boolean
  isMcp?: boolean
  isLsp?: boolean
  /**
   * When true, this tool is deferred (sent with defer_loading: true) and requires
   * ToolSearch to be used before it can be called.
   *
   * 为 true 时，此工具被延迟加载（以 defer_loading: true 发送），需要先使用 ToolSearch 才能调用。
   */
  readonly shouldDefer?: boolean
  /**
   * When true, this tool is never deferred — its full schema appears in the
   * initial prompt even when ToolSearch is enabled. For MCP tools, set via
   * `_meta['anthropic/alwaysLoad']`. Use for tools the model must see on
   * turn 1 without a ToolSearch round-trip.
   *
   * 为 true 时，此工具永远不会被延迟——即使启用了 ToolSearch，其完整 schema 也会出现在
   * 初始提示中。对于 MCP 工具，通过 `_meta['anthropic/alwaysLoad']` 设置。
   * 用于模型在第 1 轮就必须看到且无需 ToolSearch 往返的工具。
   */
  readonly alwaysLoad?: boolean
  /**
   * For MCP tools: the server and tool names as received from the MCP server (unnormalized).
   * Present on all MCP tools regardless of whether `name` is prefixed (mcp__server__tool)
   * or unprefixed (CLAUDE_AGENT_SDK_MCP_NO_PREFIX mode).
   *
   * 对于 MCP 工具：从 MCP 服务器接收的服务器和工具名称（未规范化）。
   * 存在于所有 MCP 工具上，无论 `name` 是否带前缀（mcp__server__tool）
   * 或无前缀（CLAUDE_AGENT_SDK_MCP_NO_PREFIX 模式）。
   */
  mcpInfo?: { serverName: string; toolName: string }
  readonly name: string
  /**
   * Maximum size in characters for tool result before it gets persisted to disk.
   * When exceeded, the result is saved to a file and Claude receives a preview
   * with the file path instead of the full content.
   *
   * Set to Infinity for tools whose output must never be persisted (e.g. Read,
   * where persisting creates a circular Read→file→Read loop and the tool
   * already self-bounds via its own limits).
   *
   * 工具结果持久化到磁盘前的最大字符数。
   * 超过时，结果保存到文件，Claude 收到文件路径预览而非完整内容。
   *
   * 对于输出绝不能持久化的工具设为 Infinity（例如 Read，
   * 持久化会造成 Read→file→Read 循环，且工具已通过自身限制进行了自约束）。
   */
  maxResultSizeChars: number
  /**
   * When true, enables strict mode for this tool, which causes the API to
   * more strictly adhere to tool instructions and parameter schemas.
   * Only applied when the tengu_tool_pear is enabled.
   *
   * 为 true 时，启用此工具的严格模式，使 API 更严格地遵循工具指令和参数 schema。
   * 仅在启用 tengu_tool_pear 时生效。
   */
  readonly strict?: boolean

  /**
   * Called on copies of tool_use input before observers see it (SDK stream,
   * transcript, canUseTool, PreToolUse/PostToolUse hooks). Mutate in place
   * to add legacy/derived fields. Must be idempotent. The original API-bound
   * input is never mutated (preserves prompt cache). Not re-applied when a
   * hook/permission returns a fresh updatedInput — those own their shape.
   *
   * 在观察者（SDK 流、转录记录、canUseTool、PreToolUse/PostToolUse 钩子）看到
   * tool_use 输入之前，在输入副本上调用。就地修改以添加遗留/派生字段。
   * 必须是幂等的。原始 API 绑定的输入永远不会被修改（保留提示缓存）。
   * 当钩子/权限返回新的 updatedInput 时不会重新应用——它们拥有自己的形状。
   */
  backfillObservableInput?(input: Record<string, unknown>): void

  /**
   * Determines if this tool is allowed to run with this input in the current context.
   * It informs the model of why the tool use failed, and does not directly display any UI.
   * 确定此工具是否被允许在当前上下文中以此输入运行。
   * 它通知模型工具使用失败的原因，不直接显示任何 UI。
   * @param input
   * @param context
   */
  validateInput?(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<ValidationResult>

  /**
   * Determines if the user is asked for permission. Only called after validateInput() passes.
   * General permission logic is in permissions.ts. This method contains tool-specific logic.
   * 确定是否向用户请求权限。仅在 validateInput() 通过后调用。
   * 通用权限逻辑在 permissions.ts 中。此方法包含工具特定的逻辑。
   * @param input
   * @param context
   */
  checkPermissions(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<PermissionResult>

  // Optional method for tools that operate on a file path
  // 对文件路径进行操作的工具的可选方法
  getPath?(input: z.infer<Input>): string

  /**
   * Prepare a matcher for hook `if` conditions (permission-rule patterns like
   * "git *" from "Bash(git *)"). Called once per hook-input pair; any
   * expensive parsing happens here. Returns a closure that is called per
   * hook pattern. If not implemented, only tool-name-level matching works.
   *
   * 为钩子 `if` 条件准备匹配器（权限规则模式，如 "Bash(git *)" 中的 "git *"）。
   * 每对钩子-输入调用一次；任何昂贵的解析都在这里进行。
   * 返回一个闭包，每个钩子模式调用一次。如未实现，则仅支持工具名称级别的匹配。
   */
  preparePermissionMatcher?(
    input: z.infer<Input>,
  ): Promise<(pattern: string) => boolean>

  prompt(options: {
    getToolPermissionContext: () => Promise<ToolPermissionContext>
    tools: Tools
    agents: AgentDefinition[]
    allowedAgentTypes?: string[]
  }): Promise<string>
  userFacingName(input: Partial<z.infer<Input>> | undefined): string
  userFacingNameBackgroundColor?(
    input: Partial<z.infer<Input>> | undefined,
  ): keyof Theme | undefined
  /**
   * Transparent wrappers (e.g. REPL) delegate all rendering to their progress
   * handler, which emits native-looking blocks for each inner tool call.
   * The wrapper itself shows nothing.
   *
   * 透明包装器（如 REPL）将所有渲染委托给其进度处理器，
   * 该处理器为每个内部工具调用发出原生外观的块。
   * 包装器本身不显示任何内容。
   */
  isTransparentWrapper?(): boolean
  /**
   * Returns a short string summary of this tool use for display in compact views.
   * @param input The tool input
   * @returns A short string summary, or null to not display
   *
   * 返回此工具使用的简短字符串摘要，用于紧凑视图显示。
   * @param input 工具输入
   * @returns 简短字符串摘要，或 null 表示不显示
   */
  getToolUseSummary?(input: Partial<z.infer<Input>> | undefined): string | null
  /**
   * Returns a human-readable present-tense activity description for spinner display.
   * Example: "Reading src/foo.ts", "Running bun test", "Searching for pattern"
   * @param input The tool input
   * @returns Activity description string, or null to fall back to tool name
   *
   * 返回用于加载动画显示的人类可读的现在时活动描述。
   * 示例："Reading src/foo.ts"、"Running bun test"、"Searching for pattern"
   * @param input 工具输入
   * @returns 活动描述字符串，或 null 以回退到工具名称
   */
  getActivityDescription?(
    input: Partial<z.infer<Input>> | undefined,
  ): string | null
  /**
   * Returns a compact representation of this tool use for the auto-mode
   * security classifier. Examples: `ls -la` for Bash, `/tmp/x: new content`
   * for Edit. Return '' to skip this tool in the classifier transcript
   * (e.g. tools with no security relevance). May return an object to avoid
   * double-encoding when the caller JSON-wraps the value.
   *
   * 返回此工具使用的紧凑表示，用于自动模式安全分类器。
   * 示例：Bash 的 `ls -la`，Edit 的 `/tmp/x: new content`。
   * 返回 '' 以在分类器转录中跳过此工具（例如无安全相关性的工具）。
   * 可以返回对象以避免调用者 JSON 包装时的双重编码。
   */
  toAutoClassifierInput(input: z.infer<Input>): unknown
  mapToolResultToToolResultBlockParam(
    content: Output,
    toolUseID: string,
  ): ToolResultBlockParam
  /**
   * Optional. When omitted, the tool result renders nothing (same as returning
   * null). Omit for tools whose results are surfaced elsewhere (e.g., TodoWrite
   * updates the todo panel, not the transcript).
   *
   * 可选。省略时，工具结果不渲染任何内容（等同于返回 null）。
   * 对于结果在其他地方展示的工具可省略（例如 TodoWrite 更新待办面板而非转录记录）。
   */
  renderToolResultMessage?(
    content: Output,
    progressMessagesForMessage: ProgressMessage<P>[],
    options: {
      style?: 'condensed'
      theme: ThemeName
      tools: Tools
      verbose: boolean
      isTranscriptMode?: boolean
      isBriefOnly?: boolean
      /** Original tool_use input, when available. Useful for compact result
       * summaries that reference what was requested (e.g. "Sent to #foo").
       *  原始 tool_use 输入（可用时）。用于引用请求内容的紧凑结果摘要（例如 "Sent to #foo"）。 */
      input?: unknown
    },
  ): React.ReactNode
  /**
   * Flattened text of what renderToolResultMessage shows IN TRANSCRIPT
   * MODE (verbose=true, isTranscriptMode=true). For transcript search
   * indexing: the index counts occurrences in this string, the highlight
   * overlay scans the actual screen buffer. For count ≡ highlight, this
   * must return the text that ends up visible — not the model-facing
   * serialization from mapToolResultToToolResultBlockParam (which adds
   * system-reminders, persisted-output wrappers).
   *
   * Chrome can be skipped (under-count is fine). "Found 3 files in 12ms"
   * isn't worth indexing. Phantoms are not fine — text that's claimed
   * here but doesn't render is a count≠highlight bug.
   *
   * Optional: omitted → field-name heuristic in transcriptSearch.ts.
   * Drift caught by test/utils/transcriptSearch.renderFidelity.test.tsx
   * which renders sample outputs and flags text that's indexed-but-not-
   * rendered (phantom) or rendered-but-not-indexed (under-count warning).
   *
   * renderToolResultMessage 在转录模式下（verbose=true, isTranscriptMode=true）
   * 显示内容的扁平化文本。用于转录搜索索引：索引计算此字符串中的出现次数，
   * 高亮叠加层扫描实际屏幕缓冲区。为了使计数≡高亮，这必须返回最终可见的文本——
   * 而非 mapToolResultToToolResultBlockParam 的面向模型序列化（它会添加系统提醒、
   * 持久化输出包装器）。
   *
   * 修饰文本可以跳过（计数偏少没关系）。"Found 3 files in 12ms" 不值得索引。
   * 幻影不行——声称存在但不渲染的文本是计数≠高亮的 bug。
   *
   * 可选：省略时使用 transcriptSearch.ts 中的字段名启发式方法。
   * 偏差由 test/utils/transcriptSearch.renderFidelity.test.tsx 捕获，
   * 该测试渲染示例输出并标记已索引但未渲染（幻影）或已渲染但未索引（计数偏少警告）的文本。
   */
  extractSearchText?(out: Output): string
  /**
   * Render the tool use message. Note that `input` is partial because we render
   * the message as soon as possible, possibly before tool parameters have fully
   * streamed in.
   *
   * 渲染工具使用消息。注意 `input` 是部分的，因为我们尽早渲染消息，
   * 可能在工具参数完全流式传入之前。
   */
  renderToolUseMessage(
    input: Partial<z.infer<Input>>,
    options: { theme: ThemeName; verbose: boolean; commands?: Command[] },
  ): React.ReactNode
  /**
   * Returns true when the non-verbose rendering of this output is truncated
   * (i.e., clicking to expand would reveal more content). Gates
   * click-to-expand in fullscreen — only messages where verbose actually
   * shows more get a hover/click affordance. Unset means never truncated.
   *
   * 当此输出的非详细渲染被截断时返回 true（即点击展开会显示更多内容）。
   * 控制全屏中的点击展开——仅当详细模式实际显示更多内容时才提供悬停/点击交互。
   * 未设置表示永不截断。
   */
  isResultTruncated?(output: Output): boolean
  /**
   * Renders an optional tag to display after the tool use message.
   * Used for additional metadata like timeout, model, resume ID, etc.
   * Returns null to not display anything.
   *
   * 渲染在工具使用消息后显示的可选标签。
   * 用于超时、模型、恢复 ID 等额外元数据。
   * 返回 null 表示不显示任何内容。
   */
  renderToolUseTag?(input: Partial<z.infer<Input>>): React.ReactNode
  /**
   * Optional. When omitted, no progress UI is shown while the tool runs.
   *
   * 可选。省略时，工具运行期间不显示进度 UI。
   */
  renderToolUseProgressMessage?(
    progressMessagesForMessage: ProgressMessage<P>[],
    options: {
      tools: Tools
      verbose: boolean
      terminalSize?: { columns: number; rows: number }
      inProgressToolCallCount?: number
      isTranscriptMode?: boolean
    },
  ): React.ReactNode
  renderToolUseQueuedMessage?(): React.ReactNode
  /**
   * Optional. When omitted, falls back to <FallbackToolUseRejectedMessage />.
   * Only define this for tools that need custom rejection UI (e.g., file edits
   * that show the rejected diff).
   *
   * 可选。省略时回退到 <FallbackToolUseRejectedMessage />。
   * 仅在需要自定义拒绝 UI 的工具上定义（例如显示被拒绝 diff 的文件编辑）。
   */
  renderToolUseRejectedMessage?(
    input: z.infer<Input>,
    options: {
      columns: number
      messages: Message[]
      style?: 'condensed'
      theme: ThemeName
      tools: Tools
      verbose: boolean
      progressMessagesForMessage: ProgressMessage<P>[]
      isTranscriptMode?: boolean
    },
  ): React.ReactNode
  /**
   * Optional. When omitted, falls back to <FallbackToolUseErrorMessage />.
   * Only define this for tools that need custom error UI (e.g., search tools
   * that show "File not found" instead of the raw error).
   *
   * 可选。省略时回退到 <FallbackToolUseErrorMessage />。
   * 仅在需要自定义错误 UI 的工具上定义（例如搜索工具显示 "File not found" 而非原始错误）。
   */
  renderToolUseErrorMessage?(
    result: ToolResultBlockParam['content'],
    options: {
      progressMessagesForMessage: ProgressMessage<P>[]
      tools: Tools
      verbose: boolean
      isTranscriptMode?: boolean
    },
  ): React.ReactNode

  /**
   * Renders multiple parallel instances of this tool as a group.
   * @returns React node to render, or null to fall back to individual rendering
   *
   * 将此工具的多个并行实例作为一组渲染。
   * @returns 要渲染的 React 节点，或 null 以回退到单独渲染
   */
  /**
   * Renders multiple tool uses as a group (non-verbose mode only).
   * In verbose mode, individual tool uses render at their original positions.
   * @returns React node to render, or null to fall back to individual rendering
   *
   * 将多个工具使用作为一组渲染（仅非详细模式）。
   * 在详细模式下，各个工具使用在其原始位置渲染。
   * @returns 要渲染的 React 节点，或 null 以回退到单独渲染
   */
  renderGroupedToolUse?(
    toolUses: Array<{
      param: ToolUseBlockParam
      isResolved: boolean
      isError: boolean
      isInProgress: boolean
      progressMessages: ProgressMessage<P>[]
      result?: {
        param: ToolResultBlockParam
        output: unknown
      }
    }>,
    options: {
      shouldAnimate: boolean
      tools: Tools
    },
  ): React.ReactNode | null
}

/**
 * A collection of tools. Use this type instead of `Tool[]` to make it easier
 * to track where tool sets are assembled, passed, and filtered across the codebase.
 *
 * 工具集合。使用此类型而非 `Tool[]`，以便更容易追踪工具集在整个代码库中
 * 被组装、传递和过滤的位置。
 */
export type Tools = readonly Tool[]

/**
 * Methods that `buildTool` supplies a default for. A `ToolDef` may omit these;
 * the resulting `Tool` always has them.
 *
 * `buildTool` 提供默认值的方法。`ToolDef` 可以省略这些；
 * 生成的 `Tool` 总是包含它们。
 */
type DefaultableToolKeys =
  | 'isEnabled'
  | 'isConcurrencySafe'
  | 'isReadOnly'
  | 'isDestructive'
  | 'checkPermissions'
  | 'toAutoClassifierInput'
  | 'userFacingName'

/**
 * Tool definition accepted by `buildTool`. Same shape as `Tool` but with the
 * defaultable methods optional — `buildTool` fills them in so callers always
 * see a complete `Tool`.
 *
 * `buildTool` 接受的工具定义。与 `Tool` 形状相同，但可设置默认值的方法为可选——
 * `buildTool` 会填充它们，使调用者始终看到完整的 `Tool`。
 */
export type ToolDef<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = Omit<Tool<Input, Output, P>, DefaultableToolKeys> &
  Partial<Pick<Tool<Input, Output, P>, DefaultableToolKeys>>

/**
 * Type-level spread mirroring `{ ...TOOL_DEFAULTS, ...def }`. For each
 * defaultable key: if D provides it (required), D's type wins; if D omits
 * it or has it optional (inherited from Partial<> in the constraint), the
 * default fills in. All other keys come from D verbatim — preserving arity,
 * optional presence, and literal types exactly as `satisfies Tool` did.
 *
 * 类型层面的展开，镜像 `{ ...TOOL_DEFAULTS, ...def }`。对于每个可设置默认值的键：
 * 如果 D 提供了它（必需），D 的类型优先；如果 D 省略了它或将其设为可选
 * （从约束中的 Partial<> 继承），则由默认值填充。所有其他键原样来自 D——
 * 保留参数数量、可选存在性和字面量类型，与 `satisfies Tool` 完全一致。
 */
type BuiltTool<D> = Omit<D, DefaultableToolKeys> & {
  [K in DefaultableToolKeys]-?: K extends keyof D
    ? undefined extends D[K]
      ? ToolDefaults[K]
      : D[K]
    : ToolDefaults[K]
}

/**
 * Build a complete `Tool` from a partial definition, filling in safe defaults
 * for the commonly-stubbed methods. All tool exports should go through this so
 * that defaults live in one place and callers never need `?.() ?? default`.
 *
 * Defaults (fail-closed where it matters):
 * - `isEnabled` → `true`
 * - `isConcurrencySafe` → `false` (assume not safe)
 * - `isReadOnly` → `false` (assume writes)
 * - `isDestructive` → `false`
 * - `checkPermissions` → `{ behavior: 'allow', updatedInput }` (defer to general permission system)
 * - `toAutoClassifierInput` → `''` (skip classifier — security-relevant tools must override)
 * - `userFacingName` → `name`
 *
 * 从部分定义构建完整的 `Tool`，为常用存根方法填充安全默认值。
 * 所有工具导出都应通过此函数，使默认值集中在一处，调用者无需 `?.() ?? default`。
 *
 * 默认值（在关键处采用故障关闭策略）：
 * - `isEnabled` → `true`
 * - `isConcurrencySafe` → `false`（假设不安全）
 * - `isReadOnly` → `false`（假设有写入）
 * - `isDestructive` → `false`
 * - `checkPermissions` → `{ behavior: 'allow', updatedInput }`（交由通用权限系统处理）
 * - `toAutoClassifierInput` → `''`（跳过分类器——安全相关工具必须覆盖）
 * - `userFacingName` → `name`
 */
const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isConcurrencySafe: (_input?: unknown) => false,
  isReadOnly: (_input?: unknown) => false,
  isDestructive: (_input?: unknown) => false,
  checkPermissions: (
    input: { [key: string]: unknown },
    _ctx?: ToolUseContext,
  ): Promise<PermissionResult> =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: (_input?: unknown) => '',
  userFacingName: (_input?: unknown) => '',
}

// The defaults type is the ACTUAL shape of TOOL_DEFAULTS (optional params so
// both 0-arg and full-arg call sites type-check — stubs varied in arity and
// tests relied on that), not the interface's strict signatures.
// 默认值类型是 TOOL_DEFAULTS 的实际形状（可选参数使得零参数和全参数调用点都能通过类型检查——
// 存根的参数数量各异且测试依赖于此），而非接口的严格签名。
type ToolDefaults = typeof TOOL_DEFAULTS

// D infers the concrete object-literal type from the call site. The
// constraint provides contextual typing for method parameters; `any` in
// constraint position is structural and never leaks into the return type.
// BuiltTool<D> mirrors runtime `{...TOOL_DEFAULTS, ...def}` at the type level.
// D 从调用点推断具体的对象字面量类型。约束为方法参数提供上下文类型；
// 约束位置的 `any` 是结构性的，永远不会泄漏到返回类型中。
// BuiltTool<D> 在类型层面镜像运行时的 `{...TOOL_DEFAULTS, ...def}`。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDef = ToolDef<any, any, any>

export function buildTool<D extends AnyToolDef>(def: D): BuiltTool<D> {
  // The runtime spread is straightforward; the `as` bridges the gap between
  // the structural-any constraint and the precise BuiltTool<D> return. The
  // type semantics are proven by the 0-error typecheck across all 60+ tools.
  // 运行时展开很直接；`as` 弥合了结构性 any 约束与精确 BuiltTool<D> 返回类型之间的差距。
  // 类型语义通过所有 60 多个工具的零错误类型检查得到验证。
  return {
    ...TOOL_DEFAULTS,
    userFacingName: () => def.name,
    ...def,
  } as BuiltTool<D>
}
