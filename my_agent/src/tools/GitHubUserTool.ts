import type { Tool } from '../types/index.js';

export const GitHubUserTool: Tool = {
  name: 'GitHubUserTool',
  description: 'Get information about a GitHub user or organization. Use this to look up user profiles, organization details, or check user activity.',

  inputSchema: {
    type: 'object',
    properties: {
      username: {
        type: 'string',
        description: 'GitHub username or organization name',
      },
      type: {
        type: 'string',
        description: 'Filter by type: user or org (optional)',
      },
    },
    required: ['username'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const username = input.username as string;
    const typeFilter = input.type as string | undefined;

    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const url = `https://api.github.com/users/${username}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        const error = await response.json() as { message?: string };
        return `GitHub API error: ${response.status} - ${error.message || 'Unknown error'}`;
      }

      const data = await response.json() as {
        login: string;
        type: 'User' | 'Organization';
        name: string | null;
        company: string | null;
        blog: string;
        location: string | null;
        email: string | null;
        bio: string | null;
        public_repos: number;
        public_gists: number;
        followers: number;
        following: number;
        created_at: string;
        updated_at: string;
        avatar_url: string;
        html_url: string;
      };

      if (typeFilter && typeFilter.toLowerCase() !== data.type.toLowerCase()) {
        return `${data.type} '${username}' does not match the requested type '${typeFilter}'`;
      }

      const accountType = data.type === 'User' ? '👤 User' : '🏢 Organization';
      const joinDate = new Date(data.created_at).toISOString().split('T')[0];
      const website = data.blog || 'Not provided';

      let info = `${accountType}: ${data.login}
${data.name ? `Name: ${data.name}` : ''}
${data.bio ? `Bio: ${data.bio}` : ''}
${data.company ? `Company: ${data.company}` : ''}
${data.location ? `Location: ${data.location}` : ''}
Website: ${website}
Repos: ${data.public_repos} | Gists: ${data.public_gists}
Followers: ${data.followers} | Following: ${data.following}
Joined: ${joinDate}
Profile: ${data.html_url}`;

      if (data.type === 'Organization') {
        const orgResponse = await fetch(url, { headers });
        if (orgResponse.ok) {
          const orgData = await orgResponse.json() as {
            description?: string;
            public_repos: number;
            followers: number;
          };
          if (orgData.description) {
            info += `\nDescription: ${orgData.description}`;
          }
        }
      }

      return info;
    } catch (error) {
      if (error instanceof Error) {
        return `Error fetching GitHub user: ${error.message}`;
      }
      return `Error fetching GitHub user: ${String(error)}`;
    }
  },
};