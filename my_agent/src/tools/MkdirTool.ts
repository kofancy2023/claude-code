import { mkdirSync, existsSync } from 'fs';
import type { Tool } from '../types/index.js';
import { inputValidator } from '../utils/security.js';

/**
 * Mkdir 工具
 *
 * 创建新目录
 *
 * 功能：
 * - 创建单个目录
 * - 创建多层嵌套目录（recursive 模式）
 * - 检查目录是否已存在
 *
 * 使用场景：
 * - 创建项目结构
 * - 创建输出目录
 * - 创建临时工作目录
 */
export const MkdirTool: Tool = {
  /** 工具名称 */
  name: 'MkdirTool',
  /** 工具描述 */
  description: 'Create a new directory. Use this to create folders for organizing files or creating new project structures. Supports creating nested directories with the recursive option.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The directory path to create',
      },
      recursive: {
        type: 'boolean',
        description: 'Create nested directories (default: false)',
      },
    },
    required: ['path'],
  },

  /**
   * 创建目录
   *
   * @param input - 包含 path 和 recursive 字段
   * @returns 创建结果
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const dirPath = input.path as string;
    const recursive = (input.recursive as boolean) ?? false;

    // 验证路径
    const pathValidation = inputValidator.validatePath(dirPath);
    if (!pathValidation.valid) {
      return `Error: Invalid path - ${pathValidation.error}`;
    }

    try {
      // 检查目录是否已存在
      if (existsSync(dirPath)) {
        return `Directory already exists: ${dirPath}`;
      }

      // 创建目录
      mkdirSync(dirPath, { recursive });

      if (recursive) {
        return `Successfully created directory and all parent directories: ${dirPath}`;
      } else {
        return `Successfully created directory: ${dirPath}`;
      }
    } catch (error) {
      if (error instanceof Error) {
        if ('code' in error && error.code === 'EEXIST') {
          return `Directory already exists: ${dirPath}`;
        }
        if ('code' in error && error.code === 'EPERM') {
          return `Error: Permission denied to create directory: ${dirPath}`;
        }
        return `Error creating directory: ${error.message}`;
      }
      return `Error: Unknown error occurred`;
    }
  },
};
