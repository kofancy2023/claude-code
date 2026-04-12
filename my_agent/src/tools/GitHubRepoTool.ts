/**
 * GitHub 仓库工具
 *
 * 用于获取 GitHub 仓库信息和文件内容
 *
 * 功能：
 * - 获取仓库基本信息（描述、星标数、分支等）
 * - 列出仓库目录内容
 * - 读取仓库文件内容（Base64 编码支持）
 *
 * 使用场景：
 * - 查看仓库概览信息
 * - 浏览仓库文件结构
 * - 读取特定文件内容
 */
/**
 * GitHub 仓库信息工具
 *
 * 获取 GitHub 仓库的详细信息
 *
 * 功能：
 * - 获取仓库基本信息（描述、星标数、fork 数）
 * - 查看仓库的目录结构
 * - 读取指定路径的文件内容
 * - 支持 Base64 编码的文件内容解码
 *
 * 使用场景：
 * - 查看仓库的基本信息
 * - 浏览仓库的目录结构
 * - 读取特定文件的内容
 */
import type { Tool } from '../types/index.js';

/**
 * GitHub 仓库信息工具
 *
 * 获取仓库信息或文件内容
 *
 * 输入参数：
 * - owner: 仓库所有者
 * - repo: 仓库名称
 * - path: 文件路径（可选，不指定则返回仓库信息）
 *
 * 返回：
 * - 未指定 path：返回仓库的基本信息
 * - 指定 path：返回目录列表或文件内容
 */
export const GitHubRepoTool: Tool = {
  /** 工具名称 */
  name: 'GitHubRepoTool',
  /** 工具描述 */
  description: 'Get information about a GitHub repository. Use this to fetch repo details, file listings, or contents.',

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
      path: {
        type: 'string',
        description: 'Path within the repository (optional, for file contents)',
      },
    },
    required: ['owner', 'repo'],
  },

  /**
   * 获取仓库信息或文件内容
   *
   * 执行流程：
   * 1. 验证输入参数
   * 2. 确定请求类型（仓库信息还是文件内容）
   * 3. 构建对应的 GitHub API 请求
   * 4. 处理响应数据
   * 5. 如果是文件内容，进行 Base64 解码
   * 6. 格式化输出结果
   *
   * @param input - 包含 owner, repo 和可选的 path 字段
   * @returns 仓库信息或文件内容的格式化字符串
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const owner = input.owner as string;
    const repo = input.repo as string;
    const path = input.path as string | undefined;

    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      let url: string;
      if (path) {
        url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
      } else {
        url = `https://api.github.com/repos/${owner}/${repo}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        const error = await response.json() as { message?: string };
        return `GitHub API error: ${response.status} - ${error.message || 'Unknown error'}`;
      }

      const data = await response.json();

      if (path) {
        if (Array.isArray(data)) {
          const files = data.map((f: { name: string; type: string }) => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}`).join('\n');
          return `Contents of ${owner}/${repo}/${path}:\n\n${files}`;
        } else {
          const fileData = data as { content?: string; encoding?: string; name: string; size: number };
          if (fileData.content && fileData.encoding === 'base64') {
            const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
            return `File: ${fileData.name} (${fileData.size} bytes)\n\n\`\`\`\n${content}\n\`\`\``;
          }
          return JSON.stringify(data, null, 2);
        }
      } else {
        const repoData = data as {
          full_name: string;
          description: string;
          stargazers_count: number;
          forks_count: number;
          language: string;
          default_branch: string;
          open_issues_count: number;
        };
        return `Repository: ${repoData.full_name}
Description: ${repoData.description || 'No description'}
Stars: ${repoData.stargazers_count} | Forks: ${repoData.forks_count}
Language: ${repoData.language || 'N/A'}
Default Branch: ${repoData.default_branch}
Open Issues: ${repoData.open_issues_count}`;
      }
    } catch (error) {
      if (error instanceof Error) {
        return `Error fetching GitHub repo: ${error.message}`;
      }
      return `Error fetching GitHub repo: ${String(error)}`;
    }
  },
};