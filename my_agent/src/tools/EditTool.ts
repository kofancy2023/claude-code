/**
 * 文件编辑工具
 *
 * 通过替换指定字符串来编辑文件
 *
 * 功能：
 * - 精确替换文件中的字符串
 * - 支持部分内容修改（无需重写整个文件）
 * - 验证替换字符串是否存在于文件中
 *
 * 使用场景：
 * - 修改代码中的特定内容
 * - 更新配置文件中的设置
 * - 修复文件中的错误文本
 *
 * 注意事项：
 * - oldString 必须与文件内容完全匹配（包括空格）
 * - oldString 和 newString 不能相同
 */
import { readFileSync, writeFileSync } from 'fs';
import type { Tool } from '../types/index.js';

/**
 * 文件编辑工具
 *
 * 通过字符串替换编辑文件
 *
 * 输入参数：
 * - path: 要编辑的文件路径
 * - oldString: 要替换的原始字符串（必须完全匹配）
 * - newString: 新的替换字符串
 *
 * 返回：成功或错误信息
 */
export const EditTool: Tool = {
  /** 工具名称 */
  name: 'EditTool',
  /** 工具描述 */
  description: 'Edit a file by replacing specific lines. Use this to make targeted changes to a file without rewriting the entire file.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to edit',
      },
      oldString: {
        type: 'string',
        description: 'The exact string to replace (must match the file content exactly)',
      },
      newString: {
        type: 'string',
        description: 'The replacement string',
      },
    },
    required: ['path', 'oldString', 'newString'],
  },

  /**
   * 编辑文件内容
   *
   * 执行流程：
   * 1. 读取文件全部内容
   * 2. 验证旧字符串是否存在于文件中
   * 3. 检查新旧字符串是否相同
   * 4. 执行替换操作
   * 5. 写入文件
   *
   * @param input - 包含 path, oldString 和 newString 字段
   * @returns 成功或错误信息
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const path = input.path as string;
    const oldString = input.oldString as string;
    const newString = input.newString as string;

    try {
      const content = readFileSync(path, 'utf-8');

      if (!content.includes(oldString)) {
        return `Error: oldString not found in file. Make sure the string matches exactly including whitespace.`;
      }

      if (oldString === newString) {
        return `Error: oldString and newString are the same. No changes to make.`;
      }

      const newContent = content.replace(oldString, newString);
      writeFileSync(path, newContent, 'utf-8');

      return `Successfully edited ${path}`;
    } catch (error) {
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ENOENT') {
          return `Error: File not found: ${path}`;
        }
        return `Error editing file: ${error.message}`;
      }
      return `Error editing file: ${String(error)}`;
    }
  },
};