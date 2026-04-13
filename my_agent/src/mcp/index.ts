/**
 * MCP (Model Context Protocol) 模块
 *
 * 导出所有 MCP 相关类型和函数
 */

// 类型定义
export * from './types.js';

// 客户端
export { createMCPClient } from './client.js';
export type { MCPClientOptions } from './client.js';

// MCP 集成服务
export { MCPIntegrationService, mcpIntegration } from './integration.js';
export type { MCPIntegrationOptions } from './integration.js';

// 资源提供者
export { createFileSystemProvider } from './providers/FileSystemProvider.js';
export type { FileSystemProviderConfig } from './providers/FileSystemProvider.js';

export { createGitHubProvider } from './providers/GitHubProvider.js';
export type { GitHubProviderConfig } from './providers/GitHubProvider.js';
