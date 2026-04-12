/**
 * GitHub 分支工具
 *
 * 用于列出 GitHub 仓库中的所有分支
 *
 * 功能：
 * - 列出仓库的所有分支
 * - 支持筛选保护分支
 * - 显示分支的提交信息和状态检查状态
 *
 * 使用场景：
 * - 查看仓库有哪些分支
 * - 查找特定分支
 * - 检查保护分支的配置
 */
/**
 * GitHub 分支工具
 *
 * 用于查看 GitHub 仓库的分支信息
 *
 * 功能：
 * - 列出仓库的所有分支
 * - 筛选受保护的分支
 * - 显示分支的提交 SHA 和状态检查信息
 *
 * 使用场景：
 * - 查看仓库有哪些分支
 * - 查找受保护的分支
 * - 了解分支的最后提交信息
 */
import type { Tool } from '../types/index.js';

/**
 * GitHub 分支工具
 *
 * 列出 GitHub 仓库中的分支信息
 *
 * 输入参数：
 * - owner: 仓库所有者（用户名或组织）
 * - repo: 仓库名称
 * - protected: 是否只显示受保护的分支（可选）
 *
 * 返回：格式化的分支列表，包含保护状态和最后提交信息
 */
export const GitHubBranchTool: Tool = {
  /** 工具名称 */
  name: 'GitHubBranchTool',
  /** 工具描述 */
  description: 'List branches in a GitHub repository. Use this to see all branches, protected branches, or find specific branches.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository owner (username or organization)',
      },
      repo: {
        type: 'string',
        description: 'Repository name',
      },
      protected: {
        type: 'boolean',
        description: 'Filter to only show protected branches (optional)',
      },
    },
    required: ['owner', 'repo'],
  },

  /**
   * 获取仓库分支列表
   *
   * 执行流程：
   * 1. 验证输入参数
   * 2. 构建 GitHub API 请求头
   * 3. 调用 GitHub API 获取分支列表
   * 4. 处理响应数据
   * 5. 如果需要，筛选保护分支
   * 6. 格式化输出结果
   *
   * @param input - 包含 owner, repo 和可选的 protected 字段
   * @returns 分支列表的格式化字符串
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const owner = input.owner as string;
    const repo = input.repo as string;
    const filterProtected = input.protected as boolean | undefined;

    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/branches`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        const error = await response.json() as { message?: string };
        return `GitHub API error: ${response.status} - ${error.message || 'Unknown error'}`;
      }

      const data = await response.json() as Array<{
        name: string;
        protected: boolean;
        protection: {
          required_status_checks: {
            enforcement_level: string;
            contexts: string[];
          } | null;
        };
        protection_url: string;
        commit: {
          sha: string;
          url: string;
        };
      }>;

      let branches = data;
      if (filterProtected === true) {
        branches = data.filter((b) => b.protected);
      }

      if (branches.length === 0) {
        return `No branches found in ${owner}/${repo}`;
      }

      const branchList = branches.map((branch) => {
        const protectedBadge = branch.protected ? '🔒' : '📍';
        const statusChecks = branch.protection.required_status_checks
          ? branch.protection.required_status_checks.contexts.join(', ') || 'none'
          : 'N/A';
        return `${protectedBadge} ${branch.name}
Last Commit: ${branch.commit.sha.substring(0, 7)}
Protected: ${branch.protected} | Status Checks: ${statusChecks}`;
      }).join('\n\n---\n\n');

      const totalCount = data.length;
      const protectedCount = data.filter((b) => b.protected).length;
      const filterText = filterProtected ? ' (protected only)' : '';

      return `Branches in ${owner}/${repo}${filterText} (${branches.length}/${totalCount} shown, ${protectedCount} protected):\n\n${branchList}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error fetching branches: ${error.message}`;
      }
      return `Error fetching branches: ${String(error)}`;
    }
  },
};