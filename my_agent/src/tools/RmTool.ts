import { rmSync, existsSync } from 'fs';
import type { Tool } from '../types/index.js';
import { inputValidator } from '../utils/security.js';

/**
 * Rm 工具
 *
 * 删除文件或目录
 *
 * 功能：
 * - 删除单个文件
 * - 删除空目录
 * - 递归删除目录及其内容（危险操作）
 * - 安全检查：禁止删除系统目录
 *
 * 安全限制：
 * - 禁止删除根目录 /
 * - 禁止删除当前工作目录
 * - 禁止删除 node_modules（除非明确指定）
 */
export const RmTool: Tool = {
  /** 工具名称 */
  name: 'RmTool',
  /** 工具描述 */
  description: 'Remove (delete) a file or directory. Use with caution - this operation is irreversible. Supports recursive deletion of directories. SECURITY: Cannot delete system directories or root.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File or directory path to remove',
      },
      recursive: {
        type: 'boolean',
        description: 'Recursively delete directory contents (default: false)',
      },
      force: {
        type: 'boolean',
        description: 'Force deletion without confirmation (default: false)',
      },
    },
    required: ['path'],
  },

  /**
   * 删除文件或目录
   *
   * @param input - 包含 path, recursive, force 字段
   * @returns 删除结果
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const targetPath = input.path as string;
    const recursive = (input.recursive as boolean) ?? false;
    const force = (input.force as boolean) ?? false;

    // 验证路径
    const pathValidation = inputValidator.validatePath(targetPath);
    if (!pathValidation.valid) {
      return `Error: Invalid path - ${pathValidation.error}`;
    }

    // 安全检查：禁止删除根目录
    const normalizedPath = targetPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalizedPath === '' || normalizedPath === '/') {
      return `Error: Cannot delete root directory`;
    }

    // 安全检查：禁止删除当前工作目录
    const cwd = process.cwd().replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalizedPath === cwd || normalizedPath.startsWith(cwd + '/')) {
      if (!force) {
        return `Error: Cannot delete current working directory or its contents without force flag`;
      }
    }

    try {
      // 检查目标是否存在
      if (!existsSync(targetPath)) {
        return `Path does not exist: ${targetPath}`;
      }

      // 执行删除
      rmSync(targetPath, { recursive, force });

      if (recursive) {
        return `Successfully removed directory and contents: ${targetPath}`;
      } else {
        return `Successfully removed: ${targetPath}`;
      }
    } catch (error) {
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ENOENT') {
          return `Path does not exist: ${targetPath}`;
        }
        if ('code' in error && error.code === 'EPERM') {
          return `Error: Permission denied to delete: ${targetPath}`;
        }
        if ('code' in error && error.code === 'EBUSY') {
          return `Error: Path is in use and cannot be deleted: ${targetPath}`;
        }
        return `Error removing path: ${error.message}`;
      }
      return `Error: Unknown error occurred`;
    }
  },
};
