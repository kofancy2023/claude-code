import { glob } from 'glob';
import type { Tool } from '../types/index.js';

export const GlobTool: Tool = {
  name: 'GlobTool',
  description: 'Find files matching a glob pattern. Use this to search for files by name patterns (e.g., "*.ts", "**/*.js").',

  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match files (e.g., "**/*.ts", "src/**/*.js")',
      },
      cwd: {
        type: 'string',
        description: 'Working directory to search in (default: current working directory)',
      },
    },
    required: ['pattern'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const pattern = input.pattern as string;
    const cwd = (input.cwd as string) || process.cwd();

    try {
      const files = await glob(pattern, {
        cwd,
        absolute: false,
        ignore: ['node_modules/**', 'dist/**', '.git/**'],
      });

      if (files.length === 0) {
        return `No files found matching pattern: ${pattern}`;
      }

      return files.join('\n');
    } catch (error) {
      if (error instanceof Error) {
        return `Error searching files: ${error.message}`;
      }
      return `Error searching files: ${String(error)}`;
    }
  },
};