import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { Tool } from '../types/index.js';

export const FileWriteTool: Tool = {
  name: 'FileWriteTool',
  description: 'Write content to a file. Creates the file if it does not exist, or overwrites if it exists. Use this to create or update files.',

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

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const path = input.path as string;
    const content = input.content as string;

    try {
      const dir = dirname(path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(path, content, 'utf-8');
      return `Successfully wrote to file: ${path}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error writing file: ${error.message}`;
      }
      return `Error writing file: ${String(error)}`;
    }
  },
};
