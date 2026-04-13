/**
 * 事件系统模块
 *
 * 提供完整的事件订阅、触发和管理功能
 */

// 类型定义
export * from './types.js';

// 事件发射器
export { EventEmitterImpl, createEventEmitter } from './emitter.js';

// Webhook 管理器
export { WebhookManagerImpl, createWebhookManager } from './webhook.js';
export type { WebhookManagerOptions } from './webhook.js';

// 回调装饰器
export { OnEvent, Debounce, Throttle, Retry, ConcurrencyLimit } from './decorators.js';
