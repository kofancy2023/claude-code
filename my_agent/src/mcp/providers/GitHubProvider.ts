/**
 * GitHub 资源提供者
 *
 * 提供对 GitHub API 的 MCP 资源访问
 *
 * 功能：
 * - 列出仓库文件
 * - 读取文件内容
 * - 获取仓库信息
 * - 获取 Issue 和 PR 信息
 *
 * URI 格式：
 * - github://owner/repo/path - 仓库文件
 * - github://owner/repo - 仓库根目录
 * - github://owner/repo/issues - Issue 列表
 * - github://owner/repo/pulls - PR 列表
 */

import type { ResourceProvider, MCPResource, MCPResourceType } from '../types.js';

/**
 * GitHub 资源提供者配置
 */
export interface GitHubProviderConfig {
  /** GitHub API Token */
  token?: string;
  /** API 基础 URL (用于 GitHub Enterprise) */
  baseUrl?: string;
  /** 默认分支 */
  defaultBranch?: string;
}

/**
 * GitHub API 响应类型
 */
interface GitHubContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  content?: string;
  encoding?: string;
  download_url?: string;
}

/**
 * GitHub 资源提供者默认值
 */
const DEFAULT_CONFIG: Required<GitHubProviderConfig> = {
  token: '',
  baseUrl: 'https://api.github.com',
  defaultBranch: 'main',
};

/**
 * 创建 GitHub 资源提供者
 *
 * @param config - 提供者配置
 * @returns 资源提供者实例
 */
export function createGitHubProvider(config?: GitHubProviderConfig): ResourceProvider {
  return new GitHubProviderImpl(config);
}

/**
 * GitHub 资源提供者实现
 */
class GitHubProviderImpl implements ResourceProvider {
  readonly name = 'github';
  readonly type: MCPResourceType = 'github' as MCPResourceType;

  private config: Required<GitHubProviderConfig>;

  constructor(config?: GitHubProviderConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 列出资源
   *
   * @inheritDoc
   */
  async list(): Promise<MCPResource[]> {
    // GitHub provider 需要明确指定仓库才能列出资源
    return [];
  }

  /**
   * 列出仓库目录内容
   *
   * @param owner - 仓库所有者
   * @param repo - 仓库名称
   * @param path - 目录路径
   */
  async listRepository(owner: string, repo: string, path = ''): Promise<MCPResource[]> {
    const resources: MCPResource[] = [];
    const encodedPath = path ? `/${encodeURIComponent(path)}` : '';
    const url = `${this.config.baseUrl}/repos/${owner}/${repo}/contents${encodedPath}`;

    try {
      const response = await fetch(url, this.getFetchOptions());

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Repository not found: ${owner}/${repo}`);
        }
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const contents = (await response.json()) as GitHubContent[];

      for (const item of contents) {
        resources.push({
          uri: `github://${owner}/${repo}/${item.path}`,
          name: item.name,
          description: `${item.type === 'dir' ? 'Directory' : 'File'}: ${item.path}`,
          type: this.type,
          mimeType: item.type === 'file' ? this.guessMimeType(item.name) : 'inode/directory',
          metadata: {
            sha: item.sha,
            size: item.size,
            type: item.type,
          },
        });
      }
    } catch (error) {
      console.error('Error listing GitHub repository:', error);
      throw error;
    }

    return resources;
  }

  /**
   * 读取资源
   *
   * @inheritDoc
   */
  async read(uri: string): Promise<string> {
    const { owner, repo, path } = this.parseGitHubUri(uri);

    if (!path) {
      throw new Error('Path is required');
    }

    const url = `${this.config.baseUrl}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;

    try {
      const response = await fetch(url, this.getFetchOptions());

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`File not found: ${path}`);
        }
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const content = (await response.json()) as GitHubContent;

      if (content.type === 'dir') {
        throw new Error(`Path is a directory, not a file: ${path}`);
      }

      // 如果有 content 字段（小于 1MB 的文件），直接返回
      if (content.content) {
        return Buffer.from(content.content, 'base64').toString('utf-8');
      }

      // 否则使用 download_url
      if (content.download_url) {
        const downloadResponse = await fetch(content.download_url);
        return downloadResponse.text();
      }

      throw new Error('Unable to get file content');
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to read GitHub resource');
    }
  }

  /**
   * 检查资源是否存在
   *
   * @inheritDoc
   */
  async exists(uri: string): Promise<boolean> {
    try {
      const { owner, repo, path } = this.parseGitHubUri(uri);
      const encodedPath = encodeURIComponent(path);
      const url = `${this.config.baseUrl}/repos/${owner}/${repo}/contents/${encodedPath}`;

      const response = await fetch(url, this.getFetchOptions());
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 获取资源元数据
   *
   * @inheritDoc
   */
  async getMetadata(uri: string): Promise<Record<string, unknown> | undefined> {
    try {
      const { owner, repo, path } = this.parseGitHubUri(uri);
      const encodedPath = encodeURIComponent(path);
      const url = `${this.config.baseUrl}/repos/${owner}/${repo}/contents/${encodedPath}`;

      const response = await fetch(url, this.getFetchOptions());

      if (!response.ok) {
        return undefined;
      }

      const content = (await response.json()) as GitHubContent;

      return {
        name: content.name,
        path: content.path,
        sha: content.sha,
        size: content.size,
        type: content.type,
        downloadUrl: content.download_url,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * 获取仓库信息
   */
  async getRepositoryInfo(owner: string, repo: string): Promise<Record<string, unknown>> {
    const url = `${this.config.baseUrl}/repos/${owner}/${repo}`;

    const response = await fetch(url, this.getFetchOptions());

    if (!response.ok) {
      throw new Error(`Failed to get repository info: ${response.status}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  /**
   * 获取提交历史
   */
  async getCommits(owner: string, repo: string, path?: string): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams();
    params.set('per_page', '30');

    const pathParam = path ? `/${encodeURIComponent(path)}` : '';
    const url = `${this.config.baseUrl}/repos/${owner}/${repo}/commits${pathParam}?${params}`;

    const response = await fetch(url, this.getFetchOptions());

    if (!response.ok) {
      throw new Error(`Failed to get commits: ${response.status}`);
    }

    return response.json() as Promise<Record<string, unknown>[]>;
  }

  /**
   * 获取分支列表
   */
  async getBranches(owner: string, repo: string): Promise<Record<string, unknown>[]> {
    const url = `${this.config.baseUrl}/repos/${owner}/${repo}/branches`;

    const response = await fetch(url, this.getFetchOptions());

    if (!response.ok) {
      throw new Error(`Failed to get branches: ${response.status}`);
    }

    return response.json() as Promise<Record<string, unknown>[]>;
  }

  /**
   * 解析 GitHub URI
   *
   * URI 格式: github://owner/repo/path
   */
  private parseGitHubUri(uri: string): { owner: string; repo: string; path: string } {
    if (!uri.startsWith('github://')) {
      throw new Error(`Invalid GitHub URI: ${uri}`);
    }

    const path = uri.slice(10); // 移除 github://
    const parts = path.split('/');

    if (parts.length < 2) {
      throw new Error(`Invalid GitHub URI format: ${uri}. Expected: github://owner/repo/path`);
    }

    const owner = parts[0];
    const repo = parts[1];
    const resourcePath = parts.slice(2).join('/');

    return { owner, repo, path: resourcePath };
  }

  /**
   * 获取 fetch 选项
   */
  private getFetchOptions(): RequestInit {
    const options: RequestInit = {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'my-agent-mcp',
      },
    };

    if (this.config.token) {
      options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${this.config.token}`,
      };
    }

    return options;
  }

  /**
   * 根据文件扩展名猜测 MIME 类型
   */
  private guessMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';

    const mimeTypes: Record<string, string> = {
      'ts': 'application/typescript',
      'js': 'application/javascript',
      'json': 'application/json',
      'md': 'text/markdown',
      'html': 'text/html',
      'css': 'text/css',
      'py': 'text/x-python',
      'java': 'text/x-java',
      'go': 'text/x-go',
      'rs': 'text/x-rust',
      'txt': 'text/plain',
      'yml': 'application/yaml',
      'yaml': 'application/yaml',
      'xml': 'application/xml',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }
}
