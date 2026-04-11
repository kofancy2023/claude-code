import type { Tool } from '../types/index.js';

export const GitHubIssueTool: Tool = {
  name: 'GitHubIssueTool',
  description: 'Search GitHub issues and pull requests. Use this to find relevant issues, PRs, or code examples.',

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
