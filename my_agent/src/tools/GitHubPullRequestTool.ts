/**
 * GitHub Pull Request 工具
 *
 * 查看和管理 GitHub 仓库的 Pull Requests
 *
 * 功能：
 * - 列出仓库的 Pull Requests
 * - 按状态筛选（open, closed, all）
 * - 显示 PR 的统计信息（提交数、评论数、增删行数）
 * - 区分草稿 PR 和已合并 PR
 *
 * 使用场景：
 * - 查看项目有哪些待处理的 PR
 * - 了解某个 PR 的规模和进度
 * - 查找已关闭或已合并的 PR
 */
import type { Tool } from '../types/index.js';

/**
 * GitHub Pull Request 工具
 *
 * 列出和查看 Pull Requests
 *
 * 输入参数：
 * - owner: 仓库所有者
 * - repo: 仓库名称
 * - state: 筛选状态：open, closed, all（默认 open）
 * - limit: 返回的 PR 数量（默认 10）
 *
 * 返回：格式化的 PR 列表，包含状态、标题、作者、统计信息
 */
export const GitHubPullRequestTool: Tool = {
  /** 工具名称 */
  name: 'GitHubPullRequestTool',
  /** 工具描述 */
  description: 'List and view pull requests in a GitHub repository. Use this to see open PRs, merged PRs, or PR details.',

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
      state: {
        type: 'string',
        description: 'Filter by state: open, closed, or all (default: open)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of PRs to return (default: 10)',
      },
    },
    required: ['owner', 'repo'],
  },

  /**
   * 获取 Pull Request 列表
   *
   * 执行流程：
   * 1. 验证输入参数
   * 2. 构建 GitHub API 请求
   * 3. 调用 GitHub PRs API
   * 4. 处理响应数据
   * 5. 提取 PR 信息（编号、标题、状态、标签、统计等）
   * 6. 格式化输出结果
   *
   * @param input - 包含 owner, repo, state(可选) 和 limit(可选) 字段
   * @returns PR 列表的格式化字符串
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const owner = input.owner as string;
    const repo = input.repo as string;
    const state = (input.state as string) || 'open';
    const limit = (input.limit as number) || 10;

    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=${limit}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        const error = await response.json() as { message?: string };
        return `GitHub API error: ${response.status} - ${error.message || 'Unknown error'}`;
      }

      const data = await response.json() as Array<{
        number: number;
        title: string;
        state: string;
        html_url: string;
        user: { login: string };
        body?: string;
        created_at: string;
        updated_at: string;
        merged_at: string | null;
        comments: number;
        commits: number;
        additions: number;
        deletions: number;
        draft: boolean;
        labels: Array<{ name: string; color: string }>;
      }>;

      if (data.length === 0) {
        return `No ${state} pull requests found in ${owner}/${repo}`;
      }

      const prList = data.map((pr) => {
        const labels = pr.labels.map((l) => l.name).join(', ') || 'none';
        const status = pr.draft ? '📝 Draft' : pr.merged_at ? '✅ Merged' : pr.state === 'closed' ? '❌ Closed' : '🟢 Open';
        const date = new Date(pr.created_at).toISOString().split('T')[0];
        const stats = `+${pr.additions} -${pr.deletions}`;
        return `${status} #${pr.number} ${pr.title}
Author: ${pr.user.login} | Labels: ${labels}
Created: ${date} | Comments: ${pr.comments} | Commits: ${pr.commits} | ${stats}
URL: ${pr.html_url}
${pr.body ? `\n${pr.body.substring(0, 150)}${pr.body.length > 150 ? '...' : ''}` : ''}`;
      }).join('\n\n---\n\n');

      return `Pull Requests in ${owner}/${repo} (${state}, showing ${data.length}):\n\n${prList}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error fetching pull requests: ${error.message}`;
      }
      return `Error fetching pull requests: ${String(error)}`;
    }
  },
};