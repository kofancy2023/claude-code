import type { Tool } from '../types/index.js';

export const GitHubBranchTool: Tool = {
  name: 'GitHubBranchTool',
  description: 'List branches in a GitHub repository. Use this to see all branches, protected branches, or find specific branches.',

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