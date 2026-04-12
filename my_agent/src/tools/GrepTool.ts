import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import type { Tool } from '../types/index.js';
import { inputValidator } from '../utils/security.js';

/**
 * Grep 工具
 *
 * 在文件和目录中搜索匹配指定模式的文本
 *
 * 功能：
 * - 在单个文件中搜索
 * - 在目录中递归搜索（可选）
 * - 支持文件扩展名过滤
 * - 返回匹配行及其行号
 * - 高亮显示匹配内容
 *
 * 使用场景：
 * - 在代码中搜索函数调用
 * - 查找特定字符串
 * - 统计匹配次数
 * - 搜索日志文件
 */
export const GrepTool: Tool = {
  /** 工具名称 */
  name: 'GrepTool',
  /** 工具描述 */
  description: 'Search for patterns in files. Use this to find specific text, code patterns, or function calls within files or directories. Supports recursive search and file type filtering.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The regex pattern or string to search for',
      },
      path: {
        type: 'string',
        description: 'File or directory path to search in',
      },
      recursive: {
        type: 'boolean',
        description: 'Search recursively in subdirectories (default: false)',
      },
      filePattern: {
        type: 'string',
        description: 'File extension filter, e.g., ".ts", ".js", ".py"',
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Case sensitive search (default: false)',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 100)',
      },
    },
    required: ['pattern', 'path'],
  },

  /**
   * 搜索文件内容
   *
   * 执行流程：
   * 1. 验证路径输入
   * 2. 检查路径是文件还是目录
   * 3. 如果是文件，直接搜索
   * 4. 如果是目录，递归收集所有文件（或按扩展名过滤）
   * 5. 在每个文件中搜索匹配的模式
   * 6. 格式化并返回结果
   *
   * @param input - 包含 pattern, path, recursive 等字段
   * @returns 匹配结果，每行格式为 "filename:lineNumber:matchedContent"
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const pattern = input.pattern as string;
    const searchPath = input.path as string;
    const recursive = (input.recursive as boolean) ?? false;
    const filePattern = input.filePattern as string | undefined;
    const caseSensitive = (input.caseSensitive as boolean) ?? false;
    const maxResults = (input.maxResults as number) ?? 100;

    // 步骤 1：验证路径
    const pathValidation = inputValidator.validatePath(searchPath);
    if (!pathValidation.valid) {
      return `Error: Invalid path - ${pathValidation.error}`;
    }

    try {
      const results: string[] = [];
      const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');

      // 收集要搜索的文件
      const filesToSearch: string[] = [];

      const collectFiles = (dir: string) => {
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          if (entry.isDirectory() && recursive) {
            // 跳过 node_modules 和隐藏目录
            if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
              collectFiles(fullPath);
            }
          } else if (entry.isFile()) {
            // 文件扩展名过滤
            if (!filePattern || extname(entry.name) === filePattern) {
              filesToSearch.push(fullPath);
            }
          }
        }
      };

      // 判断是文件还是目录
      const stats = await import('fs').then(fs => fs.statSync(searchPath));

      if (stats.isFile()) {
        filesToSearch.push(searchPath);
      } else if (stats.isDirectory()) {
        collectFiles(searchPath);
      } else {
        return `Error: Path is neither a file nor a directory`;
      }

      // 搜索每个文件
      let totalMatches = 0;

      for (const file of filesToSearch) {
        if (totalMatches >= maxResults) break;

        try {
          const content = readFileSync(file, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = caseSensitive ? line.match(regex) : line.match(regex);

            if (match) {
              const lineNum = i + 1;
              const displayLine = line.length > 200 ? line.substring(0, 200) + '...' : line;

              results.push(`${file}:${lineNum}:${displayLine}`);
              totalMatches++;

              if (totalMatches >= maxResults) break;
            }
          }
        } catch {
          // 跳过无法读取的文件（如无权限）
        }
      }

      if (results.length === 0) {
        return `No matches found for pattern "${pattern}" in ${searchPath}`;
      }

      return `Found ${totalMatches} matches:\n\n${results.join('\n')}`;

    } catch (error) {
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ENOENT') {
          return `Error: Path not found: ${searchPath}`;
        }
        return `Error searching path: ${error.message}`;
      }
      return `Error: Unknown error occurred`;
    }
  },
};
