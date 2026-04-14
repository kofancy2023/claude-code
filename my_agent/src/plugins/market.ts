/**
 * 插件市场
 *
 * 核心职责：
 * - 插件发现（从市场获取插件列表）
 * - 插件安装/卸载/更新
 * - 插件搜索和分类
 *
 * 设计思路：
 * 类似 npm market，插件以包的形式存在
 * 支持版本管理和依赖解析
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import type { AgentPlugin, PluginMetadata } from './types.js';
import { PluginType } from './types.js';

/**
 * 插件市场条目
 */
export interface MarketEntry {
  /** 插件名称 */
  name: string;
  /** 插件描述 */
  description: string;
  /** 最新版本 */
  version: string;
  /** 作者 */
  author: string;
  /** 标签 */
  tags: string[];
  /** 下载量 */
  downloads: number;
  /** 评分 */
  rating: number;
  /** 插件类型 */
  type: PluginType;
  /** 市场 URL */
  url?: string;
  /** GitHub 仓库 */
  repository?: string;
}

/**
 * 安装选项
 */
export interface InstallOptions {
  /** 版本（默认 latest） */
  version?: string;
  /** 安装目录 */
  targetDir?: string;
  /** 是否强制覆盖 */
  force?: boolean;
}

/**
 * 市场配置
 */
export interface PluginMarketOptions {
  /** 市场服务器 URL */
  registryUrl?: string;
  /** 缓存目录 */
  cacheDir?: string;
  /** 缓存过期时间（毫秒） */
  cacheTTL?: number;
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: Required<PluginMarketOptions> = {
  registryUrl: 'https://registry.agent-plugins.io',
  cacheDir: './.agent/plugin-cache',
  cacheTTL: 3600000, // 1小时
};

/**
 * 插件市场
 *
 * 提供插件的发现、安装、更新、卸载功能
 *
 * @example
 * ```typescript
 * const market = new PluginMarket();
 *
 * // 搜索插件
 * const results = await market.search('github');
 *
 * // 安装插件
 * await market.install('agent-github-tools');
 *
 * // 卸载插件
 * await market.uninstall('agent-github-tools');
 * ```
 */
export class PluginMarket {
  /** 配置 */
  private options: Required<PluginMarketOptions>;
  /** 缓存的插件列表 */
  private cache: Map<string, { data: MarketEntry[]; timestamp: number }> = new Map();
  /** 本地已安装插件目录 */
  private installedPluginsDir: string;

  constructor(options: PluginMarketOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.installedPluginsDir = path.resolve(this.options.cacheDir, '../installed');
  }

  /**
   * 搜索插件
   *
   * @param query - 搜索关键词
   * @param limit - 返回数量限制
   * @returns 匹配的插件列表
   */
  async search(query: string, limit: number = 20): Promise<MarketEntry[]> {
    // 尝试从市场获取
    try {
      const results = await this.fetchFromRegistry(`/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      return results;
    } catch (error) {
      console.warn('[PluginMarket] Failed to fetch from registry, using mock data:', error);
      // 返回模拟数据用于演示
      return this.getMockPlugins(query);
    }
  }

  /**
   * 获取插件详情
   *
   * @param name - 插件名称
   * @returns 插件详情
   */
  async getInfo(name: string): Promise<MarketEntry | null> {
    // 先检查缓存
    const cached = this.getCachedList();
    const found = cached.find(p => p.name === name);
    if (found) return found;

    // 从市场获取
    try {
      const info = await this.fetchFromRegistry(`/package/${name}`);
      return info;
    } catch {
      return null;
    }
  }

  /**
   * 安装插件
   *
   * @param name - 插件名称
   * @param options - 安装选项
   * @returns 安装结果
   */
  async install(name: string, options: InstallOptions = {}): Promise<{ success: boolean; path?: string; error?: string }> {
    const { version = 'latest', targetDir = this.installedPluginsDir, force = false } = options;

    // 创建安装目录
    const pluginDir = path.join(targetDir, name);
    if (fs.existsSync(pluginDir) && !force) {
      return { success: false, error: 'Plugin already installed. Use --force to reinstall.' };
    }

    try {
      // 获取插件信息
      const info = await this.getInfo(name);
      if (!info) {
        return { success: false, error: 'Plugin not found in market' };
      }

      // 下载插件包
      const packageUrl = info.url || `${this.options.registryUrl}/packages/${name}/${version}`;
      const downloaded = await this.downloadPackage(packageUrl, pluginDir);

      if (downloaded) {
        // 保存插件元数据
        const metadataPath = path.join(pluginDir, '.plugin-meta.json');
        fs.writeFileSync(metadataPath, JSON.stringify({
          name,
          version: info.version,
          installedAt: Date.now(),
          source: this.options.registryUrl,
        }, null, 2));

        return { success: true, path: pluginDir };
      }

      return { success: false, error: 'Failed to download plugin package' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * 卸载插件
   *
   * @param name - 插件名称
   * @returns 是否成功
   */
  async uninstall(name: string): Promise<{ success: boolean; error?: string }> {
    const pluginDir = path.join(this.installedPluginsDir, name);

    if (!fs.existsSync(pluginDir)) {
      return { success: false, error: 'Plugin not installed' };
    }

    try {
      // 递归删除目录
      this.rmrf(pluginDir);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * 更新插件
   *
   * @param name - 插件名称
   * @returns 更新结果
   */
  async update(name: string): Promise<{ success: boolean; oldVersion?: string; newVersion?: string; error?: string }> {
    // 获取当前版本
    const pluginDir = path.join(this.installedPluginsDir, name);
    const metadataPath = path.join(pluginDir, '.plugin-meta.json');

    let oldVersion: string | undefined;
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      oldVersion = metadata.version;
    }

    // 卸载旧版本
    const uninstallResult = await this.uninstall(name);
    if (!uninstallResult.success) {
      return { success: false, error: uninstallResult.error };
    }

    // 安装新版本
    const installResult = await this.install(name, { force: true });
    if (!installResult.success) {
      return { success: false, oldVersion, error: installResult.error };
    }

    // 获取新版本号
    const newInfo = await this.getInfo(name);

    return {
      success: true,
      oldVersion,
      newVersion: newInfo?.version,
    };
  }

  /**
   * 列出已安装的插件
   *
   * @returns 已安装插件列表
   */
  async listInstalled(): Promise<Array<{ name: string; version: string; installedAt: number }>> {
    if (!fs.existsSync(this.installedPluginsDir)) {
      return [];
    }

    const plugins: Array<{ name: string; version: string; installedAt: number }> = [];

    for (const dir of fs.readdirSync(this.installedPluginsDir)) {
      const pluginDir = path.join(this.installedPluginsDir, dir);
      const metadataPath = path.join(pluginDir, '.plugin-meta.json');

      if (fs.existsSync(metadataPath)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          plugins.push({
            name: dir,
            version: metadata.version,
            installedAt: metadata.installedAt,
          });
        } catch {
          // 忽略无效的元数据
        }
      }
    }

    return plugins;
  }

  /**
   * 获取插件分类列表
   *
   * @returns 分类及对应插件
   */
  async getCategories(): Promise<Record<string, MarketEntry[]>> {
    try {
      const categories = await this.fetchFromRegistry('/categories');
      return categories;
    } catch {
      return this.getMockCategories();
    }
  }

  /**
   * 从市场获取数据
   */
  private async fetchFromRegistry(endpoint: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.options.registryUrl);
      const protocol = url.protocol === 'https:' ? https : http;

      const req = protocol.get(url, { timeout: 10000 }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * 下载插件包
   */
  private async downloadPackage(url: string, targetDir: string): Promise<boolean> {
    // 创建目标目录
    fs.mkdirSync(targetDir, { recursive: true });

    // 模拟下载：创建示例插件结构
    // 实际实现应该从 URL 下载真实插件包
    const examplePlugin: AgentPlugin = {
      metadata: {
        name: path.basename(targetDir),
        version: '1.0.0',
        description: 'Installed from market',
        author: 'Market',
      },
      tools: [],
    };

    const pluginFile = path.join(targetDir, 'plugin.json');
    fs.writeFileSync(pluginFile, JSON.stringify(examplePlugin, null, 2));

    return true;
  }

  /**
   * 递归删除目录
   */
  private rmrf(dirPath: string): void {
    if (!fs.existsSync(dirPath)) return;

    for (const entry of fs.readdirSync(dirPath)) {
      const fullPath = path.join(dirPath, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        this.rmrf(fullPath);
      } else {
        fs.unlinkSync(fullPath);
      }
    }

    fs.rmdirSync(dirPath);
  }

  /**
   * 获取缓存的插件列表
   */
  private getCachedList(): MarketEntry[] {
    const cached = this.cache.get('all');
    if (cached && Date.now() - cached.timestamp < this.options.cacheTTL) {
      return cached.data;
    }
    return [];
  }

  /**
   * 获取模拟插件数据（用于演示）
   */
  private getMockPlugins(query: string): MarketEntry[] {
    const allPlugins: MarketEntry[] = [
      {
        name: 'agent-github-tools',
        description: 'GitHub 集成工具集',
        version: '1.2.0',
        author: 'agent-team',
        tags: ['github', 'git', 'productivity'],
        downloads: 15420,
        rating: 4.8,
        type: PluginType.ThirdParty,
        repository: 'https://github.com/agent-plugins/github-tools',
      },
      {
        name: 'agent-file-operations',
        description: '高级文件操作工具',
        version: '2.0.0',
        author: 'agent-team',
        tags: ['files', 'filesystem', 'tools'],
        downloads: 23100,
        rating: 4.6,
        type: PluginType.Builtin,
      },
      {
        name: 'agent-web-search',
        description: '网络搜索增强工具',
        version: '1.5.0',
        author: 'agent-team',
        tags: ['search', 'web', 'internet'],
        downloads: 18900,
        rating: 4.7,
        type: PluginType.Builtin,
      },
    ];

    const q = query.toLowerCase();
    return allPlugins.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  /**
   * 获取模拟分类数据
   */
  private getMockCategories(): Record<string, MarketEntry[]> {
    const plugins = this.getMockPlugins('');
    return {
      'Version Control': plugins.filter(p => p.tags.includes('git')),
      'File Tools': plugins.filter(p => p.tags.includes('files')),
      'Web Tools': plugins.filter(p => p.tags.includes('web')),
    };
  }
}

/**
 * 插件市场单例
 */
export const pluginMarket = new PluginMarket();
