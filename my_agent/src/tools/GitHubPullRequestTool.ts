import type { Tool } from '../types/index.js';

export const GitHubPullRequestTool: Tool = {
  name: 'GitHubPullRequestTool',
  description: 'List and view pull requests in a GitHub repository. Use this to see open PRs, merged PRs, or PR details.',

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