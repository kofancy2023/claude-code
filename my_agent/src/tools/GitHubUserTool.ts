/**
 * GitHub 用户工具
 *
 * 用于获取 GitHub 用户或组织的信息
 *
 * 功能：
 * - 获取用户基本信息（姓名、公司、位置等）
 * - 获取用户的仓库统计（公开仓库、星标、 followers 等）
 * - 支持用户类型筛选（user 或 org）
 * - 对于组织，额外显示描述信息
 *
 * 使用场景：
 * - 查找开发者信息
 * - 查看组织详情
 * - 了解用户的开源贡献情况
 */
/**
 * GitHub 用户信息工具
 *
 * 查询 GitHub 用户或组织的信息
 *
 * 功能：
 * - 获取用户基本信息（名称、公司、位置、简介）
 * - 获取用户的仓库统计（公开仓库、Gist、关注者）
 * - 获取组织的额外信息（如描述）
 * - 支持按类型筛选（user 或 org）
 *
 * 使用场景：
 * - 查看某个 GitHub 用户的信息
 * - 了解某个组织的详情
 * - 查找用户的联系方式和社交信息
 */
import type { Tool } from '../types/index.js';

/**
 * GitHub 用户信息工具
 *
 * 查询用户或组织的 GitHub 信息
 *
 * 输入参数：
 * - username: GitHub 用户名或组织名
 * - type: 筛选类型：user 或 org（可选）
 *
 * 返回：用户的详细信息，包括仓库数、关注者数、加入时间等
 */
export const GitHubUserTool: Tool = {
  /** 工具名称 */
  name: 'GitHubUserTool',
  /** 工具描述 */
  description: 'Get information about a GitHub user or organization. Use this to look up user profiles, organization details, or check user activity.',

  /** 输入参数 schema */
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

  /**
   * 获取用户或组织信息
   *
   * 执行流程：
   * 1. 验证输入参数
   * 2. 构建 GitHub API 请求
   * 3. 调用 GitHub 用户 API
   * 4. 处理响应数据
   * 5. 检查类型筛选条件
   * 6. 如果是组织，获取额外描述信息
   * 7. 格式化输出结果
   *
   * @param input - 包含 username 和可选的 type 字段
   * @returns 用户或组织信息的格式化字符串
   */
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