/**
 * 事件发射器实现
 *
 * 提供事件订阅、取消订阅、发射功能
 * 支持一次性监听和持续监听
 */

import type {
  WebhookEvent,
  WebhookCallback,
  WebhookContext,
  EventEmitter,
  CancellationToken,
} from './types.js';
import { generateEventId, createCancellationToken } from './types.js';

/**
 * 监听器配置
 */
interface ListenerConfig {
  /** 监听器函数 */
  callback: WebhookCallback;
  /** 取消令牌 */
  cancelToken?: CancellationToken;
  /** 是否只监听一次 */
  once: boolean;
}

/**
 * 事件发射器实现
 */
export class EventEmitterImpl implements EventEmitter {
  // 事件类型 -> 监听器列表
  private listeners = new Map<string, ListenerConfig[]>();

  // 全局取消令牌
  private globalCancelToken?: CancellationToken;

  constructor(cancelToken?: CancellationToken) {
    this.globalCancelToken = cancelToken;
  }

  /**
   * 发射事件
   *
   * @param type - 事件类型
   * @param data - 事件数据
   * @param metadata - 事件元数据
   */
  emit<T>(
    type: string,
    data: T,
    metadata?: Record<string, unknown>
  ): void {
    const event: WebhookEvent<T> = {
      id: generateEventId(),
      type,
      data,
      timestamp: Date.now(),
      metadata,
    };

    const listeners = this.listeners.get(type) || [];

    // 收集需要移除的监听器
    const toRemove: ListenerConfig[] = [];

    for (const config of listeners) {
      // 检查取消状态
      if (config.cancelToken?.isCancelled || this.globalCancelToken?.isCancelled) {
        continue;
      }

      // 创建上下文
      const context: WebhookContext = {
        webhookId: '',
        destinationId: '',
        attempt: 0,
        timestamp: Date.now(),
        cancelToken: config.cancelToken,
      };

      try {
        // 执行监听器
        const result = config.callback(event, context);

        // 如果返回 Promise，在后台等待但不阻塞
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error(`Event listener error for ${type}:`, error);
          });
        }

        // 如果是一次性监听器，标记移除
        if (config.once) {
          toRemove.push(config);
        }
      } catch (error) {
        console.error(`Event listener error for ${type}:`, error);
      }
    }

    // 移除一次性监听器
    for (const config of toRemove) {
      this.removeListener(type, config);
    }
  }

  /**
   * 监听事件
   *
   * @param type - 事件类型
   * @param listener - 监听器函数
   * @returns 取消订阅函数
   */
  on<T>(
    type: string,
    listener: (event: WebhookEvent<T>, context: WebhookContext) => void
  ): () => void {
    return this.addListener(type, listener, false);
  }

  /**
   * 单次监听
   *
   * @param type - 事件类型
   * @param listener - 监听器函数
   * @returns 取消订阅函数
   */
  once<T>(
    type: string,
    listener: (event: WebhookEvent<T>, context: WebhookContext) => void
  ): () => void {
    return this.addListener(type, listener, true);
  }

  /**
   * 添加监听器
   */
  private addListener<T>(
    type: string,
    listener: (event: WebhookEvent<T>, context: WebhookContext) => void,
    once: boolean
  ): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }

    const config: ListenerConfig = {
      callback: listener as WebhookCallback,
      cancelToken: createCancellationToken(),
      once,
    };

    this.listeners.get(type)!.push(config);

    // 返回取消订阅函数
    return () => {
      this.removeListener(type, config);
    };
  }

  /**
   * 移除监听器
   */
  private removeListener(type: string, config: ListenerConfig): void {
    const listeners = this.listeners.get(type);
    if (!listeners) return;

    const index = listeners.indexOf(config);
    if (index !== -1) {
      listeners.splice(index, 1);
    }

    // 如果没有监听器了，删除事件类型
    if (listeners.length === 0) {
      this.listeners.delete(type);
    }
  }

  /**
   * 移除所有指定类型的监听器
   */
  off(type: string): void {
    this.listeners.delete(type);
  }

  /**
   * 移除所有监听器
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  /**
   * 获取监听器数量
   */
  listenerCount(type?: string): number {
    if (type) {
      return this.listeners.get(type)?.length || 0;
    }

    let count = 0;
    for (const listeners of this.listeners.values()) {
      count += listeners.length;
    }
    return count;
  }

  /**
   * 检查是否有指定类型的监听器
   */
  hasListeners(type: string): boolean {
    return (this.listeners.get(type)?.length || 0) > 0;
  }
}

/**
 * 创建事件发射器
 *
 * @param cancelToken - 全局取消令牌
 * @returns 事件发射器实例
 */
export function createEventEmitter(cancelToken?: CancellationToken): EventEmitter {
  return new EventEmitterImpl(cancelToken);
}
