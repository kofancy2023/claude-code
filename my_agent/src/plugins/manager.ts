/**
 * 插件管理器
 *
 * 负责将插件系统集成到 Agent 核心：
 * - 加载内置插件
 * - 加载用户插件
 * - 将插件工具合并到 ToolRegistry
 * - 触发生命周期钩子
 */

import { PluginLoader, PluginRegistry, createPluginLoader, createPluginRegistry } from './index.js';
import { toolRegistry, ToolRegistry } from '../tools/registry.js';
import type { AgentPlugin, Tool } from './types.js';

/**
 * 插件管理器配置
 */
export interface PluginManagerOptions {
  /** 是否自动加载内置插件 */
  autoLoadBuiltin?: boolean;

  /** 是否加载用户插件 */
  loadUserPlugins?: boolean;

  /** 是否启用第三方插件 */
  enableThirdParty?: boolean;

  /** 内置插件目录 */
  builtinDir?: string;

  /** 用户插件目录 */
  userPluginsDir?: string;
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: Required<PluginManagerOptions> = {
  autoLoadBuiltin: true,
  loadUserPlugins: true,
  enableThirdParty: false,
  builtinDir: './src/plugins/builtin',
  userPluginsDir: './.agent/plugins',
};

/**
 * 插件管理器
 *
 * 单例模式，负责插件系统与 Agent 的集成
 */
export class PluginManager {
  /** 单例实例 */
  private static instance: PluginManager | null = null;

  /** 配置 */
  private options: Required<PluginManagerOptions>;

  /** 插件加载器 */
  private loader: PluginLoader;

  /** 插件注册表 */
  private registry: PluginRegistry;

  /** 原始工具注册表引用 */
  private toolRegistry: ToolRegistry;

  /** 是否已初始化 */
  private initialized = false;

  /**
   * 私有构造函数 (单例模式)
   */
  private constructor(options: PluginManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.loader = createPluginLoader({
      builtinDir: this.options.builtinDir,
      userPluginsDir: this.options.userPluginsDir,
      autoLoadBuiltin: this.options.autoLoadBuiltin,
      enableThirdParty: this.options.enableThirdParty,
    });
    this.registry = createPluginRegistry();
    this.toolRegistry = toolRegistry;
  }

  /**
   * 获取单例实例
   */
  static getInstance(options?: PluginManagerOptions): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager(options);
    }
    return PluginManager.instance;
  }

  /**
   * 初始化插件系统
   * 加载并注册所有插件
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[PluginManager] Already initialized');
      return;
    }

    console.log('[PluginManager] Initializing...');

    const loadResults = await this.loader.autoDiscover();

    for (const result of loadResults) {
      if (result.success && result.plugin) {
        this.registry.register(result.plugin);
        console.log(`[PluginManager] ✓ Loaded: ${result.name}`);

        this.registerPluginTools(result.plugin);
      } else {
        console.error(`[PluginManager] ✗ Failed to load ${result.name}: ${result.error}`);
      }
    }

    this.setupHooks();

    this.initialized = true;
    console.log(`[PluginManager] Initialized with ${this.registry.size()} plugins`);
  }

  /**
   * 注册插件提供的工具
   */
  private registerPluginTools(plugin: AgentPlugin): void {
    if (!plugin.tools) return;

    for (const tool of plugin.tools) {
      const wrappedTool = this.wrapToolWithHooks(tool, plugin.metadata.name);
      this.toolRegistry.register(wrappedTool);
    }
  }

  /**
   * 为工具包装生命周期钩子
   */
  private wrapToolWithHooks(tool: Tool, pluginName: string): Tool {
    const originalExecute = tool.execute;

    tool.execute = async (input: Record<string, unknown>): Promise<string> => {
      const ctx = { toolName: tool.name, pluginName, input };

      await this.registry.invokeHook('beforeToolExecute', ctx as any);

      try {
        const result = await originalExecute(input);

        await this.registry.invokeHook('afterToolExecute', {
          tool,
          input,
          result,
        } as any);

        return result;
      } catch (error) {
        await this.registry.invokeHook('onToolError', {
          tool,
          input,
          error: error instanceof Error ? error : new Error(String(error)),
        } as any);

        throw error;
      }
    };

    return tool;
  }

  /**
   * 设置全局钩子
   */
  private setupHooks(): void {
    this.registry.on('plugin:registered', (event) => {
      console.log(`[PluginManager] Plugin registered: ${event.plugin}`);
    });

    this.registry.on('plugin:unregistered', (event) => {
      console.log(`[PluginManager] Plugin unregistered: ${event.plugin}`);
    });
  }

  /**
   * 注册单个插件
   */
  register(plugin: AgentPlugin): boolean {
    const result = this.registry.register(plugin);

    if (result) {
      this.registerPluginTools(plugin);
    }

    return result;
  }

  /**
   * 注销插件
   */
  unregister(name: string): boolean {
    const plugin = this.registry.get(name);

    if (plugin) {
      for (const tool of plugin.tools) {
        this.toolRegistry.unregister(tool.name);
      }
    }

    return this.registry.unregister(name);
  }

  /**
   * 获取插件注册表
   */
  getRegistry(): PluginRegistry {
    return this.registry;
  }

  /**
   * 获取插件加载器
   */
  getLoader(): PluginLoader {
    return this.loader;
  }

  /**
   * 获取统计信息
   */
  getStats(): { pluginCount: number; toolCount: number } {
    return {
      pluginCount: this.registry.size(),
      toolCount: this.registry.getTools().length,
    };
  }

  /**
   * 获取所有已加载的插件实例
   */
  getAllPlugins(): ReturnType<PluginRegistry['getAll']> {
    return this.registry.getAll();
  }

  /**
   * 重置单例 (用于测试)
   */
  static reset(): void {
    if (PluginManager.instance) {
      PluginManager.instance.registry.clear();
      PluginManager.instance.initialized = false;
    }
    PluginManager.instance = null;
  }
}

/**
 * 获取插件管理器单例
 */
export function getPluginManager(options?: PluginManagerOptions): PluginManager {
  return PluginManager.getInstance(options);
}
