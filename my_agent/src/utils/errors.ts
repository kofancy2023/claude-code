/**
 * 应用错误基类
 *
 * 所有自定义错误的父类，提供统一的错误结构：
 * - code: 错误码，便于程序化处理
 * - statusCode: HTTP 状态码（如果有）
 * - details: 附加的详细信息
 *
 * @example
 * throw new AppError('Something went wrong', 'INTERNAL_ERROR', 500);
 */
export class AppError extends Error {
  constructor(
    /** 错误消息 */
    message: string,
    /** 错误代码 */
    public code: string,
    /** HTTP 状态码（可选）*/
    public statusCode?: number,
    /** 附加的详细信息（可选）*/
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * 将错误转换为 JSON 格式
   * 用于日志记录或 API 响应
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * 验证错误
 * 当输入参数验证失败时抛出
 *
 * @example
 * throw new ValidationError('Invalid email format', { field: 'email' });
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * 认证错误
 * 当用户认证失败时抛出（如 API Key 无效）
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTH_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * 授权错误
 * 当用户没有权限执行某操作时抛出
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * 资源未找到错误
 * 当请求的资源不存在时抛出
 *
 * @example
 * throw new NotFoundError('User');
 */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/**
 * 速率限制错误
 * 当 API 请求频率超限时抛出
 *
 * @example
 * throw new RateLimitError(60); // 60 秒后可重试
 */
export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super('Rate limit exceeded', 'RATE_LIMIT', 429, { retryAfter });
    this.name = 'RateLimitError';
  }
}

/**
 * API 错误
 * 当外部 API 调用失败时抛出
 *
 * @example
 * throw new APIError('OpenAI API error', 502);
 */
export class APIError extends AppError {
  constructor(
    message: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message, 'API_ERROR', statusCode, details);
    this.name = 'APIError';
  }
}

/**
 * 网络错误
 * 当网络请求失败时抛出（如连接超时、DNS 失败）
 */
export class NetworkError extends AppError {
  constructor(message: string = 'Network request failed') {
    super(message, 'NETWORK_ERROR', 0);
    this.name = 'NetworkError';
  }
}

/**
 * 工具执行错误
 * 当工具执行过程中发生错误时抛出
 *
 * @example
 * throw new ToolExecutionError('BashTool', 'Command timed out');
 */
export class ToolExecutionError extends AppError {
  constructor(
    toolName: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(`Tool '${toolName}' execution failed: ${message}`, 'TOOL_EXECUTION_ERROR', 0, { toolName, ...details });
    this.name = 'ToolExecutionError';
  }
}

/**
 * 配置错误
 * 当配置项缺失或无效时抛出
 *
 * @example
 * throw new ConfigurationError('Missing API key', 'ANTHROPIC_API_KEY');
 */
export class ConfigurationError extends AppError {
  constructor(message: string, configKey?: string) {
    super(message, 'CONFIGURATION_ERROR', 0, configKey ? { configKey } : undefined);
    this.name = 'ConfigurationError';
  }
}

/**
 * 判断是否为 AppError 实例
 * @param error 任意错误对象
 * @returns 是否为 AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * 获取错误消息
 * 统一从各种错误类型中提取消息字符串
 * @param error 任意错误对象
 * @returns 错误消息字符串
 */
export function getErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * 获取错误代码
 * 从 AppError 或标准 Error 中提取错误代码
 * @param error 任意错误对象
 * @returns 错误代码字符串
 */
export function getErrorCode(error: unknown): string {
  if (isAppError(error)) {
    return error.code;
  }
  if (error instanceof Error) {
    return 'UNKNOWN_ERROR';
  }
  return 'UNKNOWN_ERROR';
}

/**
 * 格式化错误为字符串
 * 用于日志输出或用户显示
 *
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   console.log(formatError(error));
 *   // → [API_ERROR] Request failed: Connection timeout
 *   //   Details: { "originalError": "ECONNREFUSED" }
 * }
 */
export function formatError(error: unknown): string {
  if (isAppError(error)) {
    const details = error.details ? `\nDetails: ${JSON.stringify(error.details, null, 2)}` : '';
    return `[${error.code}] ${error.message}${details}`;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return `Unknown error: ${String(error)}`;
}

/**
 * 安全异步执行包装器
 * 将 Promise 结果转换为 Result 类型，避免未处理的 Promise 拒绝
 *
 * @example
 * const result = await safeAsync(
 *   () => fetchUserData(userId),
 *   'Failed to fetch user'
 * );
 *
 * if (!result.success) {
 *   console.log(result.error.code); // 'NOT_FOUND'
 *   console.log(result.error.message);
 *   return;
 * }
 *
 * console.log(result.data);
 */
export function safeAsync<T>(
  /** 异步函数 */
  fn: () => Promise<T>,
  /** 默认错误消息 */
  errorMessage: string = 'An error occurred'
): Promise<{ success: true; data: T } | { success: false; error: AppError }> {
  return fn()
    .then((data): { success: true; data: T } => ({ success: true, data }))
    .catch((error) => {
      const appError = normalizeError(error, errorMessage);
      return { success: false, error: appError };
    });
}

/**
 * 标准化错误
 * 将任意错误对象转换为 AppError 实例
 * @param error 原始错误对象
 * @param defaultMessage 默认错误消息
 * @returns AppError 实例
 */
export function normalizeError(error: unknown, defaultMessage?: string): AppError {
  if (isAppError(error)) {
    return error;
  }
  if (error instanceof Error) {
    if (defaultMessage) {
      return new AppError(defaultMessage, 'INTERNAL_ERROR', 0, { originalError: error.message });
    }
    return new AppError(error.message, 'INTERNAL_ERROR', 0);
  }
  return new AppError(defaultMessage || 'Unknown error', 'UNKNOWN_ERROR', 0);
}

/**
 * 错误上报服务配置
 */
export interface ErrorReporterConfig {
  /** 上报服务地址 */
  endpoint?: string;
  /** 应用名称 */
  appName?: string;
  /** 环境 */
  env?: 'development' | 'production' | 'test';
  /** 是否启用上报 */
  enabled?: boolean;
  /** 上报前的过滤函数 */
  filter?: (error: AppError) => boolean;
  /** 自定义元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 错误上报服务
 *
 * 负责将错误信息上报到外部服务：
 * - HTTP 上报到远程服务器
 * - 控制台输出（调试模式）
 * - 错误过滤和采样
 * - 批量上报
 *
 * @example
 * // 创建上报服务
 * const reporter = new ErrorReporter({
 *   endpoint: 'https://errors.example.com/report',
 *   appName: 'my-agent',
 *   env: 'production',
 * });
 *
 * // 上报错误
 * reporter.report(error, { userId: '123' });
 *
 * // 启用批量上报
 * reporter.setBatchMode(true, 10); // 每 10 个错误上报一次
 */
export class ErrorReporter {
  private endpoint: string | null = null;
  private appName: string = 'my-agent';
  private env: 'development' | 'production' | 'test' = 'development';
  private enabled: boolean = false;
  private filter?: (error: AppError) => boolean;
  private metadata: Record<string, unknown> = {};
  private batchMode: boolean = false;
  private batchSize: number = 10;
  private batchBuffer: Array<{ error: AppError; context?: Record<string, unknown> }> = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: ErrorReporterConfig = {}) {
    this.endpoint = config.endpoint || null;
    this.appName = config.appName || 'my-agent';
    this.env = config.env || 'development';
    this.enabled = config.enabled ?? false;
    this.filter = config.filter;
    this.metadata = config.metadata || {};
  }

  /**
   * 配置上报服务
   */
  configure(config: ErrorReporterConfig): void {
    if (config.endpoint !== undefined) this.endpoint = config.endpoint;
    if (config.appName !== undefined) this.appName = config.appName;
    if (config.env !== undefined) this.env = config.env;
    if (config.enabled !== undefined) this.enabled = config.enabled;
    if (config.filter !== undefined) this.filter = config.filter;
    if (config.metadata !== undefined) this.metadata = config.metadata;
  }

  /**
   * 启用/禁用批量模式
   * @param enabled 是否启用
   * @param batchSize 批量大小
   */
  setBatchMode(enabled: boolean, batchSize: number = 10): void {
    this.batchMode = enabled;
    this.batchSize = batchSize;
    if (!enabled) {
      this.flush();
    }
  }

  /**
   * 上报错误
   * @param error 错误对象
   * @param context 上下文信息
   */
  async report(error: AppError, context?: Record<string, unknown>): Promise<void> {
    if (this.filter && !this.filter(error)) {
      return;
    }

    const reportData = {
      error: error.toJSON(),
      context,
      metadata: this.metadata,
      appName: this.appName,
      env: this.env,
      timestamp: new Date().toISOString(),
    };

    if (this.batchMode) {
      this.batchBuffer.push({ error, context });
      if (this.batchBuffer.length >= this.batchSize) {
        await this.flush();
      }
      return;
    }

    await this.send(reportData);
  }

  /**
   * 刷新批量缓冲区
   */
  async flush(): Promise<void> {
    if (this.batchBuffer.length === 0) return;

    const batch = [...this.batchBuffer];
    this.batchBuffer = [];

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    await this.send({
      errors: batch.map(b => ({
        error: b.error.toJSON(),
        context: b.context,
      })),
      appName: this.appName,
      env: this.env,
      timestamp: new Date().toISOString(),
      count: batch.length,
    });
  }

  /**
   * 发送数据到上报服务
   */
  private async send(data: Record<string, unknown>): Promise<void> {
    if (this.env === 'development') {
      console.debug('[ErrorReporter]', JSON.stringify(data, null, 2));
    }

    if (!this.enabled || !this.endpoint) {
      return;
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        console.warn(`[ErrorReporter] Failed to report: ${response.status}`);
      }
    } catch (err) {
      console.warn(`[ErrorReporter] Report failed:`, err);
    }
  }

  /**
   * 创建开发环境的上报服务（输出到控制台）
   */
  static createDevReporter(): ErrorReporter {
    return new ErrorReporter({
      enabled: true,
      env: 'development',
    });
  }

  /**
   * 创建生产环境的上报服务
   */
  static createProdReporter(endpoint: string, appName: string): ErrorReporter {
    return new ErrorReporter({
      endpoint,
      appName,
      env: 'production',
      enabled: true,
    });
  }
}

/**
 * 全局错误上报器单例
 */
export const errorReporter = new ErrorReporter();

/**
 * 全局错误处理器
 *
 * 记录和管理应用程序中的错误历史：
 * - 自动收集和存储错误
 * - 限制历史记录数量
 * - 支持附加上下文信息
 * - 支持错误上报
 *
 * @example
 * try {
 *   await someOperation();
 * } catch (error) {
 *   errorHandler.handle(error, { userId: '123', operation: 'fetch' });
 * }
 *
 * // 查看错误历史
 * console.log(errorHandler.getHistory());
 *
 * // 配置上报服务
 * errorHandler.configureReporter({
 *   endpoint: 'https://errors.example.com/report',
 *   appName: 'my-agent',
 *   enabled: true,
 * });
 */
export class ErrorHandler {
  /** 错误历史记录列表 */
  private errors: Array<{ timestamp: Date; error: AppError }> = [];
  /** 最大历史记录数量 */
  private maxHistory: number = 100;
  /** 错误上报器 */
  private reporter: ErrorReporter;

  constructor(reporter?: ErrorReporter) {
    this.reporter = reporter || errorReporter;
  }

  /**
   * 配置错误上报器
   */
  configureReporter(config: ErrorReporterConfig): void {
    this.reporter.configure(config);
  }

  /**
   * 处理一个错误
   * 标准化错误并添加到历史记录
   * @param error 原始错误对象
   * @param context 附加的上下文信息
   * @returns 处理后的 AppError
   */
  async handle(error: unknown, context?: Record<string, unknown>): Promise<AppError> {
    const appError = normalizeError(error);
    if (context) {
      appError.details = { ...appError.details, context };
    }
    this.errors.push({ timestamp: new Date(), error: appError });
    if (this.errors.length > this.maxHistory) {
      this.errors.shift();
    }

    this.reporter.report(appError, context).catch(() => {});

    return appError;
  }

  /**
   * 同步处理错误（不上报）
   */
  handleSync(error: unknown, context?: Record<string, unknown>): AppError {
    const appError = normalizeError(error);
    if (context) {
      appError.details = { ...appError.details, context };
    }
    this.errors.push({ timestamp: new Date(), error: appError });
    if (this.errors.length > this.maxHistory) {
      this.errors.shift();
    }
    return appError;
  }

  /**
   * 获取错误历史记录
   */
  getHistory(): Array<{ timestamp: Date; error: AppError }> {
    return [...this.errors];
  }

  /**
   * 清空错误历史
   */
  clear(): void {
    this.errors = [];
  }

  /**
   * 获取当前错误数量
   */
  getErrorCount(): number {
    return this.errors.length;
  }

  /**
   * 获取最近 N 条错误
   */
  getRecent(count: number = 10): Array<{ timestamp: Date; error: AppError }> {
    return this.errors.slice(-count);
  }

  /**
   * 刷新上报缓冲区
   */
  async flushReporter(): Promise<void> {
    await this.reporter.flush();
  }
}

/**
 * 全局错误处理器单例实例
 */
export const errorHandler = new ErrorHandler();