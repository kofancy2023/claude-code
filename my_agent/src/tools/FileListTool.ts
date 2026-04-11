import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { Tool } from '../types/index.js';

export const FileListTool: Tool = {
  name: 'FileListTool',
  description: 'List files and directories in a folder. Use this to explore the file system structure.',

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

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const targetPath = (input.path as string) || process.cwd();
    const recursive = (input.recursive as boolean) || false;

    try {
      const result: string[] = [];

      function listDir(dirPath: string, prefix = ''): void {
        const entries = readdirSync(dirPath);

        for (const entry of entries) {
          if (entry.startsWith('.')) continue;

          const fullPath = join(dirPath, entry);

          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              result.push(`${prefix}${entry}/`);
              if (recursive) {
                listDir(fullPath, prefix + '  ');
              }
            } else {
              result.push(`${prefix}${entry}`);
            }
          } catch {
            result.push(`${prefix}${entry} (permission denied)`);
          }
        }
      }

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
