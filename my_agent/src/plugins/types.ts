/**
 * 插件系统类型定义
 *
 * 本模块定义了插件系统的核心接口和类型，包括：
 * - 插件接口 (AgentPlugin)
 * - 生命周期钩子 (PluginHooks)
 * - 工具接口 (Tool)
 * - 插件元数据 (PluginMetadata)
 */

import type { Tool } from '../types/index.js';

/**
 * 插件生命周期钩子
 * 插件可以在这些时机注入自定义逻辑
 */
export interface PluginHooks {
  /** 插件加载前调用 */
  onLoad?: () => void | Promise<void>;

  /** 插件卸载前调用 */
  onUnload?: () => void | Promise<void>;

  /** 工具执行前调用 */
  beforeToolExecute?: (
    tool: Tool,
    input: Record<string, unknown>
  ) => void | Promise<void>;

  /** 工具执行后调用 */
  afterToolExecute?: (
    tool: Tool,
    input: Record<string, unknown>,
    result: string
  ) => void | Promise<void>;

  /** 工具执行出错时调用 */
  onToolError?: (
    tool: Tool,
    input: Record<string, unknown>,
    error: Error
  ) => void | Promise<void>;

  /** 会话开始时调用 */
  onSessionStart?: (sessionId: string) => void | Promise<void>;

  /** 会话结束时调用 */
  onSessionEnd?: (sessionId: string) => void | Promise<void>;

  /** 消息发送前调用 */
  beforeMessageSend?: (
    message: { role: string; content: string }
  ) => { role: string; content: string } | void | Promise<{ role: string; content: string } | void>;

  /** 消息接收后调用 */
  afterMessageReceive?: (
    message: { role: string; content: string }
  ) => void | Promise<void>;

  /** AI 查询开始时调用 */
  onQueryStart?: (query: string) => void | Promise<void>;

  /** AI 查询结束时调用 */
  onQueryEnd?: (query: string, response: string) => void | Promise<void>;
}

/**
 * 插件中间件
 * 可以在工具执行链中插入自定义处理
 */
export interface PluginMiddleware {
  /** 中间件名称 */
  name: string;

  /** 中间件优先级 (数字越小优先级越高) */
  priority: number;

  /** 处理函数 */
  handler: (
    context: MiddlewareContext,
    next: () => Promise<string>
  ) => Promise<string>;
}

/**
 * 中间件上下文
 */
export interface MiddlewareContext {
  /** 插件名称 */
  pluginName: string;

  /** 工具名称 */
  toolName: string;

  /** 工具输入参数 */
  input: Record<string, unknown>;

  /** 额外的上下文数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 插件资源
 * 插件可以声明自己需要的资源
 */
export interface PluginResource {
  /** 资源类型 */
  type: 'file' | 'directory' | 'config' | 'network';

  /** 资源路径或标识 */
  uri: string;

  /** 资源描述 */
  description?: string;

  /** 是否必需 */
  required: boolean;
}

/**
 * 插件依赖
 * 插件可以声明对其他插件的依赖
 */
export interface PluginDependency {
  /** 依赖的插件名称 */
  name: string;

  /** 最低版本要求 */
  version?: string;

  /** 版本范围 */
  versionRange?: string;
}

/**
 * 插件配置
 */
export interface PluginConfig {
  /** 配置键 */
  key: string;

  /** 配置值 */
  value: unknown;

  /** 配置类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';

  /** 配置描述 */
  description?: string;

  /** 是否敏感 (不应在日志中显示) */
  sensitive?: boolean;
}

/**
 * 插件元数据
 */
export interface PluginMetadata {
  /** 插件唯一名称 */
  name: string;

  /** 插件版本 */
  version: string;

  /** 插件描述 */
  description?: string;

  /** 作者信息 */
  author?: string;

  /** 插件主页 */
  homepage?: string;

  /** 许可证 */
  license?: string;

  /** 插件标签 */
  tags?: string[];

  /** 最低兼容版本 */
  minAgentVersion?: string;
}

/**
 * 插件状态
 */
export enum PluginStatus {
  /** 插件已加载 */
  Loaded = 'loaded',

  /** 插件已卸载 */
  Unloaded = 'unloaded',

  /** 插件加载中 */
  Loading = 'loading',

  /** 插件加载失败 */
  Error = 'error',

  /** 插件已禁用 */
  Disabled = 'disabled',

  /** 插件激活并运行中 */
  Active = 'active',

  /** 插件已暂停 */
  Paused = 'paused',
}

/**
 * 插件实例 (运行时)
 * 包含插件的运行时状态和信息
 */
export interface PluginInstance {
  /** 插件元数据 */
  metadata: PluginMetadata;

  /** 当前状态 */
  status: PluginStatus;

  /** 注册的工具 */
  tools: Tool[];

  /** 生命周期钩子 */
  hooks: PluginHooks;

  /** 中间件列表 */
  middleware: PluginMiddleware[];

  /** 插件配置 */
  config: Map<string, PluginConfig>;

  /** 加载时间 */
  loadedAt?: number;

  /** 最后错误信息 */
  lastError?: string;

  /** 实例特定数据 */
  data?: Record<string, unknown>;

  /** 原始插件定义（用于重载） */
  plugin?: AgentPlugin;
}

/**
 * 插件接口
 * 所有插件必须实现此接口
 */
export interface AgentPlugin {
  /** 插件元数据 */
  metadata: PluginMetadata;

  /** 插件配置 */
  config?: PluginConfig[];

  /** 插件依赖 */
  dependencies?: PluginDependency[];

  /** 插件资源需求 */
  resources?: PluginResource[];

  /** 注册的工具列表 */
  tools?: Tool[];

  /** 生命周期钩子 */
  hooks?: PluginHooks;

  /** 中间件 */
  middleware?: PluginMiddleware[];

  /** 初始化方法 (可选) */
  initialize?: () => void | Promise<void>;

  /** 销毁方法 (可选) */
  destroy?: () => void | Promise<void>;
}

/**
 * 内置插件类型
 * 用于标识插件的来源
 */
export enum PluginType {
  /** 内置插件 (随Agent一起发布) */
  Builtin = 'builtin',

  /** 用户插件 (用户本地创建) */
  User = 'user',

  /** 第三方插件 (从外部安装) */
  ThirdParty = 'third_party',
}

/**
 * 插件加载来源
 */
export interface PluginSource {
  /** 插件类型 */
  type: PluginType;

  /** 插件路径或包名 */
  path: string;

  /** 插件加载优先级 */
  priority?: number;
}

/**
 * 插件验证结果
 */
export interface PluginValidationResult {
  /** 是否有效 */
  valid: boolean;

  /** 错误信息 */
  errors: string[];

  /** 警告信息 */
  warnings: string[];
}
