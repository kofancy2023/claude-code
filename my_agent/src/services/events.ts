/**
 * 事件系统模块
 *
 * 提供统一的事件发射/监听机制，支持：
 * - 同步/异步事件处理
 * - 事件订阅/取消订阅
 * - 错误处理和传播
 * - 事件历史记录
 * - Webhook 集成
 */

import { createWebhookManager } from '../events/webhook.js';
import type { WebhookEvent, WebhookManager } from '../events/types.js';
import { WebhookDestinationType } from '../events/types.js';

export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

export interface EventSubscription {
  unsubscribe(): void;
}

export interface EventMetrics {
  totalEmitted: number;
  totalHandlers: number;
  errorCount: number;
  lastEmittedAt?: number;
}

export class EventEmitter<TEventMap extends object = object> {
  private handlers: Map<keyof TEventMap, Set<EventHandler<unknown>>> = new Map();
  private metrics: Map<keyof TEventMap, EventMetrics> = new Map();
  private eventHistory: Array<{ event: keyof TEventMap; data: unknown; timestamp: number }> = [];
  private maxHistorySize: number;
  private isAsync: boolean;
  private webhookManager?: WebhookManager;
  private eventToWebhookMap: Map<keyof TEventMap, string>;

  constructor(options: {
    maxHistorySize?: number;
    async?: boolean;
    enableWebhook?: boolean;
  } = {}) {
    this.maxHistorySize = options.maxHistorySize ?? 100;
    this.isAsync = options.async ?? true;
    this.eventToWebhookMap = new Map();

    if (options.enableWebhook) {
      this.webhookManager = createWebhookManager();
    }
  }

  /**
   * 设置 Webhook 管理器
   */
  setWebhookManager(manager: WebhookManager): void {
    this.webhookManager = manager;
  }

  /**
   * 绑定事件到 Webhook
   * 当此事件被 emit 时，自动触发对应 Webhook
   */
  bindToWebhook(event: keyof TEventMap, webhookId: string): void {
    this.eventToWebhookMap.set(event, webhookId);
  }

  /**
   * 解除事件与 Webhook 的绑定
   */
  unbindFromWebhook(event: keyof TEventMap): void {
    this.eventToWebhookMap.delete(event);
  }

  /**
   * 订阅事件
   */
  on<K extends keyof TEventMap>(event: K, handler: EventHandler<TEventMap[K]>): EventSubscription {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
      this.metrics.set(event, {
        totalEmitted: 0,
        totalHandlers: 0,
        errorCount: 0,
      });
    }

    const handlers = this.handlers.get(event)!;
    handlers.add(handler as EventHandler<unknown>);

    const metrics = this.metrics.get(event)!;
    metrics.totalHandlers = handlers.size;

    return {
      unsubscribe: () => this.off(event, handler),
    };
  }

  /**
   * 单次订阅
   */
  once<K extends keyof TEventMap>(event: K, handler: EventHandler<TEventMap[K]>): EventSubscription {
    const subscription = this.on(event, async (data) => {
      subscription.unsubscribe();
      await handler(data);
    });
    return subscription;
  }

  /**
   * 取消订阅
   */
  off<K extends keyof TEventMap>(event: K, handler: EventHandler<TEventMap[K]>): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler<unknown>);
      const metrics = this.metrics.get(event);
      if (metrics) {
        metrics.totalHandlers = handlers.size;
      }
    }
  }

  /**
   * 发射事件
   */
  emit<K extends keyof TEventMap>(event: K, data: TEventMap[K]): void {
    const handlers = this.handlers.get(event);
    if (!handlers || handlers.size === 0) {
      return;
    }

    const metrics = this.metrics.get(event);
    if (metrics) {
      metrics.totalEmitted++;
      metrics.lastEmittedAt = Date.now();
    }

    this.eventHistory.push({
      event,
      data,
      timestamp: Date.now(),
    });

    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    if (this.isAsync) {
      for (const handler of handlers) {
        try {
          Promise.resolve(handler(data)).catch((error) => {
            this.handleError(event, error);
          });
        } catch (error) {
          this.handleError(event, error);
        }
      }
    } else {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          this.handleError(event, error);
        }
      }
    }

    // 自动触发绑定的 Webhook
    this.triggerWebhook(event, data);
  }

  /**
   * 异步发射事件
   */
  async emitAsync<K extends keyof TEventMap>(event: K, data: TEventMap[K]): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers || handlers.size === 0) {
      return;
    }

    const metrics = this.metrics.get(event);
    if (metrics) {
      metrics.totalEmitted++;
      metrics.lastEmittedAt = Date.now();
    }

    this.eventHistory.push({
      event,
      data,
      timestamp: Date.now(),
    });

    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    const promises: Promise<void>[] = [];
    for (const handler of handlers) {
      promises.push(
        Promise.resolve(handler(data)).catch((error) => {
          this.handleError(event, error);
        })
      );
    }

    await Promise.all(promises);

    // 自动触发绑定的 Webhook
    this.triggerWebhook(event, data);
  }

  /**
   * 触发 Webhook
   */
  private triggerWebhook<K extends keyof TEventMap>(event: K, data: TEventMap[K]): void {
    const webhookId = this.eventToWebhookMap.get(event);
    if (!webhookId || !this.webhookManager) {
      return;
    }

    const webhookEvent: WebhookEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      type: String(event),
      data: data as unknown,
      timestamp: Date.now(),
    };

    this.webhookManager.emit(webhookEvent).catch((error) => {
      console.error(`[EventEmitter] Webhook trigger error for ${String(event)}:`, error);
    });
  }

  private handleError<K extends keyof TEventMap>(event: K, error: unknown): void {
    const metrics = this.metrics.get(event);
    if (metrics) {
      metrics.errorCount++;
    }
    console.error(`[EventEmitter] Error in handler for event "${String(event)}":`, error);
  }

  /**
   * 清空所有事件
   */
  clear(): void {
    this.handlers.clear();
    this.metrics.clear();
    this.eventHistory = [];
    this.eventToWebhookMap.clear();
  }

  /**
   * 获取事件处理器数量
   */
  getHandlerCount<K extends keyof TEventMap>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /**
   * 获取总处理器数量
   */
  getTotalHandlerCount(): number {
    let total = 0;
    for (const handlers of this.handlers.values()) {
      total += handlers.size;
    }
    return total;
  }

  /**
   * 获取事件指标
   */
  getMetrics<K extends keyof TEventMap>(event: K): EventMetrics | undefined {
    return this.metrics.get(event);
  }

  /**
   * 获取所有指标
   */
  getAllMetrics(): Map<keyof TEventMap, EventMetrics> {
    return new Map(this.metrics);
  }

  /**
   * 获取事件历史
   */
  getEventHistory(): ReadonlyArray<{
    event: keyof TEventMap;
    data: unknown;
    timestamp: number;
  }> {
    return [...this.eventHistory];
  }

  /**
   * 检查是否有监听器
   */
  hasListeners<K extends keyof TEventMap>(event: K): boolean {
    const handlers = this.handlers.get(event);
    return handlers !== undefined && handlers.size > 0;
  }

  /**
   * 获取监听器数量
   */
  listenerCount<K extends keyof TEventMap>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

/**
 * Webhook 配置接口
 */
export interface WebhookConfig {
  url: string;
  events: string[];
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

/**
 * Webhook 调度器
 */
export class WebhookDispatcher {
  private webhooks: Map<string, WebhookConfig> = new Map();

  constructor() {}

  /**
   * 注册 Webhook
   */
  registerWebhook(id: string, config: WebhookConfig): void {
    this.webhooks.set(id, config);
  }

  /**
   * 注销 Webhook
   */
  unregisterWebhook(id: string): boolean {
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
  listWebhooks(): Array<{ id: string; config: WebhookConfig }> {
    return Array.from(this.webhooks.entries()).map(([id, config]) => ({
      id,
      config,
    }));
  }

  /**
   * 分发事件到所有匹配的 Webhook
   */
  async dispatch(event: string, data: unknown): Promise<void> {
    const matchingWebhooks = Array.from(this.webhooks.values()).filter((webhook) =>
      webhook.events.includes(event) || webhook.events.includes('*')
    );

    const promises = matchingWebhooks.map((webhook) =>
      this.sendWebhook(webhook, event, data)
    );

    await Promise.allSettled(promises);
  }

  /**
   * 发送 Webhook 请求
   */
  private async sendWebhook(
    webhook: WebhookConfig,
    event: string,
    data: unknown,
    attempt: number = 0
  ): Promise<void> {
    const payload = {
      event,
      timestamp: Date.now(),
      data,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), webhook.timeout ?? 10000);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...webhook.headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);

      const maxRetries = webhook.retries ?? 0;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.sendWebhook(webhook, event, data, attempt + 1);
      }

      throw error;
    }
  }
}

/**
 * 代理事件映射
 */
export interface AgentEventMap {
  'tool:execute': { tool: string; input: unknown; output?: string; error?: string };
  'tool:error': { tool: string; error: string; input: unknown };
  'message:send': { role: 'user' | 'assistant'; content: string };
  'message:receive': { role: 'user' | 'assistant'; content: string };
  'error:occur': { code: string; message: string; details?: unknown };
  'token:usage': { promptTokens: number; completionTokens: number; totalTokens: number };
  'session:start': { sessionId: string };
  'session:end': { sessionId: string };
  'config:change': { key: string; value: unknown };
  'circuit:open': { name: string };
  'circuit:close': { name: string };
  'rate:limit': { provider: string; retryAfter?: number };
}

/**
 * 全局事件发射器
 */
export const globalEventEmitter = new EventEmitter<AgentEventMap>();

/**
 * Webhook 调度器（兼容旧接口）
 */
export const webhookDispatcher = new WebhookDispatcher();

/**
 * 全局 Webhook 管理器（集成用）
 */
export const globalWebhookManager = createWebhookManager({
  enableLogging: true,
  defaultTimeout: 10000,
  defaultRetry: {
    maxAttempts: 3,
    delay: 1000,
    exponentialBackoff: true,
  },
});

/**
 * 便捷方法：创建并绑定 Webhook
 *
 * @example
 * ```typescript
 * // 当 tool:error 事件发生时，自动发送通知到 Slack
 * registerWebhookForEvent('tool:error', {
 *   name: '错误通知',
 *   url: 'https://hooks.slack.com/services/xxx',
 *   events: ['tool:error'],
 *   retries: 3,
 * });
 *
 * // 现在任何工具错误都会自动发送到 Slack
 * globalEventEmitter.emit('tool:error', {
 *   tool: 'Bash',
 *   error: 'Permission denied'
 * });
 * ```
 */
export function registerWebhookForEvent(
  event: keyof AgentEventMap,
  config: {
    name: string;
    url: string;
    events: string[];
    headers?: Record<string, string>;
    retries?: number;
  }
): string {
  const webhook = globalWebhookManager.createWebhook({
    name: config.name,
    events: config.events as any,
    destinations: [
      {
        id: `dest_${Date.now()}`,
        name: config.name,
        type: WebhookDestinationType.Http,
        url: config.url,
        headers: config.headers,
        enabled: true,
      },
    ],
    retry: config.retries ? {
      maxAttempts: config.retries,
      delay: 1000,
      exponentialBackoff: true,
    } : undefined,
    enabled: true,
  });

  // 绑定事件到 Webhook
  globalEventEmitter.bindToWebhook(event, webhook.id);

  return webhook.id;
}

/**
 * 便捷方法：移除事件与 Webhook 的绑定
 */
export function unregisterWebhookForEvent(event: keyof AgentEventMap): void {
  globalEventEmitter.unbindFromWebhook(event);
}
