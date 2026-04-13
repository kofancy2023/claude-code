/**
 * Webhook 和回调模块类型定义
 *
 * Webhook 功能用于：
 * - 实时事件通知
 * - 外部系统集成
 * - 异步任务回调
 * - 状态变更监听
 */

/**
 * Webhook 事件类型
 */
export enum WebhookEventType {
  /** 文件变更事件 */
  FileChanged = 'file:changed',
  /** 目录变更事件 */
  DirectoryChanged = 'directory:changed',
  /** Git 提交事件 */
  GitCommit = 'git:commit',
  /** Git 分支事件 */
  GitBranch = 'git:branch',
  /** Git 标签事件 */
  GitTag = 'git:tag',
  /** 工具执行开始 */
  ToolExecutionStart = 'tool:execution:start',
  /** 工具执行完成 */
  ToolExecutionComplete = 'tool:execution:complete',
  /** 工具执行失败 */
  ToolExecutionFailed = 'tool:execution:failed',
  /** AI 查询开始 */
  AIQueryStart = 'ai:query:start',
  /** AI 查询完成 */
  AIQueryComplete = 'ai:query:complete',
  /** AI 查询失败 */
  AIQueryFailed = 'ai:query:failed',
  /** MCP 资源变更 */
  MCPResourceChanged = 'mcp:resource:changed',
  /** MCP 连接状态变更 */
  MCPConnectionChanged = 'mcp:connection:changed',
  /** 系统错误 */
  SystemError = 'system:error',
  /** 自定义事件 */
  Custom = 'custom',
}

/**
 * Webhook 事件
 */
export interface WebhookEvent<T = unknown> {
  /** 事件 ID */
  id: string;
  /** 事件类型 */
  type: WebhookEventType | string;
  /** 事件数据 */
  data: T;
  /** 事件时间戳 */
  timestamp: number;
  /** 事件来源 */
  source?: string;
  /** 关联的元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Webhook 目的地类型
 */
export enum WebhookDestinationType {
  /** HTTP/HTTPS Webhook */
  Http = 'http',
  /** WebSocket */
  WebSocket = 'websocket',
  /** SSE (Server-Sent Events) */
  SSE = 'sse',
  /** 本地回调函数 */
  Callback = 'callback',
  /** 消息队列 */
  Queue = 'queue',
}

/**
 * Webhook 目的地配置
 */
export interface WebhookDestination {
  /** 目的地 ID */
  id: string;
  /** 目的地名称 */
  name: string;
  /** 目的地类型 */
  type: WebhookDestinationType;
  /** 目的地 URL (用于 HTTP/WebSocket) */
  url?: string;
  /** 回调函数 (用于 Callback 类型) */
  callback?: WebhookCallback;
  /** 队列配置 (用于 Queue 类型) */
  queueConfig?: QueueConfig;
  /** 自定义头信息 */
  headers?: Record<string, string>;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * Webhook 配置
 */
export interface WebhookConfig {
  /** Webhook ID */
  id: string;
  /** Webhook 名称 */
  name: string;
  /** Webhook 描述 */
  description?: string;
  /** 订阅的事件类型 */
  events: (WebhookEventType | string)[];
  /** 目的地列表 */
  destinations: WebhookDestination[];
  /** 过滤器条件 */
  filter?: WebhookFilter;
  /** 重试配置 */
  retry?: RetryConfig;
  /** 超时时间 (毫秒) */
  timeout?: number;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * Webhook 过滤器
 */
export interface WebhookFilter {
  /** 路径过滤 (支持 glob 模式) */
  pathPatterns?: string[];
  /** 事件源过滤 */
  sources?: string[];
  /** 自定义过滤函数 */
  customFilter?: (event: WebhookEvent) => boolean;
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxAttempts: number;
  /** 重试间隔 (毫秒) */
  delay: number;
  /** 指数退避 */
  exponentialBackoff: boolean;
  /** 可重试的错误码 */
  retryableErrors?: string[];
}

/**
 * 队列配置
 */
export interface QueueConfig {
  /** 队列名称 */
  name: string;
  /** 队列类型 (memory, redis, rabbitmq 等) */
  type: string;
  /** 连接 URL */
  url?: string;
  /** 队列选项 */
  options?: Record<string, unknown>;
}

/**
 * Webhook 回调函数类型
 */
export type WebhookCallback = (
  event: WebhookEvent,
  context: WebhookContext
) => Promise<void> | void;

/**
 * Webhook 上下文
 */
export interface WebhookContext {
  /** Webhook ID */
  webhookId: string;
  /** 目的地 ID */
  destinationId: string;
  /** 重试次数 */
  attempt: number;
  /** 请求时间 */
  timestamp: number;
  /** 取消令牌 */
  cancelToken?: CancellationToken;
}

/**
 * Webhook 投递结果
 */
export interface WebhookDeliveryResult {
  /** 是否成功 */
  success: boolean;
  /** 目的地 ID */
  destinationId: string;
  /** 响应码 (HTTP) */
  statusCode?: number;
  /** 响应体 */
  responseBody?: string;
  /** 错误信息 */
  error?: string;
  /** 投递时间 */
  timestamp: number;
  /** 重试次数 */
  attempts: number;
}

/**
 * Webhook 日志
 */
export interface WebhookLog {
  /** 日志 ID */
  id: string;
  /** Webhook ID */
  webhookId: string;
  /** 事件 */
  event: WebhookEvent;
  /** 投递结果 */
  results: WebhookDeliveryResult[];
  /** 创建时间 */
  createdAt: number;
}

/**
 * Webhook 管理器接口
 */
export interface WebhookManager {
  /** 创建 Webhook */
  createWebhook(config: Omit<WebhookConfig, 'id'>): WebhookConfig;

  /** 更新 Webhook */
  updateWebhook(id: string, config: Partial<WebhookConfig>): WebhookConfig;

  /** 删除 Webhook */
  deleteWebhook(id: string): boolean;

  /** 获取 Webhook */
  getWebhook(id: string): WebhookConfig | undefined;

  /** 列出所有 Webhook */
  listWebhooks(): WebhookConfig[];

  /** 启用 Webhook */
  enableWebhook(id: string): boolean;

  /** 禁用 Webhook */
  disableWebhook(id: string): boolean;

  /** 触发事件 */
  emit(event: WebhookEvent): Promise<WebhookDeliveryResult[]>;

  /** 订阅事件 */
  on(
    eventType: WebhookEventType | string,
    callback: WebhookCallback
  ): () => void;

  /** 取消订阅 */
  off(
    eventType: WebhookEventType | string
  ): void;
}

/**
 * 事件发射器接口
 */
export interface EventEmitter {
  /** 发射事件 */
  emit<T>(type: string, data: T, metadata?: Record<string, unknown>): void;

  /** 监听事件 */
  on<T>(
    type: string,
    listener: (event: WebhookEvent<T>, context: WebhookContext) => void
  ): () => void;

  /** 单次监听 */
  once<T>(
    type: string,
    listener: (event: WebhookEvent<T>, context: WebhookContext) => void
  ): () => void;

  /** 移除监听 */
  off(type: string): void;
}

/**
 * 取消令牌接口
 */
export interface CancellationToken {
  /** 是否已取消 */
  readonly isCancelled: boolean;
  /** 取消信号 */
  cancel(): void;
}

/**
 * Webhook 错误类
 */
export class WebhookError extends Error {
  constructor(
    message: string,
    public code: string,
    public webhookId?: string,
    public destinationId?: string
  ) {
    super(message);
    this.name = 'WebhookError';
  }
}

/**
 * 创建取消令牌
 */
export function createCancellationToken(): CancellationToken {
  let cancelled = false;

  return {
    get isCancelled() {
      return cancelled;
    },
    cancel() {
      cancelled = true;
    },
  };
}

/**
 * 事件 ID 生成器
 */
export function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
