/**
 * 文件系统资源提供者
 *
 * 提供对本地文件系统的 MCP 资源访问
 *
 * 功能：
 * - 列出目录中的文件和文件夹
 * - 读取文件内容
 * - 监听文件变更
 * - 获取文件元数据
 *
 * URI 格式：
 * - file:///path/to/file - 文件
 * - file:///path/to/directory/ - 目录
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, extname as pathExtname, basename } from 'path';
import type { ResourceProvider, MCPResource, MCPResourceType } from '../types.js';

/**
 * 文件系统资源提供者配置
 */
export interface FileSystemProviderConfig {
  /** 根目录路径 */
  rootPath?: string;
  /** 允许访问的目录白名单 */
  allowedPaths?: string[];
  /** 禁止访问的目录黑名单 */
  blockedPaths?: string[];
  /** 最大文件大小 (字节) */
  maxFileSize?: number;
  /** 允许的文件扩展名 */
  allowedExtensions?: string[];
}

/**
 * 文件系统资源提供者默认值
 */
const DEFAULT_CONFIG: Required<FileSystemProviderConfig> = {
  rootPath: process.cwd(),
  allowedPaths: [],
  blockedPaths: ['/node_modules', '/.git', '/dist', '/build'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedExtensions: [],
};

/**
 * 创建文件系统资源提供者
 *
 * @param config - 提供者配置
 * @returns 资源提供者实例
 */
export function createFileSystemProvider(config?: FileSystemProviderConfig): ResourceProvider {
  return new FileSystemProviderImpl(config);
}

/**
 * 文件系统资源提供者实现
 */
class FileSystemProviderImpl implements ResourceProvider {
  readonly name = 'filesystem';
  readonly type: MCPResourceType = 'filesystem' as MCPResourceType;

  private config: Required<FileSystemProviderConfig>;

  constructor(config?: FileSystemProviderConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 列出资源
   *
   * @inheritDoc
   */
  async list(): Promise<MCPResource[]> {
    const resources: MCPResource[] = [];

    try {
      await this.listDirectory(this.config.rootPath, resources);
    } catch (error) {
      console.error('Error listing resources:', error);
    }

    return resources;
  }

  /**
   * 递归列出目录
   */
  private async listDirectory(dirPath: string, resources: MCPResource[], depth = 0): Promise<void> {
    // 防止无限递归
    if (depth > 5) {
      return;
    }

    // 检查是否在黑名单中
    if (this.isBlocked(dirPath)) {
      return;
    }

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        // 跳过黑名单路径
        if (this.isBlocked(fullPath)) {
          continue;
        }

        if (entry.isDirectory()) {
          // 添加目录资源
          resources.push({
            uri: `file://${fullPath}`,
            name: entry.name,
            description: `Directory: ${fullPath}`,
            type: this.type,
            mimeType: 'inode/directory',
          });

          // 递归列出子目录
          await this.listDirectory(fullPath, resources, depth + 1);

        } else if (entry.isFile()) {
          // 检查文件大小限制
          const stats = statSync(fullPath);
          if (stats.size > this.config.maxFileSize) {
            continue;
          }

          // 检查文件扩展名限制
          const ext = pathExtname(entry.name);
          if (
            this.config.allowedExtensions.length > 0 &&
            !this.config.allowedExtensions.includes(ext)
          ) {
            continue;
          }

          // 添加文件资源
          resources.push({
            uri: `file://${fullPath}`,
            name: entry.name,
            description: `File: ${fullPath} (${this.formatFileSize(stats.size)})`,
            type: this.type,
            mimeType: this.guessMimeType(entry.name),
            metadata: {
              size: stats.size,
              created: stats.birthtime.toISOString(),
              modified: stats.mtime.toISOString(),
              extension: ext,
            },
          });
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
  }

  /**
   * 读取资源
   *
   * @inheritDoc
   */
  async read(uri: string): Promise<string> {
    // 解析 file:// URI
    const filePath = this.parseFileUri(uri);

    // 安全检查
    if (!this.isAllowed(filePath)) {
      throw new Error(`Access denied: ${filePath}`);
    }

    // 检查文件是否存在
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // 检查是否为文件
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }

    // 检查文件大小
    if (stats.size > this.config.maxFileSize) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${this.config.maxFileSize})`);
    }

    // 读取文件内容
    try {
      return readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 检查资源是否存在
   *
   * @inheritDoc
   */
  async exists(uri: string): Promise<boolean> {
    try {
      const filePath = this.parseFileUri(uri);
      return existsSync(filePath);
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
      const filePath = this.parseFileUri(uri);

      if (!existsSync(filePath)) {
        return undefined;
      }

      const stats = statSync(filePath);

      return {
        size: stats.size,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        accessed: stats.atime.toISOString(),
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        extension: pathExtname(filePath),
        name: basename(filePath),
      };
    } catch {
      return undefined;
    }
  }

  /**
   * 解析 file:// URI 为文件路径
   */
  private parseFileUri(uri: string): string {
    if (!uri.startsWith('file://')) {
      throw new Error(`Invalid file URI: ${uri}`);
    }

    // 移除 file:// 前缀
    let filePath = uri.slice(7);

    // Windows 路径处理
    if (filePath.startsWith('/') && /^\/[A-Za-z]:/.test(filePath)) {
      filePath = filePath.slice(1);
    }

    return decodeURIComponent(filePath);
  }

  /**
   * 检查路径是否被禁止访问
   */
  private isBlocked(path: string): boolean {
    const normalizedPath = path.replace(/\\/g, '/');

    for (const blocked of this.config.blockedPaths) {
      if (normalizedPath.includes(blocked)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查路径是否允许访问
   */
  private isAllowed(path: string): boolean {
    // 如果有白名单，检查是否在白名单中
    if (this.config.allowedPaths.length > 0) {
      return this.config.allowedPaths.some((allowed) => path.startsWith(allowed));
    }

    // 默认允许所有非黑名单路径
    return !this.isBlocked(path);
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
  }

  /**
   * 根据文件扩展名猜测 MIME 类型
   */
  private guessMimeType(filename: string): string {
    const ext = pathExtname(filename).toLowerCase();

    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.ts': 'application/typescript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.yaml': 'application/yaml',
      '.yml': 'application/yaml',
      '.md': 'text/markdown',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.rar': 'application/vnd.rar',
      '.7z': 'application/x-7z-compressed',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }
}
