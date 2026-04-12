import { copyFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { Tool } from '../types/index.js';
import { inputValidator } from '../utils/security.js';

/**
 * Copy 工具
 *
 * 复制文件
 *
 * 功能：
 * - 复制单个文件到目标位置
 * - 自动创建目标目录（如果不存在）
 * - 覆盖已存在的文件（需确认）
 *
 * 使用场景：
 * - 备份文件
 * - 复制配置文件
 * - 创建文件模板
 */
export const CopyTool: Tool = {
  /** 工具名称 */
  name: 'CopyTool',
  /** 工具描述 */
  description: 'Copy a file from source to destination. Use this to duplicate files, create backups, or copy templates. Automatically creates destination directory if needed.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Source file path to copy from',
      },
      destination: {
        type: 'string',
        description: 'Destination file path to copy to',
      },
      overwrite: {
        type: 'boolean',
        description: 'Overwrite if destination exists (default: false)',
      },
    },
    required: ['source', 'destination'],
  },

  /**
   * 复制文件
   *
   * @param input - 包含 source, destination, overwrite 字段
   * @returns 复制结果
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
      // 检查源文件是否存在
      if (!existsSync(source)) {
        return `Error: Source file does not exist: ${source}`;
      }

      // 检查目标文件是否存在
      if (existsSync(destination) && !overwrite) {
        return `Error: Destination file already exists. Use overwrite=true to overwrite.`;
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

      // 执行复制
      copyFileSync(source, destination);

      return `Successfully copied ${source} to ${destination}`;
    } catch (error) {
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ENOENT') {
          return `Error: Source file not found: ${source}`;
        }
        if ('code' in error && error.code === 'EISDIR') {
          return `Error: Source is a directory, not a file: ${source}`;
        }
        if ('code' in error && error.code === 'EPERM') {
          return `Error: Permission denied to copy: ${source}`;
        }
        return `Error copying file: ${error.message}`;
      }
      return `Error: Unknown error occurred`;
    }
  },
};
