import type { Tool } from '../types/index.js';
import { BashTool } from './BashTool.js';
import { FileReadTool } from './FileReadTool.js';
import { FileWriteTool } from './FileWriteTool.js';
import { FileListTool } from './FileListTool.js';
import { GlobTool } from './GlobTool.js';
import { GrepTool } from './GrepTool.js';
import { EditTool } from './EditTool.js';
import { MkdirTool } from './MkdirTool.js';
import { RmTool } from './RmTool.js';
import { CopyTool } from './CopyTool.js';
import { MoveTool } from './MoveTool.js';
import { WebSearchTool } from './WebSearchTool.js';
import { DateTool } from './DateTool.js';
import { GitHubRepoTool } from './GitHubRepoTool.js';
import { GitHubIssueTool } from './GitHubIssueTool.js';
import { GitHubCodeSearchTool } from './GitHubCodeSearchTool.js';
import { GitHubPullRequestTool } from './GitHubPullRequestTool.js';
import { GitHubCommitTool } from './GitHubCommitTool.js';
import { GitHubBranchTool } from './GitHubBranchTool.js';
import { GitHubUserTool } from './GitHubUserTool.js';
import { GitStatusTool, GitCommitTool, GitPushTool, GitPullTool, GitBranchTool, GitDiffTool } from './GitTools.js';

/**
 * 参数别名映射表
 *
 * AI 返回的参数名可能与工具实际定义的参数名不一致。
 * 此表定义了各工具的参数别名映射，将 AI 常用的参数名映射到标准参数名。
 *
 * 格式: { 工具名: { 别名: 标准参数名 } }
 */
const PARAM_ALIASES: Record<string, Record<string, string>> = {
  GrepTool: {
    'file_path': 'path',
    'filePath': 'path',
    'regex': 'pattern',
    'flags': 'options',
  },
  EditTool: {
    'file_path': 'path',
    'filePath': 'path',
    'new_content': 'newString',
    'newContent': 'newString',
    'old_content': 'oldString',
    'oldContent': 'oldString',
    'replacement': 'newString',
  },
  FileReadTool: {
    'file_path': 'path',
    'filePath': 'path',
    'filename': 'path',
  },
  FileWriteTool: {
    'file_path': 'path',
    'filePath': 'path',
    'filename': 'path',
    'content': 'content',
    'text': 'content',
  },
  FileListTool: {
    'directory': 'path',
    'dir': 'path',
    'folder': 'path',
  },
  GlobTool: {
    'directory': 'path',
    'dir': 'path',
    'folder': 'path',
    'pattern': 'pattern',
  },
  MkdirTool: {
    'directory': 'path',
    'dir': 'path',
    'folder': 'path',
    'name': 'path',
  },
  RmTool: {
    'file_path': 'path',
    'filePath': 'path',
    'filename': 'path',
    'target': 'path',
    'recursive': 'recursive',
    'force': 'force',
  },
  CopyTool: {
    'src': 'source',
    'source_path': 'source',
    'sourcePath': 'source',
    'dest': 'destination',
    'dst': 'destination',
    'destination_path': 'destination',
    'destinationPath': 'destination',
  },
  MoveTool: {
    'src': 'source',
    'source_path': 'source',
    'sourcePath': 'source',
    'dest': 'destination',
    'dst': 'destination',
    'destination_path': 'destination',
    'destinationPath': 'destination',
  },
  BashTool: {
    'cmd': 'command',
    'shell': 'command',
    'script': 'command',
  },
  WebSearchTool: {
    'query': 'query',
    'search': 'query',
    'term': 'query',
  },
};

/**
 * 工具注册表类
 *
 * 核心功能：管理所有可用工具的注册和查询
 *
 * 设计模式：单例模式
 * 全局只有一个 toolRegistry 实例
 */
export class ToolRegistry {
  /** 工具存储映射，key 为工具名称 */
  private tools: Map<string, Tool> = new Map();

  constructor() {
    // 构造函数中自动注册所有默认工具
    this.registerDefaultTools();
  }

  /**
   * 注册所有默认工具
   *
   * 默认工具包括：
   * - BashTool: 执行本地命令行
   * - FileReadTool: 读取文件
   * - FileWriteTool: 写入文件
   * - FileListTool: 列出目录文件
   * - GlobTool: 文件模式匹配
   * - EditTool: 编辑文件
   * - WebSearchTool: 网络搜索
   * - GitHub*Tools: GitHub 相关操作
   */
  private registerDefaultTools(): void {
    this.register(BashTool);
    this.register(FileReadTool);
    this.register(FileWriteTool);
    this.register(FileListTool);
    this.register(GlobTool);
    this.register(GrepTool);
    this.register(EditTool);
    this.register(MkdirTool);
    this.register(RmTool);
    this.register(CopyTool);
    this.register(MoveTool);
    this.register(WebSearchTool);
    this.register(DateTool);
    this.register(GitHubRepoTool);
    this.register(GitHubIssueTool);
    this.register(GitHubCodeSearchTool);
    this.register(GitHubPullRequestTool);
    this.register(GitHubCommitTool);
    this.register(GitHubBranchTool);
    this.register(GitHubUserTool);
    this.register(GitStatusTool);
    this.register(GitCommitTool);
    this.register(GitPushTool);
    this.register(GitPullTool);
    this.register(GitBranchTool);
    this.register(GitDiffTool);
  }

  /**
   * 注册一个工具
   *
   * @param tool - 工具实例
   */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 根据名称获取工具
   *
   * @param name - 工具名称
   * @returns 工具实例，如果不存在则返回 undefined
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有已注册的工具
   *
   * @returns 工具实例数组
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 检查工具是否已注册
   *
   * @param name - 工具名称
   * @returns 是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 注销工具
   *
   * @param name - 工具名称
   * @returns 是否成功注销
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 标准化工具参数
   *
   * 将 AI 返回的参数名（可能使用别名）转换为工具实际需要的标准参数名。
   * 例如: { file_path: "xxx" } → { path: "xxx" }
   *
   * @param toolName - 工具名称
   * @param params - AI 返回的原始参数
   * @returns 标准化后的参数
   */
  normalizeParams(toolName: string, params: Record<string, unknown>): Record<string, unknown> {
    const aliases = PARAM_ALIASES[toolName];
    if (!aliases) {
      return params;
    }

    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      const standardKey = aliases[key] || key;
      normalized[standardKey] = value;
    }
    return normalized;
  }
}

/**
 * 标准化工具参数
 *
 * 将 AI 返回的参数名（可能使用别名）转换为工具实际需要的标准参数名。
 * 这是对外提供的便捷函数。
 *
 * @param toolName - 工具名称
 * @param params - AI 返回的原始参数
 * @returns 标准化后的参数
 *
 * @example
 * const normalized = normalizeToolParams('GrepTool', { file_path: 'test.ts', regex: 'TODO' });
 * // 结果: { path: 'test.ts', pattern: 'TODO' }
 */
export function normalizeToolParams(toolName: string, params: Record<string, unknown>): Record<string, unknown> {
  return toolRegistry.normalizeParams(toolName, params);
}

/**
 * 全局工具注册表实例
 *
 * 在应用启动时自动注册所有默认工具
 */
export const toolRegistry = new ToolRegistry();
