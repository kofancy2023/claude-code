import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { Tool } from '../types/index.js';

/**
 * 文件列表工具
 *
 * 列出指定目录中的文件和子目录
 *
 * 功能：
 * - 列出目录内容
 * - 支持递归遍历子目录
 * - 过滤隐藏文件（以 . 开头）
 * - 处理权限错误
 */
export const FileListTool: Tool = {
  /** 工具名称 */
  name: 'FileListTool',
  /** 工具描述 */
  description: 'List files and directories in a folder. Use this to explore the file system structure.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The directory path to list (default: current working directory)',
      },
      recursive: {
        type: 'boolean',
        description: 'Whether to list subdirectories recursively (default: false)',
      },
    },
    required: [],
  },

  /**
   * 列出目录内容
   *
   * @param input - 包含 path 和 recursive 字段的对象
   * @returns 目录内容列表，或错误信息
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const targetPath = (input.path as string) || process.cwd();
    const recursive = (input.recursive as boolean) || false;

    try {
      const result: string[] = [];

      /**
       * 递归遍历目录
       *
       * @param dirPath - 要遍历的目录路径
       * @param prefix - 输出前缀（用于缩进）
       */
      function listDir(dirPath: string, prefix = ''): void {
        const entries = readdirSync(dirPath);

        for (const entry of entries) {
          // 跳过隐藏文件
          if (entry.startsWith('.')) continue;

          const fullPath = join(dirPath, entry);

          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              // 目录：添加 / 后缀
              result.push(`${prefix}${entry}/`);
              if (recursive) {
                // 递归遍历子目录
                listDir(fullPath, prefix + '  ');
              }
            } else {
              // 文件：直接添加
              result.push(`${prefix}${entry}`);
            }
          } catch {
            // 权限错误：标记后添加
            result.push(`${prefix}${entry} (permission denied)`);
          }
        }
      }

      // 开始遍历
      listDir(targetPath);

      if (result.length === 0) {
        return `Directory is empty: ${targetPath}`;
      }

      return result.join('\n');
    } catch (error) {
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ENOENT') {
          return `Error: Directory not found: ${targetPath}`;
        }
        if ('code' in error && error.code === 'ENOTDIR') {
          return `Error: Path is not a directory: ${targetPath}`;
        }
        return `Error listing directory: ${error.message}`;
      }
      return `Error listing directory: ${String(error)}`;
    }
  },
};
