/**
 * 配置管理模块
 *
 * 提供统一的配置管理功能：
 * - 配置加载和验证
 * - 配置热加载
 * - 环境变量覆盖
 * - 默认值管理
 *
 * 设计思路：
 * 配置系统采用分层结构：默认配置 < 文件配置 < 环境变量 < 运行时配置
 * 支持热加载，可在运行时更新配置而无需重启
 */

import * as fs from 'fs';
import * as path from 'path';
import { ZodSchema, z } from 'zod';

/**
 * 应用配置 schema
 */
export const AppConfigSchema = z.object({
  /** 应用名称 */
  appName: z.string().default('my-agent'),

  /** 版本 */
  version: z.string().default('1.0.0'),

  /** 日志配置 */
  logging: z.object({
    /** 日志级别 */
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    /** 是否输出到文件 */
    file: z.boolean().default(false),
    /** 日志文件路径 */
    filePath: z.string().optional(),
    /** 最大文件大小（MB） */
    maxSize: z.number().default(10),
    /** 保留日志天数 */
    retainDays: z.number().default(7),
  }).default({}),

  /** REPL 配置 */
  repl: z.object({
    /** 启用历史记录 */
    history: z.boolean().default(true),
    /** 历史记录大小 */
    historySize: z.number().default(1000),
    /** 启用自动补全 */
    autocomplete: z.boolean().default(true),
    /** 启用流式输出 */
    streaming: z.boolean().default(true),
    /** 提示符 */
    prompt: z.string().default('> '),
  }).default({}),

  /** AI 提供商配置 */
  provider: z.object({
    /** 默认提供商 */
    default: z.string().default('anthropic'),
    /** API 密钥（可通过环境变量覆盖） */
    apiKey: z.string().optional(),
    /** API Base URL */
    baseUrl: z.string().optional(),
    /** 默认模型 */
    model: z.string().optional(),
    /** 最大 token 数 */
    maxTokens: z.number().optional(),
  }).default({}),

  /** 上下文管理配置 */
  context: z.object({
    /** 最大上下文 token 数 */
    maxTokens: z.number().default(100000),
    /** 上下文保留消息数 */
    retainMessages: z.number().default(50),
    /** 启用智能截断 */
    smartTruncate: z.boolean().default(true),
    /** 截断阈值（百分比） */
    truncateThreshold: z.number().default(80),
  }).default({}),

  /** 安全配置 */
  security: z.object({
    /** 启用权限检查 */
    enablePermissions: z.boolean().default(true),
    /** 权限配置文件路径 */
    permissionFile: z.string().optional(),
    /** 危险操作确认 */
    confirmDangerous: z.boolean().default(true),
    /** 允许的命令白名单 */
    allowedCommands: z.array(z.string()).default(['ls', 'cat', 'git', 'node', 'npm']),
  }).default({}),

  /** 插件配置 */
  plugins: z.object({
    /** 启用插件 */
    enabled: z.boolean().default(true),
    /** 插件目录 */
    dir: z.string().default('./plugins'),
    /** 自动加载的插件列表 */
    autoLoad: z.array(z.string()).default([]),
    /** 插件市场 URL */
    marketUrl: z.string().optional(),
  }).default({}),

  /** MCP 配置 */
  mcp: z.object({
    /** 启用 MCP */
    enabled: z.boolean().default(true),
    /** 服务器列表 */
    servers: z.array(z.object({
      name: z.string(),
      transport: z.enum(['http', 'websocket', 'stdio']),
      url: z.string(),
    })).default([]),
  }).default({}),
});

/**
 * 应用配置类型
 */
export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: AppConfig = AppConfigSchema.parse({});

/**
 * 配置验证结果
 */
export interface ConfigValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误信息 */
  errors?: string[];
  /** 警告信息 */
  warnings?: string[];
}

/**
 * 配置变更回调
 */
export type ConfigChangeCallback = (config: AppConfig, prevConfig: AppConfig) => void;

/**
 * 配置管理器
 */
export class ConfigManager {
  /** 单例实例 */
  private static instance: ConfigManager | null = null;

  /** 当前配置 */
  private config: AppConfig;

  /** 配置文件路径 */
  private configPath: string | null = null;

  /** 监视器 */
  private watcher: fs.FSWatcher | null = null;

  /** 变更监听器 */
  private listeners: Set<ConfigChangeCallback> = new Set();

  /** 是否已初始化 */
  private initialized = false;

  /**
   * 获取单例实例
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * 重置单例（用于测试）
   */
  static reset(): void {
    if (ConfigManager.instance) {
      ConfigManager.instance.stopWatching();
    }
    ConfigManager.instance = null;
  }

  /**
   * 私有构造函数
   */
  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * 初始化配置管理器
   *
   * @param options - 初始化选项
   * @returns 配置验证结果
   */
  initialize(options: {
    /** 配置文件路径 */
    configPath?: string;
    /** 环境变量前缀 */
    envPrefix?: string;
    /** 覆盖配置 */
    overrides?: Partial<AppConfig>;
  } = {}): ConfigValidationResult {
    const { configPath, envPrefix = 'AGENT_', overrides = {} } = options;

    const errors: string[] = [];
    const warnings: string[] = [];

    // 步骤 1：加载默认配置
    let config: AppConfig = { ...DEFAULT_CONFIG };

    // 步骤 2：加载文件配置
    if (configPath && fs.existsSync(configPath)) {
      try {
        const fileConfig = this.loadConfigFile(configPath);
        config = this.mergeConfig(config, fileConfig);
        this.configPath = configPath;
      } catch (error) {
        errors.push(`Failed to load config file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (configPath) {
      warnings.push(`Config file not found: ${configPath}`);
    }

    // 步骤 3：应用环境变量覆盖
    config = this.applyEnvOverrides(config, envPrefix);

    // 步骤 4：应用运行时覆盖
    if (Object.keys(overrides).length > 0) {
      config = this.mergeConfig(config, overrides);
    }

    // 步骤 5：验证配置
    const validation = this.validate(config);
    if (!validation.valid && validation.errors) {
      errors.push(...validation.errors);
    }
    if (validation.warnings) {
      warnings.push(...validation.warnings);
    }

    // 应用最终配置
    this.config = config;
    this.initialized = true;

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * 获取当前配置
   */
  getConfig(): AppConfig {
    if (!this.initialized) {
      console.warn('[Config] Not initialized, using default config');
      return { ...DEFAULT_CONFIG };
    }
    return { ...this.config };
  }

  /**
   * 获取配置项
   *
   * @param key - 配置键（支持点号分隔的路径，如 'provider.default'）
   * @returns 配置值
   */
  get<K extends keyof AppConfig>(key: K): AppConfig[K];
  get(key: string): unknown;
  get(key: string): unknown {
    const keys = key.split('.');
    let value: unknown = this.config;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * 更新配置（运行时覆盖）
   *
   * @param updates - 要更新的配置
   * @returns 是否成功
   */
  update(updates: Partial<AppConfig>): boolean {
    if (!this.initialized) {
      console.warn('[Config] Not initialized');
      return false;
    }

    const prevConfig = { ...this.config };
    this.config = this.mergeConfig(this.config, updates);

    // 验证更新后的配置
    const validation = this.validate(this.config);
    if (!validation.valid) {
      this.config = prevConfig;
      console.error('[Config] Invalid updates:', validation.errors);
      return false;
    }

    // 通知监听器
    this.notifyListeners(prevConfig);

    return true;
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    const prevConfig = { ...this.config };
    this.config = { ...DEFAULT_CONFIG };
    this.notifyListeners(prevConfig);
  }

  /**
   * 保存配置到文件
   *
   * @param targetPath - 目标路径（可选）
   */
  save(targetPath?: string): void {
    const savePath = targetPath || this.configPath;

    if (!savePath) {
      throw new Error('No config path specified');
    }

    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const content = JSON.stringify(this.config, null, 2);
    fs.writeFileSync(savePath, content, 'utf-8');
  }

  /**
   * 开始监视配置文件变化
   */
  watch(): void {
    if (!this.configPath || this.watcher) {
      return;
    }

    try {
      this.watcher = fs.watch(this.configPath, (eventType) => {
        if (eventType === 'change') {
          console.log('[Config] Config file changed, reloading...');
          this.reload();
        }
      });

      console.log(`[Config] Watching config file: ${this.configPath}`);
    } catch (error) {
      console.error('[Config] Failed to watch config file:', error);
    }
  }

  /**
   * 停止监视配置文件
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('[Config] Stopped watching config file');
    }
  }

  /**
   * 重新加载配置
   */
  reload(): void {
    if (!this.configPath) {
      return;
    }

    const prevConfig = { ...this.config };

    try {
      const fileConfig = this.loadConfigFile(this.configPath);
      this.config = this.applyEnvOverrides(fileConfig, 'AGENT_');

      const validation = this.validate(this.config);
      if (!validation.valid) {
        console.error('[Config] Reload validation failed:', validation.errors);
        return;
      }

      this.notifyListeners(prevConfig);
      console.log('[Config] Config reloaded successfully');
    } catch (error) {
      console.error('[Config] Failed to reload config:', error);
    }
  }

  /**
   * 添加配置变更监听器
   */
  onChange(callback: ConfigChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * 验证配置
   */
  validate(config: unknown): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      AppConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.errors) {
          errors.push(`${issue.path.join('.')}: ${issue.message}`);
        }
      } else {
        errors.push('Unknown validation error');
      }
    }

    // 额外的业务验证
    const appConfig = config as AppConfig;

    if (appConfig.context?.maxTokens && appConfig.context.maxTokens < 1000) {
      warnings.push('context.maxTokens is very low, consider increasing to at least 10000');
    }

    if (appConfig.security?.confirmDangerous === false) {
      warnings.push('Security: dangerous operation confirmation is disabled');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * 加载配置文件
   */
  private loadConfigFile(filePath: string): Partial<AppConfig> {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');

    if (ext === '.json') {
      return JSON.parse(content);
    } else if (ext === '.js') {
      const module = require(filePath);
      return module.default || module;
    } else if (ext === '.yaml' || ext === '.yml') {
      // 简单的 YAML 解析（实际项目中应使用 js-yaml）
      const lines = content.split('\n');
      const result: Record<string, unknown> = {};
      let currentKey = '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const match = trimmed.match(/^(\w+):\s*(.*)$/);
        if (match) {
          currentKey = match[1];
          const value = match[2].replace(/^['"]|['"]$/g, '');
          result[currentKey] = value || true;
        }
      }

      return result as unknown as Partial<AppConfig>;
    }

    throw new Error(`Unsupported config file format: ${ext}`);
  }

  /**
   * 合并配置
   */
  private mergeConfig(base: AppConfig, override: Partial<AppConfig>): AppConfig {
    const result = { ...base };

    for (const key of Object.keys(override) as Array<keyof AppConfig>) {
      const overrideValue = override[key];
      const baseValue = base[key];

      if (
        overrideValue !== null &&
        typeof overrideValue === 'object' &&
        !Array.isArray(overrideValue) &&
        baseValue !== null &&
        typeof baseValue === 'object' &&
        !Array.isArray(baseValue)
      ) {
        result[key] = { ...baseValue, ...overrideValue } as AppConfig[typeof key];
      } else if (overrideValue !== undefined) {
        result[key] = overrideValue as AppConfig[typeof key];
      }
    }

    return result;
  }

  /**
   * 应用环境变量覆盖
   */
  private applyEnvOverrides(config: AppConfig, prefix: string): AppConfig {
    const envOverrides: Partial<AppConfig> = {};

    // API Key 覆盖
    const apiKey = process.env[`${prefix}API_KEY`] || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      envOverrides.provider = { ...config.provider, apiKey };
    }

    // Base URL 覆盖
    const baseUrl = process.env[`${prefix}BASE_URL`] || process.env.OPENAI_BASE_URL;
    if (baseUrl) {
      envOverrides.provider = { ...envOverrides.provider || config.provider, baseUrl };
    }

    // 默认模型覆盖
    const model = process.env[`${prefix}MODEL`];
    if (model) {
      envOverrides.provider = { ...envOverrides.provider || config.provider, model };
    }

    // 日志级别覆盖
    const logLevel = process.env[`${prefix}LOG_LEVEL`];
    if (logLevel) {
      envOverrides.logging = { ...config.logging, level: logLevel as 'debug' | 'info' | 'warn' | 'error' };
    }

    // 插件启用覆盖
    const pluginsEnabled = process.env[`${prefix}PLUGINS_ENABLED`];
    if (pluginsEnabled !== undefined) {
      envOverrides.plugins = { ...config.plugins, enabled: pluginsEnabled === 'true' };
    }

    return this.mergeConfig(config, envOverrides);
  }

  /**
   * 通知监听器
   */
  private notifyListeners(prevConfig: AppConfig): void {
    for (const listener of this.listeners) {
      try {
        listener(this.config, prevConfig);
      } catch (error) {
        console.error('[Config] Error in change listener:', error);
      }
    }
  }
}

/**
 * 配置管理器单例快捷访问
 */
export const configManager = ConfigManager.getInstance();
