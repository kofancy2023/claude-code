import type { Tool } from '../types/index.js';

export const GitHubCodeSearchTool: Tool = {
  name: 'GitHubCodeSearchTool',
  description: 'Search code within GitHub repositories using advanced query syntax. Use this to find specific code patterns or implementations.',

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
