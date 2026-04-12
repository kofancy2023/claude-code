/**
 * GitHub Issue 和 PR 搜索工具
 *
 * 搜索 GitHub 上的 Issues 和 Pull Requests
 *
 * 功能：
 * - 搜索仓库中的 Issues
 * - 搜索 Pull Requests
 * - 支持高级过滤条件
 *
 * 查询语法示例：
 * - "is:issue is:open bug" - 搜索开放的 bug issue
 * - "is:pr is:closed author:username" - 搜索某用户的已关闭 PR
 * - "label:enhancement" - 按标签筛选
 */
import type { Tool } from '../types/index.js';

/**
 * GitHub Issue 和 PR 搜索工具
 *
 * 搜索 GitHub Issues 和 Pull Requests
 *
 * 输入参数：
 * - repo: 仓库路径，格式为 "owner/repo"
 * - query: 搜索查询语句
 * - limit: 返回结果数量（默认 5）
 *
 * 返回：匹配的 Issues/PRs 列表，包含标题、状态、作者等信息
 */
export const GitHubIssueTool: Tool = {
  /** 工具名称 */
  name: 'GitHubIssueTool',
  /** 工具描述 */
  description: 'Search GitHub issues and pull requests. Use this to find relevant issues, PRs, or code examples.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      repo: {
        type: 'string',
        description: 'Repository in format "owner/repo"',
      },
      query: {
        type: 'string',
        description: 'Search query (e.g., "is:issue is:open bug")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 5)',
      },
    },
    required: ['repo', 'query'],
  },

  /**
   * 搜索 issues 和 PRs
   *
   * 执行流程：
   * 1. 构建搜索查询（添加仓库前缀）
   * 2. URL 编码搜索查询
   * 3. 调用 GitHub 搜索 API
   * 4. 处理响应数据
   * 5. 提取 issue 信息（编号、标题、状态、标签等）
   * 6. 格式化输出结果
   *
   * @param input - 包含 repo, query 和 limit(可选) 字段
   * @returns 搜索结果的格式化字符串
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const repo = input.repo as string;
    const query = input.query as string;
    const limit = (input.limit as number) || 5;

    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const encodedQuery = encodeURIComponent(`repo:${repo} ${query}`);
      const url = `https://api.github.com/search/issues?q=${encodedQuery}&per_page=${limit}`;

      const response = await fetch(url, { headers });

      if (!response.ok) {
        const error = await response.json() as { message?: string };
        return `GitHub API error: ${response.status} - ${error.message || 'Unknown error'}`;
      }

      const data = await response.json() as {
        total_count: number;
        items: Array<{
          number: number;
          title: string;
          state: string;
          html_url: string;
          user: { login: string };
          labels: Array<{ name: string }>;
          comments: number;
          created_at: string;
          body?: string;
        }>;
      };

      if (data.total_count === 0) {
        return `No issues or PRs found matching "${query}" in ${repo}`;
      }

      const results = data.items.map((item) => {
        const labels = item.labels.map((l) => l.name).join(', ') || 'none';
        const date = new Date(item.created_at).toISOString().split('T')[0];
        return `#${item.number} ${item.title}
State: ${item.state} | Author: ${item.user.login} | Labels: ${labels}
Created: ${date} | Comments: ${item.comments}
URL: ${item.html_url}
${item.body ? `\n${item.body.substring(0, 200)}${item.body.length > 200 ? '...' : ''}` : ''}`;
      }).join('\n\n---\n\n');

      return `Found ${data.total_count} results (showing ${data.items.length}):\n\n${results}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error searching GitHub: ${error.message}`;
      }
      return `Error searching GitHub: ${String(error)}`;
    }
  },
};