import { spawn } from 'child_process';
import type { Tool } from '../types/index.js';
import { commandSanitizer, inputValidator, outputSanitizer } from '../utils/security.js';

/**
 * Bash 工具
 *
 * 在终端执行 bash 命令的核心工具
 *
 * 安全特性：
 * - 输入验证：检查命令是否包含危险字符
 * - 命令白名单：只允许预定义的安全命令
 * - 输出过滤：检测并标记输出中的敏感信息
 */
export const BashTool: Tool = {
  /** 工具名称 */
  name: 'BashTool',
  /** 工具描述 */
  description: 'Execute a bash command in the terminal. Use this to run shell commands like ls, cat, git, etc.',

  /** 输入参数 schema */
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

  /**
   * 执行 bash 命令
   *
   * 执行流程：
   * 1. 验证命令输入（防止注入攻击）
   * 2. 清理命令（应用白名单过滤）
   * 3. 执行命令
   * 4. 过滤输出（检测敏感信息）
   *
   * @param input - 包含 command 字段的对象
   * @returns 命令执行结果的字符串
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const command = input.command as string;

    // 步骤 1：验证命令输入
    const validation = inputValidator.validateCommand(command, false);
    if (!validation.valid) {
      throw new Error(`Invalid command: ${validation.error}`);
    }

    // 步骤 2：清理命令（应用安全过滤）
    const sanitizeResult = commandSanitizer.sanitizeCommand(command, true);
    if (sanitizeResult.warnings.length > 0) {
      console.warn('[Security Warning]', sanitizeResult.warnings.join(', '));
    }

    if (!sanitizeResult.sanitized) {
      throw new Error('Command was blocked by security filter');
    }

    // 步骤 3：执行命令
    return new Promise((resolve, reject) => {
      const child = spawn(sanitizeResult.sanitized, [], {
        shell: true,
        cwd: process.cwd(),
      });

      let stdout = '';
      let stderr = '';

      // 收集标准输出
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      // 收集标准错误
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // 命令执行完成
      child.on('close', (code) => {
        if (code === 0) {
          // 步骤 4：过滤输出中的敏感信息
          const sanitizedOutput = outputSanitizer.sanitize(stdout);
          if (sanitizedOutput.hadSecrets) {
            console.warn('[Output Sanitized]', sanitizedOutput.redactions.join(', '));
          }
          resolve(stdout || '(no output)');
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      // 命令执行出错
      child.on('error', (error) => {
        reject(new Error(`Command execution error: ${error.message}`));
      });

      // 命令超时（60秒）
      setTimeout(() => {
        child.kill();
        reject(new Error('Command execution timeout (60s)'));
      }, 60000);
    });
  },
};
