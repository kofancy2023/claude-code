/**
 * 插件系统导出
 *
 * 提供完整的插件系统功能：
 * - 类型定义 (types.ts)
 * - 插件加载器 (loader.ts)
 * - 插件注册表 (registry.ts)
 * - 生命周期管理器 (lifecycle.ts)
 */

// 类型定义
export * from './types.js';

// 插件管理器
export { PluginManager, getPluginManager } from './manager.js';
export type { PluginManagerOptions } from './manager.js';

// 插件加载器
export { PluginLoader, createPluginLoader } from './loader.js';
export type { PluginLoaderOptions, LoadResult } from './loader.js';

// 插件注册表
export { PluginRegistry, createPluginRegistry } from './registry.js';
export type { PluginRegistryOptions, PluginEvent } from './registry.js';

// 插件生命周期管理器
export { PluginLifecycleManager } from './lifecycle.js';
export type { PluginLifecycleEvent } from './lifecycle.js';
