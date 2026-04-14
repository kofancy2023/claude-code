/**
 * 插件生命周期管理器
 *
 * 核心职责：
 * - 管理插件的加载、卸载、暂停、恢复
 * - 处理插件依赖解析
 * - 提供插件状态查询
 *
 * 设计思路：
 * 插件生命周期：Loading → Loaded → Active ⇄ Paused → Unloaded
 */

import type { AgentPlugin, PluginInstance } from './types.js';
import { PluginStatus } from './types.js';
import { PluginRegistry } from './registry.js';

/**
 * 插件生命周期状态转换事件
 */
export interface PluginLifecycleEvent {
  /** 插件名称 */
  pluginName: string;
  /** 事件类型 */
  event: 'load' | 'unload' | 'pause' | 'resume' | 'reload' | 'error';
  /** 时间戳 */
  timestamp: number;
  /** 附加数据 */
  data?: unknown;
}

/**
 * 插件依赖节点（用于依赖图构建）
 */
interface DependencyNode {
  /** 插件名称 */
  name: string;
  /** 依赖的插件 */
  dependencies: string[];
  /** 是否已访问（用于循环检测） */
  visited: boolean;
  /** 是否在当前递归栈中（用于循环检测） */
  inStack: boolean;
}

/**
 * 插件生命周期管理器
 */
export class PluginLifecycleManager {
  /** 插件注册表引用 */
  private registry: PluginRegistry;
  /** 暂停的插件集合 */
  private pausedPlugins: Set<string> = new Set();
  /** 生命周期事件监听器 */
  private lifecycleListeners: Set<(event: PluginLifecycleEvent) => void> = new Set();
  /** 插件加载顺序记录 */
  private loadOrder: string[] = [];

  constructor(registry: PluginRegistry) {
    this.registry = registry;
  }

  /**
   * 加载插件（带依赖解析）
   *
   * @param plugin - 插件实例
   * @returns 是否加载成功
   */
  async loadPlugin(plugin: AgentPlugin): Promise<{ success: boolean; error?: string }> {
    const name = plugin.metadata.name;

    // 检查依赖
    if (plugin.dependencies && plugin.dependencies.length > 0) {
      const depResult = this.resolveDependencies(plugin.dependencies);
      if (!depResult.success) {
        return { success: false, error: `Dependency error: ${depResult.error}` };
      }
    }

    // 按依赖顺序加载
    const loadSequence = this.getLoadSequence(name);

    for (const depName of loadSequence) {
      if (this.registry.get(depName)) {
        continue; // 已加载
      }

      // 如果没有预先提供依赖插件，尝试从已加载插件中查找
      const depPlugin = this.findPluginByName(depName);
      if (!depPlugin) {
        return { success: false, error: `Required dependency not found: ${depName}` };
      }

      const result = this.registry.register(depPlugin);
      if (!result) {
        return { success: false, error: `Failed to load dependency: ${depName}` };
      }
    }

    // 注册目标插件
    const result = this.registry.register(plugin);
    if (result) {
      this.loadOrder.push(name);
      this.emitLifecycleEvent(name, 'load');
    }

    return { success: result, error: result ? undefined : 'Registration failed' };
  }

  /**
   * 卸载插件
   *
   * @param name - 插件名称
   * @param force - 是否强制卸载
   * @returns 是否成功
   */
  async unloadPlugin(name: string, force = false): Promise<boolean> {
    // 检查是否有其他插件依赖此插件
    const dependents = this.findDependents(name);
    if (dependents.length > 0 && !force) {
      console.error(`[LifecycleManager] Cannot unload ${name}: other plugins depend on it: ${dependents.join(', ')}`);
      return false;
    }

    // 如果插件处于暂停状态，先恢复
    if (this.pausedPlugins.has(name)) {
      this.pausedPlugins.delete(name);
    }

    const result = this.registry.unregister(name, force);
    if (result) {
      this.loadOrder = this.loadOrder.filter(n => n !== name);
      this.emitLifecycleEvent(name, 'unload');
    }

    return result;
  }

  /**
   * 暂停插件
   *
   * 暂停后的插件：
   * - 工具不可用
   * - 钩子不触发
   * - 但状态保留，可以恢复
   *
   * @param name - 插件名称
   */
  pausePlugin(name: string): boolean {
    const instance = this.registry.get(name);
    if (!instance) {
      console.warn(`[LifecycleManager] Plugin ${name} not found`);
      return false;
    }

    if (this.pausedPlugins.has(name)) {
      console.warn(`[LifecycleManager] Plugin ${name} is already paused`);
      return false;
    }

    instance.status = PluginStatus.Paused;
    this.pausedPlugins.add(name);
    this.emitLifecycleEvent(name, 'pause');

    return true;
  }

  /**
   * 恢复插件
   *
   * @param name - 插件名称
   */
  resumePlugin(name: string): boolean {
    if (!this.pausedPlugins.has(name)) {
      console.warn(`[LifecycleManager] Plugin ${name} is not paused`);
      return false;
    }

    const instance = this.registry.get(name);
    if (!instance) {
      console.warn(`[LifecycleManager] Plugin ${name} not found`);
      return false;
    }

    instance.status = PluginStatus.Active;
    this.pausedPlugins.delete(name);
    this.emitLifecycleEvent(name, 'resume');

    return true;
  }

  /**
   * 重载插件
   *
   * 相当于 unload + load
   *
   * @param name - 插件名称
   * @returns 是否成功
   */
  async reloadPlugin(name: string): Promise<boolean> {
    const instance = this.registry.get(name);
    if (!instance) {
      console.warn(`[LifecycleManager] Plugin ${name} not found`);
      return false;
    }

    // 保存插件定义（需要插件自己提供）
    const pluginDef = (instance as unknown as { plugin?: AgentPlugin }).plugin;
    if (!pluginDef) {
      console.error(`[LifecycleManager] Cannot reload ${name}: plugin definition not preserved`);
      return false;
    }

    // 卸载
    await this.unloadPlugin(name, true);

    // 重新加载
    const result = await this.loadPlugin(pluginDef);
    if (result.success) {
      this.emitLifecycleEvent(name, 'reload');
    }

    return result.success;
  }

  /**
   * 获取插件加载顺序
   */
  getLoadOrder(): string[] {
    return [...this.loadOrder];
  }

  /**
   * 获取插件当前状态
   */
  getPluginStatus(name: string): PluginStatus | 'paused' {
    if (this.pausedPlugins.has(name)) {
      return 'paused';
    }
    const instance = this.registry.get(name);
    return instance?.status || PluginStatus.Unloaded;
  }

  /**
   * 检查插件是否已暂停
   */
  isPaused(name: string): boolean {
    return this.pausedPlugins.has(name);
  }

  /**
   * 订阅生命周期事件
   */
  onLifecycleEvent(listener: (event: PluginLifecycleEvent) => void): () => void {
    this.lifecycleListeners.add(listener);
    return () => this.lifecycleListeners.delete(listener);
  }

  /**
   * 解析依赖关系
   */
  private resolveDependencies(dependencies: Array<{ name: string; version?: string }>): { success: boolean; error?: string } {
    for (const dep of dependencies) {
      const instance = this.registry.get(dep.name);
      if (!instance) {
        return { success: false, error: `Missing dependency: ${dep.name}` };
      }

      if (dep.version) {
        const loadedVersion = instance.metadata.version;
        if (!this.versionSatisfies(loadedVersion, dep.version)) {
          return { success: false, error: `${dep.name} version ${loadedVersion} does not satisfy ${dep.version}` };
        }
      }
    }

    return { success: true };
  }

  /**
   * 获取加载顺序（基于依赖拓扑排序）
   */
  private getLoadSequence(targetPlugin: string): string[] {
    const graph = new Map<string, DependencyNode>();
    const allPlugins = this.registry.getAllPlugins();

    // 构建依赖图
    for (const instance of allPlugins) {
      const deps = (instance.metadata as unknown as { dependencies?: string[] }).dependencies || [];
      graph.set(instance.metadata.name, {
        name: instance.metadata.name,
        dependencies: deps,
        visited: false,
        inStack: false,
      });
    }

    const sequence: string[] = [];

    // 拓扑排序（Kahn 算法）
    const visit = (name: string): boolean => {
      const node = graph.get(name);
      if (!node) return true;

      if (node.visited) return true;
      if (node.inStack) {
        console.error(`[LifecycleManager] Circular dependency detected involving ${name}`);
        return false;
      }

      node.inStack = true;

      for (const dep of node.dependencies) {
        if (!visit(dep)) return false;
      }

      node.inStack = false;
      node.visited = true;
      sequence.push(name);

      return true;
    };

    if (!visit(targetPlugin)) {
      return [];
    }

    return sequence;
  }

  /**
   * 查找依赖此插件的其他插件
   */
  private findDependents(name: string): string[] {
    const dependents: string[] = [];
    const allPlugins = this.registry.getAllPlugins();

    for (const instance of allPlugins) {
      const deps = (instance.metadata as unknown as { dependencies?: string[] }).dependencies || [];
      if (deps.includes(name)) {
        dependents.push(instance.metadata.name);
      }
    }

    return dependents;
  }

  /**
   * 根据名称查找插件定义
   */
  private findPluginByName(name: string): AgentPlugin | undefined {
    // 这里需要访问 PluginInstance 中保存的原始插件定义
    const instance = this.registry.get(name);
    if (!instance) return undefined;
    return (instance as unknown as { plugin?: AgentPlugin }).plugin;
  }

  /**
   * 版本兼容性检查
   */
  private versionSatisfies(version: string, range: string): boolean {
    // 简化实现：支持 semver 的 ^ 和 ~ 范围
    if (range.startsWith('^')) {
      const minVersion = range.slice(1).split('.').map(Number);
      const [major, minor] = version.split('.').map(Number);
      return major === minVersion[0] && minor >= minVersion[1];
    }
    if (range.startsWith('~')) {
      const minVersion = range.slice(1).split('.').map(Number);
      const [major, minor, patch] = version.split('.').map(Number);
      return major === minVersion[0] && minor === minVersion[1] && patch >= minVersion[2];
    }
    return version === range;
  }

  /**
   * 触发生命周期事件
   */
  private emitLifecycleEvent(pluginName: string, event: PluginLifecycleEvent['event'], data?: unknown): void {
    const lifecycleEvent: PluginLifecycleEvent = {
      pluginName,
      event,
      timestamp: Date.now(),
      data,
    };

    for (const listener of this.lifecycleListeners) {
      try {
        listener(lifecycleEvent);
      } catch (error) {
        console.error('[LifecycleManager] Error in lifecycle listener:', error);
      }
    }
  }
}
