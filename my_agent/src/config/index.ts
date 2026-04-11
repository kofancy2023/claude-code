import * as path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';
import type { ProviderName } from '../services/api/provider-config.js';

export type { ProviderName };

export interface AppConfig {
  provider: ProviderName;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxConcurrentTools: number;
  maxToolCallRounds: number;
  sessionDir: string;
  permissionsConfig: string;
  errorReporting: ErrorReportingConfig;
  debug: boolean;
}

export interface ErrorReportingConfig {
  enabled: boolean;
  endpoint?: string;
  appName: string;
  env: 'development' | 'production' | 'test';
  metadata?: Record<string, unknown>;
}

export interface ConfigSource {
  source: 'default' | 'env' | 'file' | 'cli' | 'memory';
  value: unknown;
}

type ConfigLayer = {
  [K in keyof AppConfig]?: ConfigSource;
};

const defaultConfig: AppConfig = {
  provider: 'glm',
  apiKey: '',
  maxConcurrentTools: 5,
  maxToolCallRounds: 20,
  sessionDir: '.sessions',
  permissionsConfig: '',
  errorReporting: {
    enabled: true,
    appName: 'my-agent',
    env: 'development',
  },
  debug: false,
};

export class Config {
  private sources: ConfigLayer = {};
  private configValues: AppConfig = { ...defaultConfig };
  private loaded: boolean = false;

  constructor() {
    for (const key of Object.keys(defaultConfig) as Array<keyof AppConfig>) {
      this.sources[key] = { source: 'default', value: defaultConfig[key] };
    }
  }

  load(): AppConfig {
    if (this.loaded) {
      return this.configValues;
    }

    this.loadFromEnv();
    this.loadFromConfigFile();
    this.loadFromRCFile();
    this.applyEnvironmentOverrides();

    if (!this.configValues.apiKey) {
      throw new ConfigValidationError('API key is required', 'apiKey');
    }

    this.loaded = true;
    return this.configValues;
  }

  private loadFromEnv(): void {
    const mappings: Array<{ env: string; key: keyof AppConfig }> = [
      { env: 'AI_PROVIDER', key: 'provider' },
      { env: 'AI_API_KEY', key: 'apiKey' },
      { env: 'AI_MODEL', key: 'model' },
      { env: 'AI_BASE_URL', key: 'baseUrl' },
      { env: 'MAX_CONCURRENT_TOOLS', key: 'maxConcurrentTools' },
      { env: 'MAX_TOOL_CALL_ROUNDS', key: 'maxToolCallRounds' },
      { env: 'SESSION_DIR', key: 'sessionDir' },
      { env: 'PERMISSIONS_CONFIG', key: 'permissionsConfig' },
      { env: 'DEBUG', key: 'debug' },
    ];

    for (const { env, key } of mappings) {
      const value = process.env[env];
      if (value !== undefined) {
        this.set(key, this.parseValue(value, key), 'env');
      }
    }

    if (process.env.ERROR_REPORTING_ENABLED !== undefined) {
      const enabled = process.env.ERROR_REPORTING_ENABLED === 'true';
      this.set('errorReporting', {
        ...this.configValues.errorReporting,
        enabled,
      }, 'env');
    }
  }

  private loadFromConfigFile(): void {
    const configPath = path.join(process.cwd(), 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const fileConfig = JSON.parse(content) as Partial<AppConfig>;
        this.applyPartial(fileConfig, 'file');
      } catch (error) {
        console.warn(`Failed to load config from ${configPath}:`, error);
      }
    }
  }

  private loadFromRCFile(): void {
    const rcPath = path.join(homedir(), '.my-agent', 'config.json');
    if (fs.existsSync(rcPath)) {
      try {
        const content = fs.readFileSync(rcPath, 'utf-8');
        const rcConfig = JSON.parse(content) as Partial<AppConfig>;
        this.applyPartial(rcConfig, 'cli');
      } catch (error) {
        console.warn(`Failed to load config from ${rcPath}:`, error);
      }
    }
  }

  private applyEnvironmentOverrides(): void {
    if (process.env.NODE_ENV) {
      const env = ['development', 'production', 'test'].includes(process.env.NODE_ENV)
        ? process.env.NODE_ENV as 'development' | 'production' | 'test'
        : 'development';

      this.set('errorReporting', {
        ...this.configValues.errorReporting,
        env,
      }, 'env');
    }
  }

  private applyPartial(config: Partial<AppConfig>, source: 'file' | 'cli'): void {
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) {
        this.set(key as keyof AppConfig, value, source);
      }
    }
  }

  private set(key: keyof AppConfig, value: unknown, source: ConfigSource['source']): void {
    (this.configValues as unknown as Record<string, unknown>)[key] = value;
    this.sources[key] = { source, value };
  }

  setExtra(key: string, value: unknown): void {
    (this.configValues as unknown as Record<string, unknown>)[key] = value;
    this.sources[key as keyof AppConfig] = { source: 'memory', value };
  }

  private parseValue(value: string, key: keyof AppConfig): string | number | boolean | undefined {
    switch (key) {
      case 'maxConcurrentTools':
      case 'maxToolCallRounds':
        return parseInt(value, 10);
      case 'debug':
        return value === 'true' || value === '1';
      default:
        return value;
    }
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.configValues[key];
  }

  getAll(): AppConfig {
    return { ...this.configValues };
  }

  getSource(key: keyof AppConfig): ConfigSource | undefined {
    return this.sources[key];
  }

  getAllSources(): ConfigLayer {
    return { ...this.sources };
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  validate(): ConfigValidationResult {
    const errors: Array<{ key: string; message: string }> = [];

    if (!this.configValues.apiKey) {
      errors.push({ key: 'apiKey', message: 'API key is required' });
    }

    const validProviders: ProviderName[] = [
      'anthropic', 'openai', 'glm', 'kimi', 'minimax',
      'siliconflow', 'deepseek', 'qwen', 'gemini', 'moonshot',
    ];

    if (!validProviders.includes(this.configValues.provider)) {
      errors.push({ key: 'provider', message: `Invalid provider: ${this.configValues.provider}` });
    }

    if (this.configValues.maxConcurrentTools < 1) {
      errors.push({ key: 'maxConcurrentTools', message: 'maxConcurrentTools must be at least 1' });
    }

    return { valid: errors.length === 0, errors };
  }

  exportToFile(filePath: string): void {
    const exportConfig = { ...this.configValues };
    delete (exportConfig as Record<string, unknown>).apiKey;
    const content = JSON.stringify(exportConfig, null, 2);
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly key?: string
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: Array<{ key: string; message: string }>;
}

export const config = new Config();
