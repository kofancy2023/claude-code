import type { Tool } from '../types/index.js';

export const GitHubRepoTool: Tool = {
  name: 'GitHubRepoTool',
  description: 'Get information about a GitHub repository. Use this to fetch repo details, file listings, or contents.',

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
