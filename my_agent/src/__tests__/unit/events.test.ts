/**
 * 事件系统单元测试
 *
 * 测试事件发射器、Webhook 管理器、装饰器
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEventEmitter,
  EventEmitterImpl,
} from '../../events/emitter.js';
import {
  WebhookManagerImpl,
} from '../../events/webhook.js';
import {
  WebhookEventType,
  WebhookDestinationType,
} from '../../events/types.js';

describe('EventEmitter', () => {
  let emitter: EventEmitterImpl;

  beforeEach(() => {
    emitter = new EventEmitterImpl();
  });

  describe('基本功能', () => {
    it('should emit and receive events', () => {
      let receivedData: string | null = null;

      emitter.on('test', (event) => {
        receivedData = event.data as string;
      });

      emitter.emit('test', 'hello');

      expect(receivedData).toBe('hello');
    });

    it('should support multiple listeners', () => {
      let count = 0;

      emitter.on('test', () => count++);
      emitter.on('test', () => count++);

      emitter.emit('test', 'data');

      expect(count).toBe(2);
    });

    it('should return unsubscribe function', () => {
      let count = 0;

      const unsubscribe = emitter.on('test', () => count++);

      emitter.emit('test', 'data');
      expect(count).toBe(1);

      unsubscribe();

      emitter.emit('test', 'data');
      expect(count).toBe(1);
    });
  });

  describe('once', () => {
    it('should only trigger once', () => {
      let count = 0;

      emitter.once('test', () => count++);

      emitter.emit('test', 'data1');
      emitter.emit('test', 'data2');
      emitter.emit('test', 'data3');

      expect(count).toBe(1);
    });
  });

  describe('off', () => {
    it('should remove all listeners for event type', () => {
      let count = 0;

      emitter.on('test', () => count++);
      emitter.on('test', () => count++);

      emitter.off('test');

      emitter.emit('test', 'data');

      expect(count).toBe(0);
    });
  });

  describe('listenerCount', () => {
    it('should return correct count', () => {
      expect(emitter.listenerCount('test')).toBe(0);

      emitter.on('test', () => {});
      emitter.on('test', () => {});

      expect(emitter.listenerCount('test')).toBe(2);
    });

    it('should return total count when no type specified', () => {
      emitter.on('test1', () => {});
      emitter.on('test2', () => {});

      expect(emitter.listenerCount()).toBe(2);
    });
  });

  describe('hasListeners', () => {
    it('should return true when listeners exist', () => {
      emitter.on('test', () => {});

      expect(emitter.hasListeners('test')).toBe(true);
      expect(emitter.hasListeners('other')).toBe(false);
    });
  });
});

describe('WebhookManager', () => {
  let manager: WebhookManagerImpl;

  beforeEach(() => {
    manager = new WebhookManagerImpl();
  });

  describe('Webhook CRUD', () => {
    it('should create webhook', () => {
      const webhook = manager.createWebhook({
        name: 'Test Webhook',
        events: [WebhookEventType.FileChanged],
        destinations: [],
        enabled: true,
      });

      expect(webhook.id).toBeTruthy();
      expect(webhook.name).toBe('Test Webhook');
    });

    it('should get webhook', () => {
      const created = manager.createWebhook({
        name: 'Test',
        events: [WebhookEventType.FileChanged],
        destinations: [],
        enabled: true,
      });

      const retrieved = manager.getWebhook(created.id);

      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Test');
    });

    it('should update webhook', () => {
      const webhook = manager.createWebhook({
        name: 'Test',
        events: [WebhookEventType.FileChanged],
        destinations: [],
        enabled: true,
      });

      manager.updateWebhook(webhook.id, { name: 'Updated' });

      expect(manager.getWebhook(webhook.id)?.name).toBe('Updated');
    });

    it('should delete webhook', () => {
      const webhook = manager.createWebhook({
        name: 'Test',
        events: [WebhookEventType.FileChanged],
        destinations: [],
        enabled: true,
      });

      const deleted = manager.deleteWebhook(webhook.id);

      expect(deleted).toBe(true);
      expect(manager.getWebhook(webhook.id)).toBeUndefined();
    });

    it('should list webhooks', () => {
      manager.createWebhook({
        name: 'Webhook 1',
        events: [],
        destinations: [],
        enabled: true,
      });

      manager.createWebhook({
        name: 'Webhook 2',
        events: [],
        destinations: [],
        enabled: true,
      });

      const webhooks = manager.listWebhooks();

      expect(webhooks.length).toBe(2);
    });
  });

  describe('Enable/Disable', () => {
    it('should enable webhook', () => {
      const webhook = manager.createWebhook({
        name: 'Test',
        events: [],
        destinations: [],
        enabled: false,
      });

      manager.enableWebhook(webhook.id);

      expect(manager.getWebhook(webhook.id)?.enabled).toBe(true);
    });

    it('should disable webhook', () => {
      const webhook = manager.createWebhook({
        name: 'Test',
        events: [],
        destinations: [],
        enabled: true,
      });

      manager.disableWebhook(webhook.id);

      expect(manager.getWebhook(webhook.id)?.enabled).toBe(false);
    });
  });

  describe('emit', () => {
    it('should emit event to matching webhooks', async () => {
      let called = false;

      manager.createWebhook({
        name: 'Test',
        events: [WebhookEventType.FileChanged],
        destinations: [
          {
            id: 'dest1',
            name: 'Callback',
            type: WebhookDestinationType.Callback,
            callback: () => {
              called = true;
            },
            enabled: true,
          },
        ],
        enabled: true,
      });

      await manager.emit({
        id: 'evt1',
        type: WebhookEventType.FileChanged,
        data: { path: '/test/file.txt' },
        timestamp: Date.now(),
      });

      expect(called).toBe(true);
    });

    it('should not emit to disabled webhooks', async () => {
      let called = false;

      manager.createWebhook({
        name: 'Test',
        events: [WebhookEventType.FileChanged],
        destinations: [
          {
            id: 'dest1',
            name: 'Callback',
            type: WebhookDestinationType.Callback,
            callback: () => {
              called = true;
            },
            enabled: true,
          },
        ],
        enabled: false,
      });

      const results = await manager.emit({
        id: 'evt1',
        type: WebhookEventType.FileChanged,
        data: {},
        timestamp: Date.now(),
      });

      expect(called).toBe(false);
      expect(results.every((r) => !r.success)).toBe(true);
    });
  });

  describe('subscribe', () => {
    it('should subscribe to events', async () => {
      let received: unknown = null;

      const unsubscribe = manager.on(WebhookEventType.FileChanged, (event) => {
        received = event.data;
      });

      await manager.emit({
        id: 'evt1',
        type: WebhookEventType.FileChanged,
        data: { test: true },
        timestamp: Date.now(),
      });

      expect(received).toEqual({ test: true });

      unsubscribe();
    });
  });
});

describe('EventEmitter with Cancellation', () => {
  it('should respect cancellation token', () => {
    let count = 0;

    const emitter = createEventEmitter({
      isCancelled: false,
      cancel: () => {},
    });

    emitter.on('test', () => count++);

    emitter.emit('test', 'data1');
    expect(count).toBe(1);
  });
});
