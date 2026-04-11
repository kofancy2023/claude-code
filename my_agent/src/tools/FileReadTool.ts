import { readFileSync } from 'fs';
import type { Tool } from '../types/index.js';

export const FileReadTool: Tool = {
  name: 'FileReadTool',
  description: 'Read the contents of a file from the file system. Use this when you need to see the content of a specific file.',

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

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const path = input.path as string;

    try {
      const content = readFileSync(path, 'utf-8');
      return content;
    } catch (error) {
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
