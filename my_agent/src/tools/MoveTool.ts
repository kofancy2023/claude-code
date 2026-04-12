import { renameSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { Tool } from '../types/index.js';
import { inputValidator } from '../utils/security.js';

/**
 * Move 工具
 *
 * 移动或重命名文件/目录
 *
 * 功能：
 * - 移动文件到新位置
 * - 重命名文件
 * - 自动创建目标目录（如果不存在）
 * - 跨文件系统移动
 *
 * 使用场景：
 * - 整理项目结构
 * - 重命名文件
 * - 将文件移动到新目录
 */
export const MoveTool: Tool = {
  /** 工具名称 */
  name: 'MoveTool',
  /** 工具描述 */
  description: 'Move or rename a file or directory. Use this to reorganize files, rename items, or relocate content to a different directory. Automatically creates destination directory if needed.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Source file or directory path to move from',
      },
      destination: {
        type: 'string',
        description: 'Destination file or directory path to move to',
      },
      overwrite: {
        type: 'boolean',
        description: 'Overwrite if destination exists (default: false)',
      },
    },
    required: ['source', 'destination'],
  },

  /**
   * 移动或重命名文件/目录
   *
   * @param input - 包含 source, destination, overwrite 字段
   * @returns 移动结果
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const source = input.source as string;
    const destination = input.destination as string;
    const overwrite = (input.overwrite as boolean) ?? false;

    // 验证源路径
    const sourceValidation = inputValidator.validatePath(source);
    if (!sourceValidation.valid) {
      return `Error: Invalid source path - ${sourceValidation.error}`;
    }

    // 验证目标路径
    const destValidation = inputValidator.validatePath(destination);
    if (!destValidation.valid) {
      return `Error: Invalid destination path - ${destValidation.error}`;
    }

    try {
      // 检查源是否存在
      if (!existsSync(source)) {
        return `Error: Source does not exist: ${source}`;
      }

      // 检查目标是否存在
      if (existsSync(destination) && !overwrite) {
        return `Error: Destination already exists. Use overwrite=true to overwrite.`;
      }

      // 确保目标目录存在
      const destDir = dirname(destination);
      if (!existsSync(destDir)) {
        const mkdirTool = await import('./MkdirTool.js');
        const mkdirResult = await mkdirTool.MkdirTool.execute({ path: destDir, recursive: true });
        if (mkdirResult.startsWith('Error')) {
          return `Error: Could not create destination directory: ${mkdirResult}`;
        }
      }

      // 执行移动
      renameSync(source, destination);

      return `Successfully moved ${source} to ${destination}`;
    } catch (error) {
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ENOENT') {
          return `Error: Source not found: ${source}`;
        }
        if ('code' in error && error.code === 'EISDIR') {
          return `Error: Source is a directory, not a file: ${source}`;
        }
        if ('code' in error && error.code === 'EPERM') {
          return `Error: Permission denied to move: ${source}`;
        }
        if ('code' in error && error.code === 'EXDEV') {
          return `Error: Cannot move across different filesystems. Try copying and removing instead.`;
        }
        return `Error moving file: ${error.message}`;
      }
      return `Error: Unknown error occurred`;
    }
  },
};
