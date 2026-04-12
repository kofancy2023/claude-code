/**
 * MCP (Model Context Protocol) 类型定义
 *
 * MCP 是连接 AI Agent 与外部工具/资源的标准协议
 * 参考 Anthropic 的 MCP 规范设计
 */

/**
 * MCP 消息类型
 */
export enum MCPMessageType {
  /** 初始化请求 */
  Initialize = 'initialize',
  /** 初始化响应 */
  InitializeResult = 'initialize/result',
  /** 工具调用请求 */
  ToolCall = 'tools/call',
  /** 工具调用响应 */
  ToolCallResult = 'tools/call/result',
  /** 资源列表请求 */
  ResourcesList = 'resources/list',
  /** 资源列表响应 */
  ResourcesListResult = 'resources/list/result',
  /** 资源读取请求 */
  ResourceRead = 'resources/read',
  /** 资源读取响应 */
  ResourceReadResult = 'resources/read/result',
  /** 资源订阅 */
  ResourceSubscribe = 'resources/subscribe',
  /** 资源取消订阅 */
  ResourceUnsubscribe = 'resources/unsubscribe',
  /** 错误响应 */
  Error = 'error',
}

/**
 * MCP 资源类型
 */
export enum MCPResourceType {
  /** 文件系统资源 */
  FileSystem = 'filesystem',
  /** GitHub 资源 */
  GitHub = 'github',
  /** 数据库资源 */
  Database = 'database',
  /** HTTP API 资源 */
  HttpApi = 'http_api',
  /** 自定义资源 */
  Custom = 'custom',
}

/**
 * MCP 资源接口
 */
export interface MCPResource {
  /** 资源 URI */
  uri: string;
  /** 资源名称 */
  name: string;
  /** 资源描述 */
  description?: string;
  /** 资源类型 */
  type: MCPResourceType;
  /** MIME 类型 */
  mimeType?: string;
  /** 资源元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * MCP 工具接口
 */
export interface MCPTool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 输入参数 schema */
  inputSchema: {
    type: 'object';
    properties: Record<string, MCPProperty>;
    required?: string[];
  };
}

/**
 * MCP 属性定义
 */
export interface MCPProperty {
  /** 属性类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** 属性描述 */
  description?: string;
}

/**
 * MCP 工具调用请求
 */
export interface MCPToolCallRequest {
  /** 请求 ID */
  id: string;
  /** 工具名称 */
  tool: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
}

/**
 * MCP 工具调用响应
 */
export interface MCPToolCallResult {
  /** 请求 ID */
  id: string;
  /** 是否成功 */
  success: boolean;
  /** 结果内容 */
  content?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * MCP 资源变更通知
 */
export interface MCPResourceChangeNotification {
  /** 资源 URI */
  uri: string;
  /** 变更类型 */
  changeType: 'created' | 'updated' | 'deleted';
}

/**
 * MCP 服务器配置
 */
export interface MCPServerConfig {
  /** 服务器名称 */
  name: string;
  /** 服务器 URL (用于 HTTP transport) */
  url?: string;
  /** 服务器命令 (用于 stdio transport) */
  command?: string;
  /** 命令参数 */
  args?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
  /** 传输类型 */
  transport: 'http' | 'stdio' | 'websocket';
}

/**
 * MCP 客户端接口
 */
export interface MCPClient {
  /** 客户端名称 */
  name: string;
  /** 客户端版本 */
  version: string;

  /** 连接服务器 */
  connect(config: MCPServerConfig): Promise<void>;

  /** 断开连接 */
  disconnect(): Promise<void>;

  /** 是否已连接 */
  isConnected(): boolean;

  /** 获取服务器能力 */
  getCapabilities(): MCPCapabilities;

  /** 调用工具 */
  callTool(request: MCPToolCallRequest): Promise<MCPToolCallResult>;

  /** 列出资源 */
  listResources(): Promise<MCPResource[]>;

  /** 读取资源 */
  readResource(uri: string): Promise<string>;

  /** 订阅资源变更 */
  subscribeResource(uri: string): Promise<void>;

  /** 取消订阅 */
  unsubscribeResource(uri: string): Promise<void>;

  /** 设置资源变更回调 */
  onResourceChange(callback: (notification: MCPResourceChangeNotification) => void): void;
}

/**
 * MCP 服务器能力
 */
export interface MCPCapabilities {
  /** 是否支持工具 */
  tools?: boolean;
  /** 是否支持资源 */
  resources?: boolean;
  /** 是否支持资源订阅 */
  resourceSubscription?: boolean;
  /** 是否支持提示 */
  prompts?: boolean;
  /** 自定义能力 */
  custom?: Record<string, unknown>;
}

/**
 * MCP 初始化请求
 */
export interface MCPInitializeRequest {
  /** 客户端名称 */
  clientName: string;
  /** 客户端版本 */
  clientVersion: string;
  /** 协议版本 */
  protocolVersion: string;
  /** 能力请求 */
  capabilities: {
    /** 需要的工具能力 */
    tools?: boolean;
    /** 需要的资源能力 */
    resources?: boolean;
    /** 需要的订阅能力 */
    subscription?: boolean;
  };
}

/**
 * MCP 初始化响应
 */
export interface MCPInitializeResult {
  /** 协议版本 */
  protocolVersion: string;
  /** 服务器信息 */
  serverInfo: {
    name: string;
    version: string;
  };
  /** 服务器能力 */
  capabilities: MCPCapabilities;
}

/**
 * MCP 消息接口
 */
export interface MCPMessage {
  /** 消息类型 */
  type: MCPMessageType;
  /** 消息载荷 */
  payload: unknown;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 资源提供者接口
 */
export interface ResourceProvider {
  /** 提供者名称 */
  name: string;
  /** 提供者类型 */
  type: MCPResourceType;

  /** 列出资源 */
  list(): Promise<MCPResource[]>;

  /** 读取资源 */
  read(uri: string): Promise<string>;

  /** 检查资源是否存在 */
  exists(uri: string): Promise<boolean>;

  /** 获取资源元数据 */
  getMetadata(uri: string): Promise<Record<string, unknown> | undefined>;
}

/**
 * MCP 错误类
 */
export class MCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'MCPError';
  }
}
