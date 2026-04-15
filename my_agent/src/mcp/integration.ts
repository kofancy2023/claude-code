/**
 * MCP 集成服务
 *
 * 核心职责：
 * - 将 MCP 服务器提供的工具桥接到本地工具注册表
 * - 将 MCP 资源桥接到本地资源访问系统
 * - 管理 MCP 连接生命周期
 *
 * 设计思路：
 * MCP 工具与本地工具有相同的接口（name, description, inputSchema, execute）
 * 所以可以直接包装成 ToolDefinition 注册到 toolRegistry
 */

import { createMCPClient, type MCPClient } from './client.js';
import { toolRegistry } from '../tools/registry.js';
import type {
  MCPServerConfig,
  MCPTool,
  MCPResource,
} from './types.js';
import { MCPError } from './types.js';

/**
 * MCP 工具包装器
 * 将 MCP 工具包装成本地 ToolDefinition 格式
 */
interface MCPWrappedTool {
  /** MCP 服务器 ID */
  serverId: string;
  /** 原始 MCP 工具 */
  mcpTool: MCPTool;
  /** MCP 客户端引用 */
  client: MCPClient;
}

/**
 * MCP 集成服务配置
 */
export interface MCPIntegrationOptions {
  /** MCP 服务器配置列表 */
  servers: MCPServerConfig[];
  /** 是否自动连接（默认 true） */
  autoConnect?: boolean;
  /** 是否将 MCP 工具注册到本地注册表（默认 true） */
  registerToLocalRegistry?: boolean;
}

/**
 * MCP 集成服务
 *
 * 使用示例：
 * ```typescript
 * const integration = new MCPIntegrationService({
 *   servers: [
 *     { transport: 'http', url: 'http://localhost:3100' }
 *   ]
 * });
 *
 * // 连接并注册工具
 * await integration.connect();
 *
 * // 查看已注册的 MCP 工具
 * integration.getRegisteredTools();
 *
 * // 断开连接
 * await integration.disconnect();
 * ```
 */
export class MCPIntegrationService {
  /** MCP 客户端映射 */
  private clients: Map<string, MCPClient> = new Map();
  /** 已包装的 MCP 工具 */
  private wrappedTools: Map<string, MCPWrappedTool> = new Map();
  /** 服务配置 */
  private options: Required<MCPIntegrationOptions>;
  /** 是否已连接 */
  private connected = false;

  constructor(options: MCPIntegrationOptions) {
    this.options = {
      autoConnect: true,
      registerToLocalRegistry: true,
      ...options,
    };
  }

  /**
   * 连接所有 MCP 服务器并注册工具
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const connectPromises = this.options.servers.map(async (serverConfig) => {
      const serverId = serverConfig.name || `${serverConfig.transport}-${serverConfig.url}`;

      // 创建 MCP 客户端
      const client = createMCPClient({
        clientName: 'my-agent',
        clientVersion: '1.0.0',
      });

      // 连接服务器
      await client.connect(serverConfig);

      // 保存客户端
      this.clients.set(serverId, client);

      // 如果需要注册到本地注册表
      if (this.options.registerToLocalRegistry) {
        await this.registerToolsFromServer(serverId, client);
      }
    });

    await Promise.all(connectPromises);
    this.connected = true;
  }

  /**
   * 断开所有连接
   */
  async disconnect(): Promise<void> {
    for (const [serverId, client] of this.clients) {
      try {
        await client.disconnect();
      } catch (error) {
        console.warn(`Failed to disconnect from ${serverId}:`, error);
      }
    }

    // 取消注册所有工具
    for (const [toolName] of this.wrappedTools) {
      toolRegistry.unregister(toolName);
    }

    this.clients.clear();
    this.wrappedTools.clear();
    this.connected = false;
  }

  /**
   * 从 MCP 服务器注册工具到本地注册表
   */
  private async registerToolsFromServer(serverId: string, client: MCPClient): Promise<void> {
    const capabilities = client.getCapabilities();

    if (!capabilities.tools) {
      console.log(`[MCP] Server ${serverId} does not support tools`);
      return;
    }

    // 获取服务器提供的工具列表
    // 注意：这里需要服务器支持 list_tools 能力
    const tools = await this.listServerTools(client);

    for (const tool of tools) {
      this.registerMCPTool(serverId, tool, client);
    }
  }

  /**
   * 列出服务器支持的工具
   */
  private async listServerTools(client: MCPClient): Promise<MCPTool[]> {
    try {
      // 尝试从客户端获取工具列表
      // MCP 规范中通常通过 tools/list 请求获取
      const tools = await (client as unknown as {
        listTools(): Promise<MCPTool[]>;
      }).listTools?.();

      return tools || [];
    } catch {
      // 如果服务器不支持 list_tools，返回空数组
      return [];
    }
  }

  /**
   * 注册单个 MCP 工具到本地注册表
   */
  private registerMCPTool(serverId: string, mcpTool: MCPTool, client: MCPClient): void {
    // 生成唯一的工具名称：mcp_{serverId}_{toolName}
    const toolName = `mcp_${serverId}_${mcpTool.name}`;

    // 包装 MCP 工具
    const wrappedTool = {
      serverId,
      mcpTool,
      client,
    };

    this.wrappedTools.set(toolName, wrappedTool);

    // 转换为本地 ToolDefinition 格式
    const toolDefinition = {
      name: toolName,
      description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
      inputSchema: mcpTool.inputSchema,
      execute: async (input: Record<string, unknown>) => {
        const result = await client.callTool({
          id: `call-${Date.now()}`,
          tool: mcpTool.name,
          arguments: input,
        });

        if (!result.success) {
          throw new MCPError(result.error || 'Tool call failed', 'TOOL_CALL_FAILED');
        }

        return result.content;
      },
    };

    // 注册到本地工具注册表
    toolRegistry.register(toolDefinition);
  }

  /**
   * 获取所有已注册的 MCP 工具
   */
  getRegisteredTools(): Array<{
    name: string;
    description: string;
    serverId: string;
    originalName: string;
  }> {
    const tools: Array<{
      name: string;
      description: string;
      serverId: string;
      originalName: string;
    }> = [];

    for (const [toolName, wrapped] of this.wrappedTools) {
      tools.push({
        name: toolName,
        description: wrapped.mcpTool.description || `MCP tool: ${wrapped.mcpTool.name}`,
        serverId: wrapped.serverId,
        originalName: wrapped.mcpTool.name,
      });
    }

    return tools;
  }

  /**
   * 获取 MCP 资源列表
   */
  async listResources(): Promise<MCPResource[]> {
    const allResources: MCPResource[] = [];

    for (const [, client] of this.clients) {
      try {
        const resources = await client.listResources();
        allResources.push(...resources);
      } catch {
        // 忽略单个客户端的错误
      }
    }

    return allResources;
  }

  /**
   * 获取连接状态
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 获取客户端数量
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * 获取已注册工具数量
   */
  getToolCount(): number {
    return this.wrappedTools.size;
  }
}

/**
 * MCP 集成服务单例
 */
export const mcpIntegration = new MCPIntegrationService({
  servers: [],
  autoConnect: false,
  registerToLocalRegistry: true,
});
