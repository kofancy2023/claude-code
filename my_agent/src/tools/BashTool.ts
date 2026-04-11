import { spawn } from 'child_process';
import type { Tool } from '../types/index.js';
import { commandSanitizer, inputValidator, outputSanitizer } from '../utils/security.js';

export const BashTool: Tool = {
  name: 'BashTool',
  description: 'Execute a bash command in the terminal. Use this to run shell commands like ls, cat, git, etc.',

  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute',
      },
    },
    required: ['command'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const command = input.command as string;

    const validation = inputValidator.validateCommand(command, false);
    if (!validation.valid) {
      throw new Error(`Invalid command: ${validation.error}`);
    }

    const sanitizeResult = commandSanitizer.sanitizeCommand(command, true);
    if (sanitizeResult.warnings.length > 0) {
      console.warn('[Security Warning]', sanitizeResult.warnings.join(', '));
    }

    if (!sanitizeResult.sanitized) {
      throw new Error('Command was blocked by security filter');
    }

    return new Promise((resolve, reject) => {
      const child = spawn(sanitizeResult.sanitized, [], {
        shell: true,
        cwd: process.cwd(),
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          const sanitizedOutput = outputSanitizer.sanitize(stdout);
          if (sanitizedOutput.hadSecrets) {
            console.warn('[Output Sanitized]', sanitizedOutput.redactions.join(', '));
          }
          resolve(stdout || '(no output)');
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });

      setTimeout(() => {
        child.kill();
        reject(new Error('Command timed out after 30 seconds'));
      }, 30000);
    });
  },
};
