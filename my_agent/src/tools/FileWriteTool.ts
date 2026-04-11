import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { Tool } from '../types/index.js';
import { inputValidator, secretScanner } from '../utils/security.js';

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

    const validation = inputValidator.validatePath(path);
    if (!validation.valid) {
      return `Error: ${validation.error}`;
    }

    const secretCheck = secretScanner.scan(content);
    if (secretCheck.hasSecrets) {
      console.warn('[Security Warning] File content contains potential secrets:', secretCheck.summary);
    }

    try {
      const dir = dirname(validation.sanitized);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(validation.sanitized, content, 'utf-8');
      return `Successfully wrote to file: ${path}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error writing file: ${error.message}`;
      }
      return `Error writing file: ${String(error)}`;
    }
  },
};
