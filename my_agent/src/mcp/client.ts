/**
 * MCP 客户端核心实现
 *
 * 支持两种传输方式：
 * - HTTP: 通过 REST API 与 MCP 服务器通信
 * - WebSocket: 实时双向通信
 *
 * 设计原则：
 * - 异步优先：所有 I/O 操作都是异步的
 * - 错误隔离：每个操作都有独立的错误处理
 * - 可扩展性：易于添加新的传输方式
 */

import type {
  MCPClient,
  MCPServerConfig,
  MCPToolCallRequest,
  MCPToolCallResult,
  MCPResource,
  MCPResourceChangeNotification,
  MCPInitializeRequest,
  MCPInitializeResult,
  MCPCapabilities,
  MCPMessage,
  ResourceProvider,
} from './types.js';
export type { MCPClient } from './types.js';
import { MCPError, MCPMessageType } from './types.js';

/**
 * MCP 客户端配置
 */
export interface MCPClientOptions {
  /** 客户端名称 */
  clientName?: string;
  /** 客户端版本 */
  clientVersion?: string;
  /** 协议版本 */
  protocolVersion?: string;
  /** 请求超时时间 (毫秒) */
  requestTimeout?: number;
  /** 重试次数 */
  retryAttempts?: number;
  /** 重试间隔 (毫秒) */
  retryDelay?: number;
}

/**
 * MCP 客户端默认配置
 */
const DEFAULT_OPTIONS: Required<MCPClientOptions> = {
  clientName: 'my-agent',
  clientVersion: '1.0.0',
  protocolVersion: '2024-11-05',
  requestTimeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
};

/**
 * 创建 MCP 客户端
 *
 * @param options - 客户端配置
 * @returns MCP 客户端实例
 */
export function createMCPClient(options?: MCPClientOptions): MCPClient {
  return new MCPClientImpl(options);
}

/**
 * MCP 客户端实现
 */
class MCPClientImpl implements MCPClient {
  private config: Required<MCPClientOptions>;
  private serverConfig: MCPServerConfig | null = null;
  private connected = false;
  private capabilities: MCPCapabilities = {};
  private messageIdCounter = 0;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private resourceChangeCallbacks: Set<(notification: MCPResourceChangeNotification) => void> = new Set();
  private resourceProviders: Map<string, ResourceProvider> = new Map();

  constructor(options?: MCPClientOptions) {
    this.config = { ...DEFAULT_OPTIONS, ...options };
  }

  /** @inheritDoc */
  get name(): string {
    return this.config.clientName;
  }

  /** @inheritDoc */
  get version(): string {
    return this.config.clientVersion;
  }

  /** @inheritDoc */
  async connect(serverConfig: MCPServerConfig): Promise<void> {
    if (this.connected) {
      throw new MCPError('Already connected to a server', 'ALREADY_CONNECTED');
    }

    this.serverConfig = serverConfig;

    try {
      switch (serverConfig.transport) {
        case 'http':
          await this.connectHttp(serverConfig);
          break;
        case 'websocket':
          await this.connectWebSocket(serverConfig);
          break;
        case 'stdio':
          await this.connectStdio(serverConfig);
          break;
        default:
          throw new MCPError(`Unsupported transport: ${serverConfig.transport}`, 'UNSUPPORTED_TRANSPORT');
      }

      // 发送初始化请求
      const initResult = await this.initialize();

      // 设置服务器能力
      this.capabilities = initResult.capabilities;
      this.connected = true;

    } catch (error) {
      this.connected = false;
      throw error;
    }
  }

  /** @inheritDoc */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    // 取消所有待处理的请求
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new MCPError('Connection closed', 'CONNECTION_CLOSED'));
      this.pendingRequests.delete(id);
    }

    // 关闭连接
    if (this.serverConfig?.transport === 'http') {
      // HTTP 连接无状态，无需特殊关闭
    }

    this.connected = false;
    this.serverConfig = null;
    this.capabilities = {};
  }

  /** @inheritDoc */
  isConnected(): boolean {
    return this.connected;
  }

  /** @inheritDoc */
  getCapabilities(): MCPCapabilities {
    return { ...this.capabilities };
  }

  /** @inheritDoc */
  async callTool(request: MCPToolCallRequest): Promise<MCPToolCallResult> {
    this.ensureConnected();

    if (!this.capabilities.tools) {
      throw new MCPError('Server does not support tools', 'TOOLS_NOT_SUPPORTED');
    }

    const messageId = this.generateMessageId();

    try {
      const response = await this.sendRequest<MCPMessage>(
        MCPMessageType.ToolCall,
        {
          id: messageId,
          tool: request.tool,
          arguments: request.arguments,
        }
      );

      if (response.type === MCPMessageType.Error) {
        return {
          id: request.id,
          success: false,
          error: String(response.payload),
        };
      }

      const result = response.payload as MCPToolCallResult;
      return {
        id: request.id,
        success: true,
        content: result.content,
      };

    } catch (error) {
      return {
        id: request.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /** @inheritDoc */
  async listResources(): Promise<MCPResource[]> {
    this.ensureConnected();

    if (!this.capabilities.resources) {
      throw new MCPError('Server does not support resources', 'RESOURCES_NOT_SUPPORTED');
    }

    // 先尝试从 MCP 服务器获取资源
    try {
      const response = await this.sendRequest<MCPMessage>(
        MCPMessageType.ResourcesList,
        {}
      );

      if (response.type === MCPMessageType.ResourcesListResult) {
        return response.payload as MCPResource[];
      }
    } catch {
      // 服务器不支持，回退到资源提供者
    }

    // 从注册的提供者获取资源
    const allResources: MCPResource[] = [];

    for (const provider of this.resourceProviders.values()) {
      const resources = await provider.list();
      allResources.push(...resources);
    }

    return allResources;
  }

  /** @inheritDoc */
  async readResource(uri: string): Promise<string> {
    this.ensureConnected();

    // 解析 URI 获取提供者
    const provider = this.resolveResourceProvider(uri);

    if (provider) {
      return provider.read(uri);
    }

    // 尝试从 MCP 服务器读取
    if (this.capabilities.resources) {
      const response = await this.sendRequest<MCPMessage>(
        MCPMessageType.ResourceRead,
        { uri }
      );

      if (response.type === MCPMessageType.ResourceReadResult) {
        return response.payload as string;
      }
    }

    throw new MCPError(`Resource not found: ${uri}`, 'RESOURCE_NOT_FOUND', 404);
  }

  /** @inheritDoc */
  async subscribeResource(uri: string): Promise<void> {
    this.ensureConnected();

    if (!this.capabilities.resourceSubscription) {
      throw new MCPError('Server does not support resource subscription', 'SUBSCRIPTION_NOT_SUPPORTED');
    }

    await this.sendRequest(MCPMessageType.ResourceSubscribe, { uri });
  }

  /** @inheritDoc */
  async unsubscribeResource(uri: string): Promise<void> {
    this.ensureConnected();

    if (!this.capabilities.resourceSubscription) {
      throw new MCPError('Server does not support resource subscription', 'SUBSCRIPTION_NOT_SUPPORTED');
    }

    await this.sendRequest(MCPMessageType.ResourceUnsubscribe, { uri });
  }

  /** @inheritDoc */
  onResourceChange(callback: (notification: MCPResourceChangeNotification) => void): void {
    this.resourceChangeCallbacks.add(callback);
  }

  /**
   * 注册资源提供者
   */
  registerResourceProvider(provider: ResourceProvider): void {
    this.resourceProviders.set(provider.type, provider);
  }

  /**
   * 取消注册资源提供者
   */
  unregisterResourceProvider(type: string): void {
    this.resourceProviders.delete(type);
  }

  // ==================== 私有方法 ====================

  /**
   * 确保已连接
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new MCPError('Not connected to server', 'NOT_CONNECTED');
    }
  }

  /**
   * 生成消息 ID
   */
  private generateMessageId(): string {
    return `${this.config.clientName}-${Date.now()}-${++this.messageIdCounter}`;
  }

  /**
   * HTTP 连接
   */
  private async connectHttp(config: MCPServerConfig): Promise<void> {
    if (!config.url) {
      throw new MCPError('HTTP transport requires URL', 'CONFIG_MISSING_URL');
    }
    // HTTP 连接为无状态，保持配置即可
  }

  /**
   * WebSocket 连接
   */
  private async connectWebSocket(config: MCPServerConfig): Promise<void> {
    if (!config.url) {
      throw new MCPError('WebSocket transport requires URL', 'CONFIG_MISSING_URL');
    }
    // WebSocket 连接实现
  }

  /**
   * Stdio 连接
   */
  private async connectStdio(config: MCPServerConfig): Promise<void> {
    if (!config.command) {
      throw new MCPError('Stdio transport requires command', 'CONFIG_MISSING_COMMAND');
    }
    // Stdio 连接实现
  }

  /**
   * 初始化
   */
  private async initialize(): Promise<MCPInitializeResult> {
    const request: MCPInitializeRequest = {
      clientName: this.config.clientName,
      clientVersion: this.config.clientVersion,
      protocolVersion: this.config.protocolVersion,
      capabilities: {
        tools: true,
        resources: true,
        subscription: true,
      },
    };

    const response = await this.sendRequest<MCPMessage>(
      MCPMessageType.Initialize,
      request
    );

    if (response.type === MCPMessageType.Error) {
      throw new MCPError(String(response.payload), 'INITIALIZATION_FAILED');
    }

    return response.payload as MCPInitializeResult;
  }

  /**
   * 发送请求
   */
  private async sendRequest<T>(type: MCPMessageType, payload: unknown): Promise<T> {
    const messageId = this.generateMessageId();

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        reject(new MCPError('Request timeout', 'REQUEST_TIMEOUT'));
      }, this.config.requestTimeout);

      // 存储待处理请求
      this.pendingRequests.set(messageId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      // 根据传输类型发送请求
      if (this.serverConfig?.transport === 'http') {
        this.sendHttpRequest(messageId, type, payload).catch((error) => {
          const pending = this.pendingRequests.get(messageId);
          if (pending) {
            clearTimeout(pending.timeout);
            pending.reject(error);
            this.pendingRequests.delete(messageId);
          }
        });
      }
    });
  }

  /**
   * 发送 HTTP 请求
   */
  private async sendHttpRequest(messageId: string, type: MCPMessageType, payload: unknown): Promise<void> {
    if (!this.serverConfig?.url) {
      throw new MCPError('Server URL not configured', 'CONFIG_MISSING_URL');
    }

    const response = await fetch(`${this.serverConfig.url}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        id: messageId,
        payload,
      }),
    });

    if (!response.ok) {
      throw new MCPError(`HTTP error: ${response.status}`, 'HTTP_ERROR', response.status);
    }

    const result = await response.json() as MCPMessage;

    // 查找并解析对应的待处理请求
    const pending = this.pendingRequests.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(result);
      this.pendingRequests.delete(messageId);
    }
  }

  /**
   * 解析资源提供者
   */
  private resolveResourceProvider(uri: string): ResourceProvider | undefined {
    // URI 格式: provider://path 或 file:///path
    const match = uri.match(/^(\w+):\/\//);

    if (match) {
      const scheme = match[1];
      return this.resourceProviders.get(scheme);
    }

    // 默认为文件系统
    return this.resourceProviders.get('filesystem');
  }

  /**
   * 处理资源变更通知 (供 WebSocket 回调使用)
   */
  // @ts-expect-error - 保留给 WebSocket 回调使用
  private handleResourceChange(notification: MCPResourceChangeNotification): void {
    for (const callback of this.resourceChangeCallbacks) {
      try {
        callback(notification);
      } catch {
        // 忽略回调中的错误
      }
    }
  }
}
