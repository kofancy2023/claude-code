/**
 * Git 插件
 *
 * 提供 Git 版本控制相关的工具：
 * - GitStatusTool: 查看仓库状态
 * - GitLogTool: 查看提交历史
 * - GitDiffTool: 查看文件差异
 */

import type { AgentPlugin } from '../../types.js';

/**
 * Git 状态工具
 */
const GitStatusTool = {
  name: 'GitStatus',
  description: '查看 Git 仓库的当前状态，包括未跟踪、已修改、已暂存的文件',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Git 仓库路径，默认为当前目录',
        default: '.',
      },
      short: {
        type: 'boolean',
        description: '是否使用简短格式输出',
        default: false,
      },
    },
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const path = (input.path as string) || '.';
    const short = (input.short as boolean) || false;

    try {
      const args = short ? ['status', '--short', '-C', path] : ['status', '-C', path];
      const { execSync } = await import('child_process');
      const output = execSync(`git ${args.join(' ')}`, { encoding: 'utf-8' });
      return output;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * Git 日志工具
 */
const GitLogTool = {
  name: 'GitLog',
  description: '查看 Git 提交历史记录',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Git 仓库路径',
        default: '.',
      },
      limit: {
        type: 'number',
        description: '限制显示的提交数量',
        default: 10,
      },
      oneline: {
        type: 'boolean',
        description: '是否使用单行格式',
        default: true,
      },
    },
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const path = (input.path as string) || '.';
    const limit = (input.limit as number) || 10;
    const oneline = input.oneline !== false;

    try {
      const args = [
        'log',
        `--max-count=${limit}`,
        '--pretty=format:%h %s (%an, %ar)',
        '-C',
        path,
      ];

      if (oneline) {
        args.push('--oneline');
      }

      const { execSync } = await import('child_process');
      const output = execSync(`git ${args.join(' ')}`, { encoding: 'utf-8' });
      return output;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * Git 差异工具
 */
const GitDiffTool = {
  name: 'GitDiff',
  description: '查看文件或提交的差异',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Git 仓库路径',
        default: '.',
      },
      file: {
        type: 'string',
        description: '要查看差异的文件路径',
      },
      staged: {
        type: 'boolean',
        description: '是否查看已暂存的差异',
        default: false,
      },
      commit: {
        type: 'string',
        description: '要比较的提交哈希',
      },
    },
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const path = (input.path as string) || '.';
    const file = input.file as string | undefined;
    const staged = (input.staged as boolean) || false;
    const commit = input.commit as string | undefined;

    try {
      const args = ['diff'];

      if (staged) {
        args.push('--staged');
      }

      if (commit) {
        args.push(commit);
      } else if (staged) {
        args.push('--cached');
      }

      if (file) {
        args.push('--', file);
      }

      args.push('-C', path);

      const { execSync } = await import('child_process');
      const output = execSync(`git ${args.join(' ')}`, { encoding: 'utf-8' });
      return output || 'No changes';
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * Git 分支工具
 */
const GitBranchTool = {
  name: 'GitBranch',
  description: '列出、创建或删除 Git 分支',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Git 仓库路径',
        default: '.',
      },
      list: {
        type: 'boolean',
        description: '是否列出所有分支',
        default: true,
      },
      create: {
        type: 'string',
        description: '要创建的新分支名',
      },
      delete: {
        type: 'string',
        description: '要删除的分支名',
      },
      current: {
        type: 'boolean',
        description: '是否显示当前分支',
        default: false,
      },
    },
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const path = (input.path as string) || '.';
    const list = (input.list as boolean) || true;
    const create = input.create as string | undefined;
    const deleteBranch = input.delete as string | undefined;
    const current = (input.current as boolean) || false;

    try {
      const args = ['branch', '-C', path];

      if (current) {
        args.unshift('branch');
        const { execSync } = await import('child_process');
        const output = execSync(`git ${args.join(' ')}`, { encoding: 'utf-8' });
        const branches = output.split('\n').filter(b => b.startsWith('*'));
        return branches[0] || 'Not on any branch';
      }

      if (create) {
        args.push('-C', path, 'create', create);
        const { execSync } = await import('child_process');
        execSync(`git ${args.join(' ')}`, { encoding: 'utf-8' });
        return `Created branch: ${create}`;
      }

      if (deleteBranch) {
        args.push('-C', path, '-d', deleteBranch);
        const { execSync } = await import('child_process');
        execSync(`git ${args.join(' ')}`, { encoding: 'utf-8' });
        return `Deleted branch: ${deleteBranch}`;
      }

      if (list) {
        args.unshift('branch');
        const { execSync } = await import('child_process');
        const output = execSync(`git ${args.join(' ')}`, { encoding: 'utf-8' });
        return output;
      }

      return 'No operation specified';
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * Git 插件定义
 */
const gitPlugin: AgentPlugin = {
  metadata: {
    name: 'git-plugin',
    version: '1.0.0',
    description: '提供 Git 版本控制相关工具',
    author: 'My Agent Team',
    tags: ['git', 'vcs', 'version-control'],
    minAgentVersion: '0.1.0',
  },

  tools: [GitStatusTool, GitLogTool, GitDiffTool, GitBranchTool],

  hooks: {
    onLoad: () => {
      console.log('[GitPlugin] Loaded successfully');
    },
    onUnload: () => {
      console.log('[GitPlugin] Unloading...');
    },
  },
};

export default gitPlugin;
