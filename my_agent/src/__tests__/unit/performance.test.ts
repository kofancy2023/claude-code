import { describe, it, expect, beforeEach } from 'vitest';
import {
  LRUCache,
  ConcurrencyController,
  TimedCache,
} from '../../utils/performance.js';

describe('LRUCache', () => {
  let cache: LRUCache<string, string>;

  beforeEach(() => {
    cache = new LRUCache<string, string>(3);
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for non-existent keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should evict least recently used item when full', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4');

    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key4')).toBe('value4');
  });

  it('should check existence', () => {
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('key2')).toBe(false);
  });

  it('should delete entries', () => {
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.get('key1')).toBeUndefined();
  });

  it('should clear all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('ConcurrencyController', () => {
  it('should execute task successfully', async () => {
    const controller = new ConcurrencyController({ maxConcurrent: 2 });

    const result = await controller.run(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'done';
    });

    expect(result).toBe('done');
  });

  it('should track running count', async () => {
    const controller = new ConcurrencyController({ maxConcurrent: 5 });

    const p1 = controller.run(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 'task1';
    });

    const stats = controller.getStats();
    expect(stats.running).toBeGreaterThanOrEqual(1);

    await p1;
  });

  it('should report idle when empty', async () => {
    const controller = new ConcurrencyController({ maxConcurrent: 5 });
    expect(controller.isIdle()).toBe(true);
  });
});

describe('TimedCache', () => {
  it('should store and retrieve values', () => {
    const cache = new TimedCache<string, string>({ ttlMs: 1000 });
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should evict oldest when full', () => {
    const cache = new TimedCache<string, string>({ maxSize: 3 });
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4');

    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key4')).toBe('value4');
  });

  it('should delete entries', () => {
    const cache = new TimedCache<string, string>();
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.get('key1')).toBeUndefined();
  });
});
