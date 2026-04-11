import { readFileSync, writeFileSync } from 'fs';
import type { Tool } from '../types/index.js';

export const EditTool: Tool = {
  name: 'EditTool',
  description: 'Edit a file by replacing specific lines. Use this to make targeted changes to a file without rewriting the entire file.',

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
