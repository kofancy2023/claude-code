/**
 * 回调装饰器
 *
 * 提供基于装饰器的事件订阅功能
 *
 * 使用示例：
 * ```typescript
 * // 使用装饰器订阅事件
 * class MyService {
 *   @OnEvent('file:changed')
 *   handleFileChange(this: void, event: WebhookEvent, context: WebhookContext) {
 *     console.log('File changed:', event.data);
 *   }
 * }
 * ```
 */

import type { WebhookEvent, WebhookContext } from './types.js';

/**
 * 事件监听器选项
 */
interface EventListenerOptions {
  /** 是否只监听一次 */
  once?: boolean;
  /** 过滤器 */
  filter?: (event: WebhookEvent) => boolean;
}

/**
 * 事件订阅装饰器工厂
 *
 * @param _eventType - 事件类型
 * @param options - 监听选项
 */
export function OnEvent(
  _eventType: string,
  options?: EventListenerOptions
): MethodDecorator {
  return function (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    if (typeof originalMethod !== 'function') {
      throw new Error('@OnEvent decorator requires a method');
    }

    descriptor.value = async function (
      event: WebhookEvent,
      context: WebhookContext
    ): Promise<void> {
      // 应用过滤器
      if (options?.filter && !options.filter(event)) {
        return;
      }

      // 调用原始方法
      const result = originalMethod.call(this, event, context);
      if (result instanceof Promise) {
        await result;
      }
    };

    return descriptor;
  };
}

/**
 * 防抖装饰器
 * 限制事件处理函数的调用频率
 *
 * @param wait - 等待时间 (毫秒)
 */
export function Debounce(wait: number): MethodDecorator {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    if (typeof originalMethod !== 'function') {
      throw new Error('@Debounce decorator requires a method');
    }

    descriptor.value = function (
      event: WebhookEvent,
      context: WebhookContext
    ): void {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const self = this;
      timeoutId = setTimeout(() => {
        originalMethod.call(self, event, context);
      }, wait);
    };

    return descriptor;
  };
}

/**
 * 节流装饰器
 * 确保事件处理函数在指定时间内只执行一次
 *
 * @param limit - 时间限制 (毫秒)
 */
export function Throttle(limit: number): MethodDecorator {
  let lastRun = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    if (typeof originalMethod !== 'function') {
      throw new Error('@Throttle decorator requires a method');
    }

    descriptor.value = function (
      event: WebhookEvent,
      context: WebhookContext
    ): void {
      const now = Date.now();
      const self = this;

      if (now - lastRun >= limit) {
        lastRun = now;
        originalMethod.call(self, event, context);
      } else {
        // 安排最后一次调用
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        const remaining = limit - (now - lastRun);
        timeoutId = setTimeout(() => {
          lastRun = Date.now();
          originalMethod.call(self, event, context);
        }, remaining);
      }
    };

    return descriptor;
  };
}

/**
 * 重试装饰器
 * 自动重试失败的事件处理
 *
 * @param maxAttempts - 最大重试次数
 * @param delay - 重试延迟 (毫秒)
 */
export function Retry(
  maxAttempts: number,
  delay: number = 1000
): MethodDecorator {
  return function (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    if (typeof originalMethod !== 'function') {
      throw new Error('@Retry decorator requires a method');
    }

    descriptor.value = async function (
      event: WebhookEvent,
      context: WebhookContext
    ): Promise<void> {
      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = originalMethod.call(this, event, context);
          if (result instanceof Promise) {
            await result;
          }
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError;
    };

    return descriptor;
  };
}

/**
 * 异步并发限制装饰器
 * 限制同时处理的事件数量
 *
 * @param limit - 最大并发数
 */
export function ConcurrencyLimit(limit: number): MethodDecorator {
  let running = 0;
  const queue: Array<() => void> = [];

  return function (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    if (typeof originalMethod !== 'function') {
      throw new Error('@ConcurrencyLimit decorator requires a method');
    }

    descriptor.value = async function (
      event: WebhookEvent,
      context: WebhookContext
    ): Promise<void> {
      const self = this;

      if (running >= limit) {
        // 加入队列
        await new Promise<void>((resolve) => {
          queue.push(resolve);
        });
      }

      running++;

      try {
        const result = originalMethod.call(self, event, context);
        if (result instanceof Promise) {
          await result;
        }
      } finally {
        running--;

        // 处理队列中的下一个
        if (queue.length > 0) {
          const next = queue.shift();
          next?.();
        }
      }
    };

    return descriptor;
  };
}
