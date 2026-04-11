import { AppError, RateLimitError, NetworkError, safeAsync, isAppError } from './errors.js';

export interface RetryOptions {
  /** 最大重试次数 */
  maxRetries: number;
  /** 初始延迟（毫秒） */
  initialDelay: number;
  /** 最大延迟（毫秒） */
  maxDelay: number;
  /** 退避倍数 */
  backoffMultiplier: number;
  /** 是否随机抖动 */
  jitter: boolean;
  /** 可重试的错误码列表 */
  retryableErrors?: string[];
}

/**
 * 默认重试选项
 */
export const defaultRetryOptions: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: ['RATE_LIMIT', 'NETWORK_ERROR', 'API_ERROR', 'TIMEOUT'],
};

/**
 * 判断错误是否可重试
 */
export function isRetryable(error: unknown, options?: RetryOptions): boolean {
  const retryableErrors = options?.retryableErrors || defaultRetryOptions.retryableErrors || [];

  if (isAppError(error)) {
    return retryableErrors.includes(error.code);
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('rate limit')
    );
  }

  return false;
}

/**
 * 计算延迟时间（带指数退避和抖动）
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelay);

  if (options.jitter) {
    const jitterAmount = cappedDelay * 0.2 * Math.random();
    return cappedDelay + jitterAmount;
  }

  return cappedDelay;
}

/**
 * 带重试的异步执行
 *
 * @example
 * const result = await withRetry(
 *   () => fetchData(),
 *   { maxRetries: 3, initialDelay: 1000 }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...defaultRetryOptions, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxRetries) {
        break;
      }

      if (!isRetryable(error, opts)) {
        throw error;
      }

      const delay = calculateDelay(attempt, opts);
      console.log(`[Retry] Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * 带重试的安全异步执行
 * 返回 Result 类型，不会抛出异常
 */
export async function withRetrySafe<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  errorMessage: string = 'Operation failed after retries'
): Promise<{ success: true; data: T } | { success: false; error: AppError }> {
  return withRetry(() => safeAsync(fn, errorMessage), options).then(result => {
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
  });
}

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  /** 熔断器名称 */
  name?: string;
  /** 失败阈值（打开熔断器） */
  failureThreshold: number;
  /** 半开状态允许的试探请求数 */
  halfOpenRequests: number;
  /** 恢复超时（毫秒） */
  resetTimeout: number;
  /** 监控的时间窗口（毫秒） */
  windowSize: number;
}

/**
 * 默认熔断器选项
 */
export const defaultCircuitBreakerOptions: Required<CircuitBreakerOptions> = {
  name: 'default',
  failureThreshold: 5,
  halfOpenRequests: 3,
  resetTimeout: 30000,
  windowSize: 60000,
};

/**
 * 熔断器状态
 */
interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  halfOpenRequestsMade: number;
}

/**
 * 熔断器错误
 */
export class CircuitBreakerError extends AppError {
  constructor(
    public readonly circuitName: string,
    message: string = 'Circuit breaker is open'
  ) {
    super(message, 'CIRCUIT_BREAKER', 503);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * 熔断器类
 *
 * 防止级联故障的保护机制
 *
 * 状态转换：
 * - Closed（关闭）：正常请求，失败累积
 * - Open（打开）：快速失败，不执行请求
 * - Half-Open（半开）：允许试探请求，成功后恢复
 *
 * @example
 * const breaker = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 30000 });
 *
 * try {
 *   const result = await breaker.execute(() => riskyOperation());
 * } catch (error) {
 *   if (error instanceof CircuitBreakerError) {
 *     console.log('服务暂时不可用');
 *   }
 * }
 */
export class CircuitBreaker {
  private options: Required<CircuitBreakerOptions>;
  private state: CircuitBreakerState = {
    state: 'closed',
    failureCount: 0,
    successCount: 0,
    lastFailureTime: null,
    halfOpenRequestsMade: 0,
  };
  private windowStart: number = Date.now();

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    const merged = { ...defaultCircuitBreakerOptions, ...options };
    this.options = {
      name: merged.name,
      failureThreshold: merged.failureThreshold,
      halfOpenRequests: merged.halfOpenRequests,
      resetTimeout: merged.resetTimeout,
      windowSize: merged.windowSize,
    };
  }

  /**
   * 执行受保护的操作
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('half_open');
      } else {
        throw new CircuitBreakerError(
          this.options.name,
          `Circuit breaker '${this.options.name}' is open`
        );
      }
    }

    try {
      const result = await fn();

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();

      if (this.state.state === 'open') {
        throw new CircuitBreakerError(
          this.options.name,
          `Circuit breaker '${this.options.name}' is open due to recent failures`
        );
      }

      throw error;
    }
  }

  /**
   * 判断是否应该尝试重置
   */
  private shouldAttemptReset(): boolean {
    if (!this.state.lastFailureTime) return false;
    return Date.now() - this.state.lastFailureTime >= this.options.resetTimeout;
  }

  /**
   * 成功时的处理
   */
  private onSuccess(): void {
    if (this.state.state === 'half_open') {
      this.state.successCount++;

      if (this.state.successCount >= this.options.halfOpenRequests) {
        this.transitionTo('closed');
      }
    } else {
      this.state.failureCount = 0;
    }
  }

  /**
   * 失败时的处理
   */
  private onFailure(): void {
    this.state.lastFailureTime = Date.now();

    if (this.state.state === 'half_open') {
      this.transitionTo('open');
      return;
    }

    this.state.failureCount++;

    if (this.state.failureCount >= this.options.failureThreshold) {
      this.transitionTo('open');
    }
  }

  /**
   * 状态转换
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state.state;
    this.state.state = newState;

    switch (newState) {
      case 'closed':
        this.state.failureCount = 0;
        this.state.successCount = 0;
        this.windowStart = Date.now();
        break;

      case 'open':
        this.state.halfOpenRequestsMade = 0;
        break;

      case 'half_open':
        this.state.successCount = 0;
        this.state.halfOpenRequestsMade = 0;
        break;
    }

    console.log(`[CircuitBreaker:${this.options.name}] ${oldState} -> ${newState}`);
  }

  /**
   * 获取当前状态
   */
  getState(): CircuitState {
    return this.state.state;
  }

  /**
   * 获取熔断器统计信息
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    successes: number;
    windowStart: number;
  } {
    return {
      state: this.state.state,
      failures: this.state.failureCount,
      successes: this.state.successCount,
      windowStart: this.windowStart,
    };
  }

  /**
   * 重置熔断器
   */
  reset(): void {
    this.state = {
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      halfOpenRequestsMade: 0,
    };
    this.windowStart = Date.now();
  }
}

/**
 * 熔断器注册表
 * 管理多个熔断器实例
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * 获取或创建熔断器
   */
  get(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    let breaker = this.breakers.get(name);

    if (!breaker) {
      const opts: CircuitBreakerOptions = {
        name,
        failureThreshold: options?.failureThreshold ?? defaultCircuitBreakerOptions.failureThreshold,
        halfOpenRequests: options?.halfOpenRequests ?? defaultCircuitBreakerOptions.halfOpenRequests,
        resetTimeout: options?.resetTimeout ?? defaultCircuitBreakerOptions.resetTimeout,
        windowSize: options?.windowSize ?? defaultCircuitBreakerOptions.windowSize,
      };
      breaker = new CircuitBreaker(opts);
      this.breakers.set(name, breaker);
    }

    return breaker;
  }

  /**
   * 获取所有熔断器统计
   */
  getAllStats(): Record<string, ReturnType<CircuitBreaker['getStats']>> {
    const stats: Record<string, ReturnType<CircuitBreaker['getStats']>> = {};

    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }

    return stats;
  }

  /**
   * 重置所有熔断器
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

export interface ErrorRecoveryStrategy {
  /** 策略名称 */
  name: string;
  /** 判断是否适用此策略 */
  canHandle: (error: AppError) => boolean;
  /** 执行恢复 */
  recover: (error: AppError) => Promise<void>;
}

/**
 * 错误恢复策略注册表
 */
export class RecoveryStrategyRegistry {
  private strategies: ErrorRecoveryStrategy[] = [];

  /**
   * 注册恢复策略
   */
  register(strategy: ErrorRecoveryStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * 查找适用的策略
   */
  findStrategy(error: AppError): ErrorRecoveryStrategy | undefined {
    return this.strategies.find(s => s.canHandle(error));
  }

  /**
   * 执行恢复
   */
  async recover(error: AppError): Promise<boolean> {
    const strategy = this.findStrategy(error);

    if (strategy) {
      await strategy.recover(error);
      return true;
    }

    return false;
  }
}

export const recoveryStrategies = new RecoveryStrategyRegistry();

recoveryStrategies.register({
  name: 'rate_limit',
  canHandle: (error) => error instanceof RateLimitError,
  recover: async (error) => {
    const retryAfter = (error.details?.retryAfter as number) || 60;
    console.log(`[Recovery] Rate limited. Waiting ${retryAfter} seconds before retry...`);
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
  },
});

recoveryStrategies.register({
  name: 'network',
  canHandle: (error) => error instanceof NetworkError,
  recover: async () => {
    console.log('[Recovery] Network error. Consider checking your connection.');
  },
});
