/**
 * GitHub 代码搜索工具
 *
 * 在 GitHub 仓库中搜索代码
 *
 * 功能：
 * - 使用高级查询语法搜索代码
 * - 支持限定特定仓库
 * - 返回代码片段和匹配位置
 *
 * 查询语法示例：
 * - "path:src function main" - 在 src 路径下搜索 function main
 * - "language:typescript const useState" - 搜索 TypeScript 中的 useState
 * - "repo:owner/repo keyword" - 在特定仓库中搜索
 */
import type { Tool } from '../types/index.js';

/**
 * GitHub 代码搜索工具
 *
 * 在 GitHub 上搜索代码内容
 *
 * 输入参数：
 * - repo: 仓库路径，格式为 "owner/repo"（可选，不指定则搜索所有公共仓库）
 * - query: 搜索查询语句
 * - limit: 返回结果数量（默认 5）
 *
 * 返回：匹配的代码结果列表，包含文件路径和代码片段
 */
export const GitHubCodeSearchTool: Tool = {
  /** 工具名称 */
  name: 'GitHubCodeSearchTool',
  /** 工具描述 */
  description: 'Search code within GitHub repositories using advanced query syntax. Use this to find specific code patterns or implementations.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      repo: {
        type: 'string',
        description: 'Repository in format "owner/repo" (optional, searches all public repos if not specified)',
      },
      query: {
        type: 'string',
        description: 'Code search query (e.g., "path:src function main", "language:typescript const useState")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 5)',
      },
    },
    required: ['query'],
  },

  /**
   * 执行代码搜索
   *
   * 执行流程：
   * 1. 构建搜索查询（添加仓库前缀如果指定）
   * 2. URL 编码搜索查询
   * 3. 调用 GitHub 搜索 API
   * 4. 处理响应，提取代码片段
   * 5. 格式化输出结果
   *
   * @param input - 包含 query, repo(可选) 和 limit(可选) 字段
   * @returns 搜索结果的格式化字符串
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const repo = input.repo as string | undefined;
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
      let searchQuery = query;
      if (repo) {
        searchQuery = `repo:${repo} ${query}`;
      }

      const encodedQuery = encodeURIComponent(searchQuery);
      const url = `https://api.github.com/search/code?q=${encodedQuery}&per_page=${limit}`;

      const response = await fetch(url, { headers });

      if (!response.ok) {
        const error = await response.json() as { message?: string };
        return `GitHub API error: ${response.status} - ${error.message || 'Unknown error'}`;
      }

      const data = await response.json() as {
        total_count: number;
        items: Array<{
          name: string;
          path: string;
          sha: string;
          html_url: string;
          repository: { full_name: string };
          text_matches?: Array<{
            fragment: string;
            matches: Array<{ indices: number[] }>;
          }>;
        }>;
      };

      if (data.total_count === 0) {
        return `No code found matching "${query}"${repo ? ` in ${repo}` : ''}`;
      }

      const results = data.items.map((item) => {
        let snippet = '';
        if (item.text_matches && item.text_matches.length > 0) {
          snippet = item.text_matches[0].fragment;
        }
        return `${item.repository.full_name}/${item.path}
URL: ${item.html_url}
${snippet ? `\nSnippet:\n\`\`\`\n${snippet.substring(0, 300)}${snippet.length > 300 ? '...' : ''}\n\`\`\`` : ''}`;
      }).join('\n\n---\n\n');

      return `Found ${data.total_count} code results (showing ${data.items.length}):\n\n${results}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error searching GitHub code: ${error.message}`;
      }
      return `Error searching GitHub code: ${String(error)}`;
    }
  },
};