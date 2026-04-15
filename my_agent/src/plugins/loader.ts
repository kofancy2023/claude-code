/**
 * 插件加载器
 *
 * 负责从不同来源加载插件：
 * - 从文件目录加载
 * - 从配置文件加载
 * - 自动发现内置插件
 */

import * as fs from 'fs';
import type { AgentPlugin, PluginSource, PluginValidationResult } from './types.js';
import { PluginType } from './types.js';

/**
 * 插件加载器配置
 */
export interface PluginLoaderOptions {
  /** 内置插件目录 */
  builtinDir?: string;

  /** 用户插件目录 */
  userPluginsDir?: string;

  /** 第三方插件目录 */
  thirdPartyDir?: string;

  /** 是否自动加载内置插件 */
  autoLoadBuiltin?: boolean;

  /** 是否启用第三方插件 */
  enableThirdParty?: boolean;

  /** 插件加载超时 (毫秒) */
  loadTimeout?: number;
}

/**
 * 加载结果
 */
export interface LoadResult {
  /** 插件名称 */
  name: string;

  /** 是否成功 */
  success: boolean;

  /** 插件实例 (如果成功) */
  plugin?: AgentPlugin;

  /** 错误信息 (如果失败) */
  error?: string;
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: Required<PluginLoaderOptions> = {
  builtinDir: './plugins/builtin',
  userPluginsDir: './.agent/plugins',
  thirdPartyDir: './node_modules/@agent-plugins',
  autoLoadBuiltin: true,
  enableThirdParty: false,
  loadTimeout: 30000,
};

/**
 * 插件加载器
 *
 * @example
 * ```typescript
 * const loader = new PluginLoader();
 * const results = await loader.loadAll();
 * ```
 */
export class PluginLoader {
  /** 配置 */
  private options: Required<PluginLoaderOptions>;

  /** 已加载的插件 */
  private loadedPlugins: Map<string, AgentPlugin> = new Map();

  constructor(options: PluginLoaderOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 从指定路径加载单个插件
   *
   * @param source - 插件来源
   * @returns 加载结果
   */
  async load(source: PluginSource): Promise<LoadResult> {
    try {
      let plugin: AgentPlugin;

      switch (source.type) {
        case 'builtin':
          plugin = await this.loadBuiltin(source.path);
          break;
        case 'user':
          plugin = await this.loadFromPath(source.path);
          break;
        case 'third_party':
          plugin = await this.loadThirdParty(source.path);
          break;
        default:
          throw new Error(`Unknown plugin type: ${source.type}`);
      }

      const validation = this.validate(plugin);
      if (!validation.valid) {
        return {
          name: plugin.metadata.name,
          success: false,
          error: validation.errors.join(', '),
        };
      }

      if (this.loadedPlugins.has(plugin.metadata.name)) {
        return {
          name: plugin.metadata.name,
          success: false,
          error: `Plugin ${plugin.metadata.name} is already loaded`,
        };
      }

      this.loadedPlugins.set(plugin.metadata.name, plugin);
      return { name: plugin.metadata.name, success: true, plugin };

    } catch (error) {
      return {
        name: source.path,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 从文件路径加载插件
   *
   * @param filePath - 插件文件路径
   * @returns 插件实例
   */
  async loadFromPath(filePath: string): Promise<AgentPlugin> {
    const pluginPath = new URL(filePath, import.meta.url).href;
    const module = await import(pluginPath);

    if (!module.default) {
      throw new Error(`Plugin at ${filePath} does not export a default export`);
    }

    return module.default as AgentPlugin;
  }

  /**
   * 加载内置插件
   *
   * @param pluginName - 插件名称
   * @returns 插件实例
   */
  async loadBuiltin(pluginName: string): Promise<AgentPlugin> {
    const builtinPath = `${this.options.builtinDir}/${pluginName}/index.ts`;
    return this.loadFromPath(builtinPath);
  }

  /**
   * 加载第三方插件
   *
   * @param packageName - 包名
   * @returns 插件实例
   */
  async loadThirdParty(packageName: string): Promise<AgentPlugin> {
    const packagePath = `${this.options.thirdPartyDir}/${packageName}`;
    return this.loadFromPath(packagePath);
  }

  /**
   * 从配置文件加载插件
   *
   * @param config - 插件配置
   * @returns 加载结果
   */
  async loadFromConfig(config: PluginSource[]): Promise<LoadResult[]> {
    const results: LoadResult[] = [];

    for (const source of config) {
      const result = await this.load(source);
      results.push(result);
    }

    return results;
  }

  /**
   * 自动发现并加载所有可用插件
   *
   * @returns 加载结果列表
   */
  async autoDiscover(): Promise<LoadResult[]> {
    const sources: PluginSource[] = [];

    if (this.options.autoLoadBuiltin) {
      const builtinPlugins = await this.discoverBuiltin();
      sources.push(...builtinPlugins);
    }

    const userPlugins = await this.discoverInDir(this.options.userPluginsDir);
    sources.push(...userPlugins.map(p => ({ type: 'user' as PluginType, path: p })));

    if (this.options.enableThirdParty) {
      const thirdParty = await this.discoverThirdParty();
      sources.push(...thirdParty);
    }

    return this.loadFromConfig(sources);
  }

  /**
   * 发现内置插件
   *
   * @returns 内置插件列表
   */
  private async discoverBuiltin(): Promise<PluginSource[]> {
    const plugins: PluginSource[] = [];

    try {
      const builtinPath = new URL(this.options.builtinDir, import.meta.url).pathname;
      const entries = await fs.promises.readdir(builtinPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          plugins.push({
            type: PluginType.Builtin,
            path: entry.name,
            priority: 0,
          });
        }
      }
    } catch {
      // 内置插件目录不存在，忽略
    }

    return plugins;
  }

  /**
   * 在目录中发现插件
   *
   * @param dir - 目录路径
   * @returns 插件路径列表
   */
  private async discoverInDir(dir: string): Promise<string[]> {
    const plugins: string[] = [];

    try {
      const url = new URL(dir, import.meta.url).pathname;
      const entries = await fs.promises.readdir(url, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
          plugins.push(`${dir}/${entry.name}`);
        } else if (entry.isDirectory()) {
          plugins.push(`${dir}/${entry.name}/index.ts`);
        }
      }
    } catch {
      // 目录不存在，忽略
    }

    return plugins;
  }

  /**
   * 发现第三方插件
   *
   * @returns 第三方插件列表
   */
  private async discoverThirdParty(): Promise<PluginSource[]> {
    const plugins: PluginSource[] = [];

    try {
      const packagesPath = new URL(this.options.thirdPartyDir, import.meta.url).pathname;
      const entries = await fs.promises.readdir(packagesPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          plugins.push({
            type: PluginType.ThirdParty,
            path: entry.name,
            priority: 10,
          });
        }
      }
    } catch {
      // 第三方插件目录不存在，忽略
    }

    return plugins;
  }

  /**
   * 验证插件
   *
   * @param plugin - 插件实例
   * @returns 验证结果
   */
  validate(plugin: unknown): PluginValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!plugin || typeof plugin !== 'object') {
      return { valid: false, errors: ['Plugin must be an object'], warnings: [] };
    }

    const p = plugin as Record<string, unknown>;

    if (!p.metadata || typeof p.metadata !== 'object') {
      errors.push('Plugin must have a metadata object');
    } else {
      const meta = p.metadata as Record<string, unknown>;
      if (!meta.name || typeof meta.name !== 'string') {
        errors.push('Plugin metadata must have a name string');
      }
      if (!meta.version || typeof meta.version !== 'string') {
        errors.push('Plugin metadata must have a version string');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 获取已加载的插件
   *
   * @returns 插件映射
   */
  getLoadedPlugins(): Map<string, AgentPlugin> {
    return new Map(this.loadedPlugins);
  }

  /**
   * 获取已加载插件列表
   *
   * @returns 插件列表
   */
  getLoadedPluginsList(): AgentPlugin[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * 卸载插件
   *
   * @param name - 插件名称
   * @returns 是否成功
   */
  unload(name: string): boolean {
    return this.loadedPlugins.delete(name);
  }

  /**
   * 卸载所有插件
   */
  unloadAll(): void {
    this.loadedPlugins.clear();
  }
}

/**
 * 创建插件加载器
 *
 * @param options - 配置选项
 * @returns 插件加载器实例
 */
export function createPluginLoader(options?: PluginLoaderOptions): PluginLoader {
  return new PluginLoader(options);
}
