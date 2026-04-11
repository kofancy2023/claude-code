/**
 * 性能优化工具模块
 *
 * 包含：
 * - LRU 缓存
 * - 并发控制器
 * - 请求去重器
 */

export class LRUCache<K, V> {
  private cache: Map<K, V> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }

    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  values(): IterableIterator<V> {
    return this.cache.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }
}

export interface ConcurrencyControllerOptions {
  maxConcurrent: number;
  maxQueueSize?: number;
}

export class ConcurrencyController {
  private running: number = 0;
  private waiting: Array<() => void> = [];
  private maxConcurrent: number;
  private maxQueueSize: number;
  private failedCount: number = 0;
  private successCount: number = 0;

  constructor(options: ConcurrencyControllerOptions) {
    this.maxConcurrent = options.maxConcurrent;
    this.maxQueueSize = options.maxQueueSize || Infinity;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrent) {
      if (this.waiting.length >= this.maxQueueSize) {
        throw new Error('Queue is full, cannot acquire concurrency slot');
      }

      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
      });
    }

    this.running++;

    try {
      const result = await fn();
      this.successCount++;
      return result;
    } catch (error) {
      this.failedCount++;
      throw error;
    } finally {
      this.running--;
      const next = this.waiting.shift();
      if (next) {
        next();
      }
    }
  }

  getStats(): {
    running: number;
    waiting: number;
    successCount: number;
    failedCount: number;
  } {
    return {
      running: this.running,
      waiting: this.waiting.length,
      successCount: this.successCount,
      failedCount: this.failedCount,
    };
  }

  isIdle(): boolean {
    return this.running === 0 && this.waiting.length === 0;
  }

  async waitForIdle(): Promise<void> {
    while (!this.isIdle()) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  reset(): void {
    this.waiting = [];
    this.running = 0;
    this.failedCount = 0;
    this.successCount = 0;
  }
}

export class RequestDeduplicator {
  private pending: Map<string, Promise<unknown>> = new Map();
  private completed: LRUCache<string, unknown> = new LRUCache(1000);
  private ttl: number;

  constructor(ttlMs: number = 60000) {
    this.ttl = ttlMs;
  }

  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const cached = this.completed.get(key);
    if (cached !== undefined) {
      return cached as T;
    }

    const existing = this.pending.get(key);
    if (existing !== undefined) {
      return existing as Promise<T>;
    }

    const promise = fn().finally(() => {
      this.pending.delete(key);
      this.completed.set(key, promise);
    });

    this.pending.set(key, promise);

    const result = await promise;
    this.completed.set(key, result);

    setTimeout(() => {
      this.completed.delete(key);
    }, this.ttl);

    return result;
  }

  hasPending(key: string): boolean {
    return this.pending.has(key);
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  clear(): void {
    this.pending.clear();
    this.completed.clear();
  }
}

export interface CacheOptions {
  maxSize?: number;
  ttlMs?: number;
}

export class TimedCache<K, V> {
  private cache: Map<K, { value: V; expiresAt: number }> = new Map();
  private maxSize: number;
  private ttlMs: number;
  private cleanupTimer?: ReturnType<typeof setTimeout>;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || 100;
    this.ttlMs = options.ttlMs || 60000;
    this.startCleanup();
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (entry === undefined) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this.ttlMs),
    });
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);

    if (entry === undefined) {
      return false;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.ttlMs);
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(options: { maxTokens: number; refillPerSecond: number }) {
    this.maxTokens = options.maxTokens;
    this.tokens = options.maxTokens;
    this.refillRate = options.refillPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire(tokens: number = 1): Promise<void> {
    this.refill();

    while (this.tokens < tokens) {
      const waitTime = (tokens - this.tokens) / this.refillRate * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.refill();
    }

    this.tokens -= tokens;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

export const globalCache = new TimedCache<string, unknown>({ maxSize: 500, ttlMs: 300000 });
export const toolConcurrency = new ConcurrencyController({ maxConcurrent: 5 });
export const requestDeduplicator = new RequestDeduplicator(60000);
export const apiRateLimiter = new RateLimiter({ maxTokens: 60, refillPerSecond: 10 });
