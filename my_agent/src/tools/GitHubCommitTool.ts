/**
 * GitHub 提交历史工具
 *
 * 查看 GitHub 仓库的提交记录
 *
 * 功能：
 * - 查看最近的提交历史
 * - 显示提交作者和信息
 * - 支持按分支或 SHA 筛选
 *
 * 使用场景：
 * - 查看项目的提交历史
 * - 了解某个分支的所有提交
 * - 查看特定提交的详细信息
 */
import type { Tool } from '../types/index.js';

/**
 * GitHub 提交历史工具
 *
 * 获取仓库的提交记录
 *
 * 输入参数：
 * - owner: 仓库所有者
 * - repo: 仓库名称
 * - sha: 起始提交 SHA 或分支名（可选）
 * - limit: 返回的提交数量（默认 10）
 *
 * 返回：格式化的提交列表，包含 SHA、消息、作者和日期
 */
export const GitHubCommitTool: Tool = {
  /** 工具名称 */
  name: 'GitHubCommitTool',
  /** 工具描述 */
  description: 'View commit history in a GitHub repository. Use this to see recent commits, author info, and commit messages.',

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
      sha: {
        type: 'string',
        description: 'SHA or branch to start listing commits from (optional, defaults to default branch)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of commits to return (default: 10)',
      },
    },
    required: ['owner', 'repo'],
  },

  /**
   * 获取提交历史
   *
   * 执行流程：
   * 1. 验证输入参数
   * 2. 构建 GitHub API 请求
   * 3. 调用 GitHub 提交 API
   * 4. 处理响应数据
   * 5. 提取提交信息（SHA、消息、作者、日期）
   * 6. 格式化输出结果
   *
   * @param input - 包含 owner, repo, sha(可选) 和 limit(可选) 字段
   * @returns 提交历史的格式化字符串
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const owner = input.owner as string;
    const repo = input.repo as string;
    const sha = input.sha as string | undefined;
    const limit = (input.limit as number) || 10;

    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      let url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${limit}`;
      if (sha) {
        url += `&sha=${sha}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        const error = await response.json() as { message?: string };
        return `GitHub API error: ${response.status} - ${error.message || 'Unknown error'}`;
      }

      const data = await response.json() as Array<{
        sha: string;
        commit: {
          message: string;
          author: {
            name: string;
            email: string;
            date: string;
          };
          committer: {
            name: string;
            email: string;
            date: string;
          };
        };
        html_url: string;
        author: {
          login: string;
          avatar_url: string;
        } | null;
      }>;

      if (data.length === 0) {
        return `No commits found in ${owner}/${repo}`;
      }

      const commitList = data.map((commit) => {
        const shortSha = commit.sha.substring(0, 7);
        const message = commit.commit.message.split('\n')[0];
        const authorDate = new Date(commit.commit.author.date).toISOString().split('T')[0];
        const authorName = commit.commit.author.name;
        const authorLogin = commit.author ? `@${commit.author.login}` : '';
        return `${shortSha} ${message}
Author: ${authorName} ${authorLogin} | Date: ${authorDate}
URL: ${commit.html_url}`;
      }).join('\n\n---\n\n');

      return `Recent Commits in ${owner}/${repo} (showing ${data.length}):\n\n${commitList}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error fetching commits: ${error.message}`;
      }
      return `Error fetching commits: ${String(error)}`;
    }
  },
};