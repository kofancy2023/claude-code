import { readFileSync } from 'fs';
import type { Tool } from '../types/index.js';
import { inputValidator, outputSanitizer } from '../utils/security.js';

/**
 * 文件读取工具
 *
 * 用于读取指定路径的文件内容
 *
 * 安全特性：
 * - 路径验证：防止路径遍历攻击（../）
 * - 输出扫描：检测文件内容是否包含敏感信息
 */
export const FileReadTool: Tool = {
  /** 工具名称 */
  name: 'FileReadTool',
  /** 工具描述 */
  description: 'Read the contents of a file from the file system. Use this when you need to see the content of a specific file.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to read (relative to current working directory or absolute path)',
      },
    },
    required: ['path'],
  },

  /**
   * 读取文件内容
   *
   * 执行流程：
   * 1. 验证文件路径（防止路径遍历）
   * 2. 读取文件内容
   * 3. 扫描敏感信息
   *
   * @param input - 包含 path 字段的对象
   * @returns 文件内容字符串，或错误信息
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const path = input.path as string;

    // 步骤 1：验证路径安全性
    const validation = inputValidator.validatePath(path);
    if (!validation.valid) {
      return `Error: ${validation.error}`;
    }

    try {
      // 步骤 2：读取文件
      const content = readFileSync(validation.sanitized, 'utf-8');

      // 步骤 3：扫描敏感信息
      const sanitizedContent = outputSanitizer.sanitize(content);
      if (sanitizedContent.hadSecrets) {
        console.warn('[Security Notice] File may contain secrets, some values were redacted');
      }

      return content;
    } catch (error) {
      // 错误处理
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ENOENT') {
          return `Error: File not found: ${path}`;
        }
        if ('code' in error && error.code === 'EISDIR') {
          return `Error: Path is a directory, not a file: ${path}`;
        }
        return `Error reading file: ${error.message}`;
      }
      return `Error reading file: ${String(error)}`;
    }
  },
};
