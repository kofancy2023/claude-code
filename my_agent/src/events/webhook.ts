/**
 * Webhook 管理器实现
 *
 * 核心功能：
 * - Webhook 的增删改查
 * - 事件的广播投递
 * - HTTP/WebSocket/SSE/Callback 多目的地支持
 * - 重试机制
 * - 过滤器支持
 */

import type {
  WebhookConfig,
  WebhookDestination,
  WebhookEvent,
  WebhookCallback,
  WebhookDeliveryResult,
  WebhookManager,
  WebhookLog,
  WebhookFilter,
  RetryConfig,
  WebhookContext,
} from './types.js';
import {
  WebhookDestinationType,
  WebhookError,
} from './types.js';
import { createEventEmitter } from './emitter.js';
import type { EventEmitter } from './types.js';

/**
 * Webhook 管理器配置
 */
export interface WebhookManagerOptions {
  /** 默认超时时间 (毫秒) */
  defaultTimeout?: number;
  /** 默认重试配置 */
  defaultRetry?: RetryConfig;
  /** 是否启用日志 */
  enableLogging?: boolean;
  /** 最大日志条数 */
  maxLogEntries?: number;
}

/**
 * Webhook 管理器默认值
 */
const DEFAULT_OPTIONS: Required<WebhookManagerOptions> = {
  defaultTimeout: 30000,
  defaultRetry: {
    maxAttempts: 3,
    delay: 1000,
    exponentialBackoff: true,
  },
  enableLogging: true,
  maxLogEntries: 1000,
};

/**
 * Webhook 管理器实现
 */
export class WebhookManagerImpl implements WebhookManager {
  private webhooks = new Map<string, WebhookConfig>();
  private webhookCounter = 0;
  private logs: WebhookLog[] = [];
  private options: Required<WebhookManagerOptions>;
  private eventEmitter: EventEmitter;

  constructor(options?: WebhookManagerOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.eventEmitter = createEventEmitter();
  }

  /**
   * 创建 Webhook
   */
  createWebhook(config: Omit<WebhookConfig, 'id'>): WebhookConfig {
    const id = `webhook_${++this.webhookCounter}_${Date.now()}`;

    const webhook: WebhookConfig = {
      ...config,
      id,
      timeout: config.timeout ?? this.options.defaultTimeout,
      retry: config.retry ?? this.options.defaultRetry,
      enabled: config.enabled ?? true,
    };

    this.webhooks.set(id, webhook);
    return webhook;
  }

  /**
   * 更新 Webhook
   */
  updateWebhook(id: string, config: Partial<WebhookConfig>): WebhookConfig {
    const webhook = this.webhooks.get(id);

    if (!webhook) {
      throw new WebhookError(`Webhook not found: ${id}`, 'WEBHOOK_NOT_FOUND', id);
    }

    const updated: WebhookConfig = {
      ...webhook,
      ...config,
      id, // 保持 ID 不变
    };

    this.webhooks.set(id, updated);
    return updated;
  }

  /**
   * 删除 Webhook
   */
  deleteWebhook(id: string): boolean {
    return this.webhooks.delete(id);
  }

  /**
   * 获取 Webhook
   */
  getWebhook(id: string): WebhookConfig | undefined {
    return this.webhooks.get(id);
  }

  /**
   * 列出所有 Webhook
   */
  listWebhooks(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * 启用 Webhook
   */
  enableWebhook(id: string): boolean {
    const webhook = this.webhooks.get(id);

    if (!webhook) {
      return false;
    }

    webhook.enabled = true;
    return true;
  }

  /**
   * 禁用 Webhook
   */
  disableWebhook(id: string): boolean {
    const webhook = this.webhooks.get(id);

    if (!webhook) {
      return false;
    }

    webhook.enabled = false;
    return true;
  }

  /**
   * 触发事件
   */
  async emit(event: WebhookEvent): Promise<WebhookDeliveryResult[]> {
    const results: WebhookDeliveryResult[] = [];

    // 同时通知事件订阅者
    this.eventEmitter.emit(event.type, event.data, event.metadata);

    // 查找订阅了该事件的 Webhook
    for (const webhook of this.webhooks.values()) {
      if (!webhook.enabled) continue;

      // 检查事件类型是否匹配
      if (!this.matchesEventType(event, webhook.events)) continue;

      // 检查过滤器
      if (webhook.filter && !this.matchesFilter(event, webhook.filter)) continue;

      // 投递到所有目的地
      for (const destination of webhook.destinations) {
        if (!destination.enabled) continue;

        const result = await this.deliverToDestination(
          event,
          webhook,
          destination
        );

        results.push(result);
      }
    }

    // 记录日志
    if (this.options.enableLogging) {
      this.addLog({
        id: event.id,
        webhookId: 'broadcast',
        event,
        results,
        createdAt: Date.now(),
      });
    }

    return results;
  }

  /**
   * 订阅事件
   */
  on(
    eventType: string,
    callback: WebhookCallback
  ): () => void {
    return this.eventEmitter.on(eventType, callback);
  }

  /**
   * 取消订阅
   */
  off(eventType: string): void {
    this.eventEmitter.off(eventType);
  }

  /**
   * 获取事件日志
   */
  getLogs(webhookId?: string): WebhookLog[] {
    if (webhookId) {
      return this.logs.filter((log) => log.webhookId === webhookId);
    }
    return [...this.logs];
  }

  /**
   * 清除日志
   */
  clearLogs(): void {
    this.logs = [];
  }

  // ==================== 私有方法 ====================

  /**
   * 检查事件类型是否匹配
   */
  private matchesEventType(
    event: WebhookEvent,
    eventTypes: (string | any)[]
  ): boolean {
    return eventTypes.includes(event.type);
  }

  /**
   * 检查过滤器
   */
  private matchesFilter(event: WebhookEvent, filter: WebhookFilter): boolean {
    // 路径过滤
    if (filter.pathPatterns && filter.pathPatterns.length > 0) {
      const path = this.extractPathFromEvent(event);
      if (path) {
        const matches = filter.pathPatterns.some((pattern) =>
          this.matchGlobPattern(path, pattern)
        );
        if (!matches) return false;
      }
    }

    // 源过滤
    if (filter.sources && filter.sources.length > 0) {
      if (!event.source || !filter.sources.includes(event.source)) {
        return false;
      }
    }

    // 自定义过滤
    if (filter.customFilter) {
      return filter.customFilter(event);
    }

    return true;
  }

  /**
   * 从事件中提取路径
   */
  private extractPathFromEvent(event: WebhookEvent): string | undefined {
    const data = event.data as Record<string, unknown>;
    return (data.path as string) || (data.uri as string);
  }

  /**
   * 匹配 glob 模式
   */
  private matchGlobPattern(path: string, pattern: string): boolean {
    // 简单的 glob 匹配实现
    // 支持 * (匹配任意字符) 和 ** (匹配路径分隔符)
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * 投递到目的地
   */
  private async deliverToDestination<T>(
    event: WebhookEvent<T>,
    webhook: WebhookConfig,
    destination: WebhookDestination
  ): Promise<WebhookDeliveryResult> {
    const result: WebhookDeliveryResult = {
      success: false,
      destinationId: destination.id,
      timestamp: Date.now(),
      attempts: 0,
    };

    const maxAttempts = webhook.retry?.maxAttempts ?? 1;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      result.attempts = attempt;

      try {
        switch (destination.type) {
          case WebhookDestinationType.Http:
            await this.deliverHttp(event, destination, webhook.timeout!);
            break;
          case WebhookDestinationType.Callback:
            await this.deliverCallback(event, destination);
            break;
          case WebhookDestinationType.Queue:
            await this.deliverQueue(event, destination);
            break;
          default:
            throw new Error(`Unsupported destination type: ${destination.type}`);
        }

        result.success = true;
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        result.error = lastError;

        // 如果不是最后一次尝试，等待后重试
        if (attempt < maxAttempts) {
          const delay = this.calculateRetryDelay(
            attempt,
            webhook.retry?.delay ?? 1000,
            webhook.retry?.exponentialBackoff ?? true
          );
          await this.sleep(delay);
        }
      }
    }

    return result;
  }

  /**
   * HTTP 投递
   */
  private async deliverHttp<T>(
    event: WebhookEvent<T>,
    destination: WebhookDestination,
    timeout: number
  ): Promise<void> {
    if (!destination.url) {
      throw new Error('HTTP destination requires URL');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(destination.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...destination.headers,
        },
        body: JSON.stringify(event),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 回调投递
   */
  private async deliverCallback<T>(
    event: WebhookEvent<T>,
    destination: WebhookDestination
  ): Promise<void> {
    if (!destination.callback) {
      throw new Error('Callback destination requires callback function');
    }

    const context: WebhookContext = {
      webhookId: '',
      destinationId: destination.id,
      attempt: 1,
      timestamp: Date.now(),
    };

    await destination.callback(event, context);
  }

  /**
   * 队列投递
   */
  private async deliverQueue<T>(
    event: WebhookEvent<T>,
    destination: WebhookDestination
  ): Promise<void> {
    // 简化的队列投递实现
    // 实际应该使用消息队列客户端 (RabbitMQ, Redis, etc.)
    if (!destination.queueConfig) {
      throw new Error('Queue destination requires queue config');
    }

    // 序列化事件并发送到队列
    const message = JSON.stringify(event);
    console.log(
      `[Queue] Sending to ${destination.queueConfig.name}: ${message.slice(0, 100)}...`
    );

    // 实际实现应该调用消息队列客户端
    // 例如: await this.rabbitMQ.publish(destination.queueConfig.name, message);
  }

  /**
   * 计算重试延迟
   */
  private calculateRetryDelay(
    attempt: number,
    baseDelay: number,
    exponentialBackoff: boolean
  ): number {
    if (exponentialBackoff) {
      return baseDelay * Math.pow(2, attempt - 1);
    }
    return baseDelay;
  }

  /**
   * 睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 添加日志
   */
  private addLog(log: WebhookLog): void {
    this.logs.push(log);

    // 限制日志条数
    if (this.logs.length > this.options.maxLogEntries) {
      this.logs = this.logs.slice(-this.options.maxLogEntries);
    }
  }
}

/**
 * 创建 Webhook 管理器
 *
 * @param options - 管理器配置
 * @returns Webhook 管理器实例
 */
export function createWebhookManager(
  options?: WebhookManagerOptions
): WebhookManager {
  return new WebhookManagerImpl(options);
}
