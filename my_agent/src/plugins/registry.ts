/**
 * 插件注册表
 *
 * 负责管理插件的注册、查询和调用
 * 是插件系统与 Agent 核心的桥梁
 */

import type { AgentPlugin, PluginInstance, PluginHooks, PluginMiddleware, Tool } from './types.js';
import { PluginStatus } from './types.js';

/**
 * 插件事件
 */
export interface PluginEvent {
  /** 事件类型 */
  type: string;

  /** 插件名称 */
  plugin?: string;

  /** 事件数据 */
  data?: unknown;

  /** 时间戳 */
  timestamp: number;
}

/**
 * 插件注册表配置
 */
export interface PluginRegistryOptions {
  /** 是否允许重复注册 */
  allowDuplicate?: boolean;

  /** 插件优先级 (数字越小优先级越高) */
  defaultPriority?: number;

  /** 自动调用初始化方法 */
  autoInitialize?: boolean;

  /** 自动调用销毁方法 */
  autoDestroy?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: Required<PluginRegistryOptions> = {
  allowDuplicate: false,
  defaultPriority: 100,
  autoInitialize: true,
  autoDestroy: true,
};

/**
 * 插件注册表
 *
 * @example
 * ```typescript
 * const registry = new PluginRegistry();
 *
 * // 注册插件
 * registry.register(myPlugin);
 *
 * // 获取所有工具
 * const tools = registry.getTools();
 *
 * // 获取特定钩子
 * registry.invokeHook('beforeToolExecute', { tool, input });
 * ```
 */
export class PluginRegistry {
  /** 配置 */
  private options: Required<PluginRegistryOptions>;

  /** 插件实例映射 */
  private plugins: Map<string, PluginInstance> = new Map();

  /** 有序插件列表 (按优先级排序) */
  private sortedPlugins: PluginInstance[] = [];

  /** 全局中间件 */
  private globalMiddleware: PluginMiddleware[] = [];

  /** 事件监听器 */
  private eventListeners: Map<string, Set<(event: PluginEvent) => void>> = new Map();

  /** 全局钩子处理器 */
  private globalHooks: Map<string, Set<PluginHooks[keyof PluginHooks]>> = new Map();

  constructor(options: PluginRegistryOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 注册插件
   *
   * @param plugin - 插件实例
   * @returns 是否注册成功
   */
  register(plugin: AgentPlugin): boolean {
    const name = plugin.metadata.name;

    if (this.plugins.has(name)) {
      if (!this.options.allowDuplicate) {
        console.warn(`[PluginRegistry] Plugin ${name} is already registered`);
        return false;
      }
      console.warn(`[PluginRegistry] Plugin ${name} is being replaced`);
    }

    const instance: PluginInstance = {
      metadata: plugin.metadata,
      status: PluginStatus.Loading,
      tools: plugin.tools || [],
      hooks: plugin.hooks || {},
      middleware: plugin.middleware || [],
      config: new Map(),
      loadedAt: Date.now(),
    };

    if (plugin.initialize && this.options.autoInitialize) {
      try {
        const result = plugin.initialize();
        if (result instanceof Promise) {
          result.catch((err) => {
            instance.lastError = err instanceof Error ? err.message : String(err);
            instance.status = PluginStatus.Error;
          });
        }
      } catch (err) {
        instance.lastError = err instanceof Error ? err.message : String(err);
        instance.status = PluginStatus.Error;
        this.plugins.set(name, instance);
        return false;
      }
    }

    instance.status = PluginStatus.Loaded;
    this.plugins.set(name, instance);
    this.updateSortedList();

    if (instance.hooks.onLoad) {
      try {
        const result = instance.hooks.onLoad();
        if (result instanceof Promise) {
          result.catch((err) => {
            instance.lastError = err instanceof Error ? err.message : String(err);
          });
        }
      } catch (err) {
        instance.lastError = err instanceof Error ? err.message : String(err);
      }
    }

    this.emit({
      type: 'plugin:registered',
      plugin: name,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * 注销插件
   *
   * @param name - 插件名称
   * @param force - 是否强制卸载
   * @returns 是否成功
   */
  unregister(name: string, force = false): boolean {
    const instance = this.plugins.get(name);

    if (!instance) {
      console.warn(`[PluginRegistry] Plugin ${name} is not registered`);
      return false;
    }

    if (instance.status === PluginStatus.Loading && !force) {
      console.warn(`[PluginRegistry] Plugin ${name} is still loading`);
      return false;
    }

    if (instance.hooks.onUnload && this.options.autoDestroy) {
      try {
        const result = instance.hooks.onUnload();
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error(`[PluginRegistry] Error during plugin ${name} unload:`, err);
          });
        }
      } catch (err) {
        console.error(`[PluginRegistry] Error during plugin ${name} unload:`, err);
      }
    }

    instance.status = PluginStatus.Unloaded;
    this.plugins.delete(name);
    this.updateSortedList();

    this.emit({
      type: 'plugin:unregistered',
      plugin: name,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * 获取插件实例
   *
   * @param name - 插件名称
   * @returns 插件实例 (如果存在)
   */
  get(name: string): PluginInstance | undefined {
    return this.plugins.get(name);
  }

  /**
   * 获取所有插件
   *
   * @returns 插件实例列表
   */
  getAll(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 获取所有已注册的插件名称
   *
   * @returns 名称列表
   */
  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * 获取所有工具
   *
   * @returns 所有插件提供的工具
   */
  getTools(): Tool[] {
    const tools: Tool[] = [];

    for (const instance of this.sortedPlugins) {
      if (instance.status === PluginStatus.Loaded) {
        tools.push(...instance.tools);
      }
    }

    return tools;
  }

  /**
   * 获取特定工具
   *
   * @param name - 工具名称
   * @returns 工具定义 (如果存在)
   */
  getTool(name: string): Tool | undefined {
    for (const instance of this.sortedPlugins) {
      if (instance.status === PluginStatus.Loaded) {
        const tool = instance.tools.find((t) => t.name === name);
        if (tool) return tool;
      }
    }
    return undefined;
  }

  /**
   * 获取已排序的插件列表
   *
   * @returns 按优先级排序的插件
   */
  getSortedPlugins(): PluginInstance[] {
    return [...this.sortedPlugins];
  }

  /**
   * 注册全局中间件
   *
   * @param middleware - 中间件
   */
  registerMiddleware(middleware: PluginMiddleware): void {
    this.globalMiddleware.push(middleware);
    this.globalMiddleware.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 获取全局中间件
   *
   * @returns 排序后的中间件列表
   */
  getMiddleware(): PluginMiddleware[] {
    return [...this.globalMiddleware];
  }

  /**
   * 调用全局钩子
   *
   * @param hookName - 钩子名称
   * @param context - 上下文数据
   * @returns 钩子结果
   */
  async invokeHook<K extends keyof PluginHooks>(
    hookName: K,
    context: Parameters<NonNullable<PluginHooks[K]>>[0] extends Record<string, unknown>
      ? Parameters<NonNullable<PluginHooks[K]>>[0]
      : never
  ): Promise<void> {
    const handlers = this.globalHooks.get(hookName);

    if (!handlers) return;

    for (const handler of handlers) {
      try {
        const result = (handler as Function)(context);
        if (result instanceof Promise) {
          await result;
        }
      } catch (err) {
        console.error(`[PluginRegistry] Error invoking hook ${hookName}:`, err);
      }
    }
  }

  /**
   * 注册全局钩子
   *
   * @param hookName - 钩子名称
   * @param handler - 处理器
   */
  registerHook<K extends keyof PluginHooks>(
    hookName: K,
    handler: NonNullable<PluginHooks[K]>
  ): () => void {
    if (!this.globalHooks.has(hookName)) {
      this.globalHooks.set(hookName, new Set());
    }

    this.globalHooks.get(hookName)!.add(handler);

    return () => {
      this.globalHooks.get(hookName)?.delete(handler);
    };
  }

  /**
   * 更新排序列表
   */
  private updateSortedList(): void {
    this.sortedPlugins = Array.from(this.plugins.values())
      .filter((p) => p.status === PluginStatus.Loaded)
      .sort((a, b) => {
        const priorityA = (a.metadata as Record<string, unknown>).priority as number || this.options.defaultPriority;
        const priorityB = (b.metadata as Record<string, unknown>).priority as number || this.options.defaultPriority;
        return priorityA - priorityB;
      });
  }

  /**
   * 发送事件
   *
   * @param event - 事件
   */
  private emit(event: PluginEvent): void {
    const listeners = this.eventListeners.get(event.type);

    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (err) {
          console.error(`[PluginRegistry] Error in event listener for ${event.type}:`, err);
        }
      }
    }
  }

  /**
   * 监听事件
   *
   * @param eventType - 事件类型
   * @param listener - 监听器
   * @returns 取消监听函数
   */
  on(eventType: string, listener: (event: PluginEvent) => void): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }

    this.eventListeners.get(eventType)!.add(listener);

    return () => {
      this.eventListeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * 统计信息
   *
   * @returns 注册统计
   */
  getStats(): {
    total: number;
    loaded: number;
    error: number;
    byType: Record<string, number>;
  } {
    const stats = {
      total: this.plugins.size,
      loaded: 0,
      error: 0,
      byType: {} as Record<string, number>,
    };

    for (const instance of this.plugins.values()) {
      if (instance.status === PluginStatus.Loaded) stats.loaded++;
      if (instance.status === PluginStatus.Error) stats.error++;

      const tags = instance.metadata.tags || [];
      for (const tag of tags) {
        stats.byType[tag] = (stats.byType[tag] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * 清空所有插件
   */
  clear(): void {
    const names = Array.from(this.plugins.keys());
    for (const name of names) {
      this.unregister(name, true);
    }
  }

  /**
   * 检查插件是否已注册
   *
   * @param name - 插件名称
   * @returns 是否已注册
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * 获取已加载插件数量
   *
   * @returns 数量
   */
  size(): number {
    return this.plugins.size;
  }
}

/**
 * 创建插件注册表
 *
 * @param options - 配置选项
 * @returns 注册表实例
 */
export function createPluginRegistry(options?: PluginRegistryOptions): PluginRegistry {
  return new PluginRegistry(options);
}
