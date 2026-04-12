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
}

/**
 * 全局工具注册表实例
 *
 * 在应用启动时自动注册所有默认工具
 */
export const toolRegistry = new ToolRegistry();
