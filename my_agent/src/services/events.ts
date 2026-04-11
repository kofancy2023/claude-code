/**
 * 事件系统模块
 *
 * 提供统一的事件发射/监听机制，支持：
 * - 同步/异步事件处理
 * - 事件订阅/取消订阅
 * - 错误处理和传播
 * - 事件历史记录
 */

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

  constructor(options: {
    maxHistorySize?: number;
    async?: boolean;
  } = {}) {
    this.maxHistorySize = options.maxHistorySize ?? 100;
    this.isAsync = options.async ?? true;
  }

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

  once<K extends keyof TEventMap>(event: K, handler: EventHandler<TEventMap[K]>): EventSubscription {
    const subscription = this.on(event, async (data) => {
      subscription.unsubscribe();
      await handler(data);
    });
    return subscription;
  }

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
  }

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
  }

  private handleError<K extends keyof TEventMap>(event: K, error: unknown): void {
    const metrics = this.metrics.get(event);
    if (metrics) {
      metrics.errorCount++;
    }
    console.error(`[EventEmitter] Error in handler for event "${String(event)}":`, error);
  }

  clear(): void {
    this.handlers.clear();
    this.metrics.clear();
    this.eventHistory = [];
  }

  getHandlerCount<K extends keyof TEventMap>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  getTotalHandlerCount(): number {
    let total = 0;
    for (const handlers of this.handlers.values()) {
      total += handlers.size;
    }
    return total;
  }

  getMetrics<K extends keyof TEventMap>(event: K): EventMetrics | undefined {
    return this.metrics.get(event);
  }

  getAllMetrics(): Map<keyof TEventMap, EventMetrics> {
    return new Map(this.metrics);
  }

  getEventHistory(): ReadonlyArray<{
    event: keyof TEventMap;
    data: unknown;
    timestamp: number;
  }> {
    return [...this.eventHistory];
  }

  hasListeners<K extends keyof TEventMap>(event: K): boolean {
    const handlers = this.handlers.get(event);
    return handlers !== undefined && handlers.size > 0;
  }

  listenerCount<K extends keyof TEventMap>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

export interface WebhookConfig {
  url: string;
  events: string[];
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

export class WebhookDispatcher {
  private webhooks: Map<string, WebhookConfig> = new Map();

  constructor() {}

  registerWebhook(id: string, config: WebhookConfig): void {
    this.webhooks.set(id, config);
  }

  unregisterWebhook(id: string): boolean {
    return this.webhooks.delete(id);
  }

  getWebhook(id: string): WebhookConfig | undefined {
    return this.webhooks.get(id);
  }

  listWebhooks(): Array<{ id: string; config: WebhookConfig }> {
    return Array.from(this.webhooks.entries()).map(([id, config]) => ({
      id,
      config,
    }));
  }

  async dispatch(event: string, data: unknown): Promise<void> {
    const matchingWebhooks = Array.from(this.webhooks.values()).filter((webhook) =>
      webhook.events.includes(event) || webhook.events.includes('*')
    );

    const promises = matchingWebhooks.map((webhook) =>
      this.sendWebhook(webhook, event, data)
    );

    await Promise.allSettled(promises);
  }

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

export const globalEventEmitter = new EventEmitter<AgentEventMap>();
export const webhookDispatcher = new WebhookDispatcher();
