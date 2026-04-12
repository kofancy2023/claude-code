import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { Tool } from '../types/index.js';
import { inputValidator, secretScanner } from '../utils/security.js';

/**
 * 文件写入工具
 *
 * 用于创建或覆盖文件内容
 *
 * 安全特性：
 * - 路径验证：防止路径遍历攻击（../）
 * - 内容扫描：检测待写入内容是否包含敏感信息
 */
export const FileWriteTool: Tool = {
  /** 工具名称 */
  name: 'FileWriteTool',
  /** 工具描述 */
  description: 'Write content to a file. Creates the file if it does not exist, or overwrites if it exists. Use this to create or update files.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to write (relative to current working directory or absolute path)',
      },
      content: {
        type: 'string',
        description: 'The content to write to the file',
      },
    },
    required: ['path', 'content'],
  },

  /**
   * 写入文件内容
   *
   * 执行流程：
   * 1. 验证文件路径（防止路径遍历）
   * 2. 扫描敏感信息（写入前检测）
   * 3. 确保目录存在
   * 4. 写入文件
   *
   * @param input - 包含 path 和 content 字段的对象
   * @returns 成功或错误信息
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const path = input.path as string;
    const content = input.content as string;

    // 步骤 1：验证路径安全性
    const validation = inputValidator.validatePath(path);
    if (!validation.valid) {
      return `Error: ${validation.error}`;
    }

    // 步骤 2：扫描敏感信息
    const secretCheck = secretScanner.scan(content);
    if (secretCheck.hasSecrets) {
      console.warn('[Security Warning] File content contains potential secrets:', secretCheck.summary);
    }

    try {
      // 步骤 3：确保目录存在
      const dir = dirname(validation.sanitized);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // 步骤 4：写入文件
      writeFileSync(validation.sanitized, content, 'utf-8');
      return `Successfully wrote to file: ${path}`;
    } catch (error) {
      // 错误处理
      if (error instanceof Error) {
        return `Error writing file: ${error.message}`;
      }
      return `Error writing file: ${String(error)}`;
    }
  },
};
