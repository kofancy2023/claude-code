/**
 * Git 状态工具
 *
 * 提供本地 Git 仓库的智能状态感知功能
 *
 * 功能：
 * - 获取当前 Git 状态（工作区、暂存区）
 * - 列出已修改的文件
 * - 显示当前分支
 * - 检测未提交的更改
 * - 检测合并冲突
 *
 * 设计思路：
 * 通过解析 git status 和 git diff --stat 的输出来获取仓库状态
 * AI 可以根据这些信息来决定是否需要提交、推送等操作
 */

import { spawn } from 'child_process';
import type { Tool } from '../types/index.js';

/**
 * Git 操作结果
 */
interface GitResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Git 状态信息
 */
interface GitStatusInfo {
  /** 当前分支名称 */
  branch: string;
  /** 是否为干净的工作区 */
  isClean: boolean;
  /** 已修改的文件列表 */
  modified: string[];
  /** 已暂存的文件列表 */
  staged: string[];
  /** 未跟踪的文件列表 */
  untracked: string[];
  /** 有冲突的文件列表 */
  conflicted: string[];
  /** 相对于上游分支的领先/落后提交数 */
  aheadBehind?: { ahead: number; behind: number };
  /** 最后的提交 SHA */
  lastCommitSha?: string;
  /** 最后的提交消息 */
  lastCommitMessage?: string;
}

/**
 * Git 状态工具
 */
export const GitStatusTool: Tool = {
  /** 工具名称 */
  name: 'GitStatusTool',
  /** 工具描述 */
  description: 'Get the current status of a Git repository. Returns branch, modified files, staged changes, untracked files, and merge conflicts. Use this to understand what changes need to be committed or pushed.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the Git repository (optional, defaults to current directory)',
      },
      showStaged: {
        type: 'boolean',
        description: 'Include staged files in the response (default: true)',
      },
      showUntracked: {
        type: 'boolean',
        description: 'Include untracked files in the response (default: true)',
      },
    },
  },

  /**
   * 获取 Git 状态
   *
   * 执行流程：
   * 1. 解析输入参数
   * 2. 检查是否在 Git 仓库中
   * 3. 获取分支信息
   * 4. 获取修改文件列表
   * 5. 获取已暂存文件列表
   * 6. 获取未跟踪文件列表
   * 7. 检测合并冲突
   * 8. 获取领先/落后信息
   * 9. 格式化输出
   *
   * @param input - 包含 path 字段的对象
   * @returns 格式化的 Git 状态信息
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const path = (input.path as string) || process.cwd();
    const showStaged = input.showStaged !== false;
    const showUntracked = input.showUntracked !== false;

    // 步骤 1：检查是否在 Git 仓库中
    const isRepoResult = await runGitCommand(['rev-parse', '--is-inside-work-tree'], path);
    if (!isRepoResult.success || isRepoResult.stdout.trim() !== 'true') {
      return JSON.stringify({
        error: 'Not a Git repository',
        path,
      });
    }

    // 步骤 2：获取分支信息
    const branchResult = await runGitCommand(['branch', '--show-current'], path);
    const branch = branchResult.stdout.trim() || '(detached)';

    // 步骤 3：获取 git status --porcelain 输出
    const statusResult = await runGitCommand(['status', '--porcelable=v1', '-b'], path);
    const statusLines = statusResult.stdout.split('\n').filter(line => line.trim());

    // 解析状态
    const status: GitStatusInfo = {
      branch,
      isClean: statusLines.length === 0 || (statusLines.length === 1 && statusLines[0].includes('??')),
      modified: [],
      staged: [],
      untracked: [],
      conflicted: [],
    };

    for (const line of statusLines) {
      if (line.startsWith('??')) {
        // 未跟踪文件
        if (showUntracked) {
          status.untracked.push(line.substring(3).trim());
        }
      } else if (line.includes('!!')) {
        // 忽略的文件
      } else {
        // 解析状态码
        const indexStatus = line.charAt(0);
        const workTreeStatus = line.charAt(1);
        const filePath = line.substring(3).trim();

        // 检测冲突
        if (indexStatus === 'U' || workTreeStatus === 'U' || line.includes('AA') || line.includes('DD')) {
          status.conflicted.push(filePath);
          status.isClean = false;
        } else {
          // 已暂存的文件（第一列有状态）
          if (indexStatus !== ' ' && indexStatus !== '?') {
            if (showStaged) {
              status.staged.push(filePath);
            }
            status.isClean = false;
          }
          // 已修改的文件（第二列有状态）
          if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
            status.modified.push(filePath);
            status.isClean = false;
          }
        }
      }
    }

    // 步骤 4：获取领先/落后信息
    const trackingResult = await runGitCommand(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], path);
    if (trackingResult.success) {
      const counts = trackingResult.stdout.trim().split('\t');
      if (counts.length === 2) {
        status.aheadBehind = {
          ahead: parseInt(counts[0], 10) || 0,
          behind: parseInt(counts[1], 10) || 0,
        };
      }
    }

    // 步骤 5：获取最后提交信息
    const lastCommitResult = await runGitCommand(['log', '-1', '--pretty=format:%H%n%s'], path);
    if (lastCommitResult.success && lastCommitResult.stdout) {
      const commitLines = lastCommitResult.stdout.split('\n');
      status.lastCommitSha = commitLines[0] || '';
      status.lastCommitMessage = commitLines.slice(1).join('\n') || '';
    }

    // 格式化输出
    return formatGitStatus(status);
  },
};

/**
 * 运行 Git 命令
 */
async function runGitCommand(args: string[], cwd: string): Promise<GitResult> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, {
      cwd,
      shell: true,
      timeout: 10000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        code: code || 0,
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        stdout: '',
        stderr: err.message,
        code: -1,
      });
    });
  });
}

/**
 * 格式化 Git 状态输出
 */
function formatGitStatus(status: GitStatusInfo): string {
  const lines: string[] = [];

  // 标题
  lines.push(`## Git Status: ${status.branch}`);

  // 领先/落后信息
  if (status.aheadBehind) {
    const { ahead, behind } = status.aheadBehind;
    if (ahead > 0 || behind > 0) {
      const parts: string[] = [];
      if (ahead > 0) parts.push(`${ahead} commit(s) ahead`);
      if (behind > 0) parts.push(`${behind} commit(s) behind`);
      lines.push(`## ${parts.join(', ')} from upstream`);
    }
  }

  // 工作区状态
  if (status.isClean) {
    lines.push('## ✅ Working tree is clean');
  } else {
    lines.push('## ⚠️  Working tree has changes');

    // 冲突文件
    if (status.conflicted.length > 0) {
      lines.push('');
      lines.push('### 🔴 Merge Conflicts (must resolve before committing):');
      for (const file of status.conflicted) {
        lines.push(`  - ${file}`);
      }
    }

    // 已暂存文件
    if (status.staged.length > 0) {
      lines.push('');
      lines.push('### 🟢 Staged (ready to commit):');
      for (const file of status.staged) {
        lines.push(`  - ${file}`);
      }
    }

    // 已修改文件
    if (status.modified.length > 0) {
      lines.push('');
      lines.push('### 🟡 Modified (not staged):');
      for (const file of status.modified) {
        lines.push(`  - ${file}`);
      }
    }

    // 未跟踪文件
    if (status.untracked.length > 0) {
      lines.push('');
      lines.push('### ⬜ Untracked (new files):');
      for (const file of status.untracked) {
        lines.push(`  - ${file}`);
      }
    }
  }

  // 最后提交信息
  if (status.lastCommitSha) {
    lines.push('');
    lines.push(`## Last Commit: ${status.lastCommitSha.substring(0, 7)} - "${status.lastCommitMessage}"`);
  }

  return lines.join('\n');
}

/**
 * Git 提交工具
 */
export const GitCommitTool: Tool = {
  /** 工具名称 */
  name: 'GitCommitTool',
  /** 工具描述 */
  description: 'Commit staged changes to the Git repository. Use this after GitStatusTool shows staged changes. Commit message should be clear and descriptive.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Commit message (required)',
      },
      path: {
        type: 'string',
        description: 'Path to the Git repository (optional)',
      },
    },
    required: ['message'],
  },

  /**
   * 提交更改
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const message = input.message as string;
    const path = (input.path as string) || process.cwd();

    if (!message || message.trim().length === 0) {
      throw new Error('Commit message is required');
    }

    // 检查是否有暂存的内容
    const statusResult = await runGitCommand(['status', '--porcelain'], path);
    const hasStaged = statusResult.stdout.split('\n').some((line: string) => line.charAt(1) !== ' ' && line.charAt(1) !== '?');

    if (!hasStaged) {
      throw new Error('No staged changes to commit. Use GitStatusTool first, then stage files with git add.');
    }

    // 执行提交
    const result = await runGitCommand(['commit', '-m', message], path);

    if (!result.success) {
      throw new Error(`Git commit failed: ${result.stderr}`);
    }

    return `✅ Successfully committed:\n${message}\n\n${result.stdout}`;
  },
};

/**
 * Git 推送工具
 */
export const GitPushTool: Tool = {
  /** 工具名称 */
  name: 'GitPushTool',
  /** 工具描述 */
  description: 'Push commits to the remote repository. Use this after committing changes that you want to share.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      remote: {
        type: 'string',
        description: 'Remote name (default: origin)',
      },
      branch: {
        type: 'string',
        description: 'Branch name (default: current branch)',
      },
      path: {
        type: 'string',
        description: 'Path to the Git repository (optional)',
      },
    },
  },

  /**
   * 推送更改
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const remote = (input.remote as string) || 'origin';
    const branch = (input.branch as string) || '';
    const path = (input.path as string) || process.cwd();

    const args = ['push'];
    if (branch) {
      args.push(remote, branch);
    } else {
      args.push(remote);
    }

    const result = await runGitCommand(args, path);

    if (!result.success) {
      // 检查是否是认证错误
      if (result.stderr.includes('authentication') || result.stderr.includes('permission denied')) {
        throw new Error('Push failed: Authentication error. Please check your Git credentials.');
      }
      throw new Error(`Git push failed: ${result.stderr}`);
    }

    return `✅ Successfully pushed to ${remote}\n\n${result.stdout || 'Push completed.'}`;
  },
};

/**
 * Git 拉取工具
 */
export const GitPullTool: Tool = {
  /** 工具名称 */
  name: 'GitPullTool',
  /** 工具描述 */
  description: 'Pull changes from the remote repository. Use this to sync with remote changes.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      remote: {
        type: 'string',
        description: 'Remote name (default: origin)',
      },
      branch: {
        type: 'string',
        description: 'Branch name (default: current branch)',
      },
      path: {
        type: 'string',
        description: 'Path to the Git repository (optional)',
      },
    },
  },

  /**
   * 拉取更改
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const remote = (input.remote as string) || 'origin';
    const branch = (input.branch as string) || '';
    const path = (input.path as string) || process.cwd();

    const args = ['pull'];
    if (branch) {
      args.push(remote, branch);
    } else {
      args.push(remote);
    }

    const result = await runGitCommand(args, path);

    if (!result.success) {
      if (result.stderr.includes('conflict')) {
        throw new Error('Pull failed: Merge conflict detected. Please resolve conflicts manually.');
      }
      throw new Error(`Git pull failed: ${result.stderr}`);
    }

    return `✅ Successfully pulled from ${remote}\n\n${result.stdout || 'Pull completed.'}`;
  },
};

/**
 * Git 分支列表工具
 */
export const GitBranchTool: Tool = {
  /** 工具名称 */
  name: 'GitBranchTool',
  /** 工具描述 */
  description: 'List all Git branches. Shows local and remote branches with current branch highlighted.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      all: {
        type: 'boolean',
        description: 'Include remote branches (default: true)',
      },
      path: {
        type: 'string',
        description: 'Path to the Git repository (optional)',
      },
    },
  },

  /**
   * 列出分支
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const showAll = input.all !== false;
    const path = (input.path as string) || process.cwd();

    const args = ['branch', '-v'];
    if (showAll) {
      args.push('-a');
    }

    const result = await runGitCommand(args, path);

    if (!result.success) {
      throw new Error(`Git branch listing failed: ${result.stderr}`);
    }

    // 格式化输出
    const lines = result.stdout.split('\n').filter(line => line.trim());
    const formatted: string[] = ['## Git Branches:'];

    for (const line of lines) {
      const isCurrent = line.startsWith('*');
      const branchName = line.replace(/^\*?\s*/, '').trim();
      const parts = branchName.split(/\s+/);
      const name = parts[0];
      const tracking = parts.slice(1).join(' ');

      if (isCurrent) {
        formatted.push(`* ${name} ${tracking}`);
      } else {
        formatted.push(`  ${name} ${tracking}`);
      }
    }

    return formatted.join('\n');
  },
};

/**
 * Git 差异工具
 */
export const GitDiffTool: Tool = {
  /** 工具名称 */
  name: 'GitDiffTool',
  /** 工具描述 */
  description: 'Show changes between commits, branches, or files. Use this to see what has been modified.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Show diff for specific file (optional)',
      },
      staged: {
        type: 'boolean',
        description: 'Show staged changes (default: false)',
      },
      path: {
        type: 'string',
        description: 'Path to the Git repository (optional)',
      },
    },
  },

  /**
   * 显示差异
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const file = input.file as string;
    const staged = input.staged as boolean;
    const path = (input.path as string) || process.cwd();

    const args = ['diff'];
    if (staged) {
      args.push('--cached');
    }
    if (file) {
      args.push('--', file);
    }

    const result = await runGitCommand(args, path);

    if (!result.success) {
      throw new Error(`Git diff failed: ${result.stderr}`);
    }

    if (!result.stdout.trim()) {
      return staged ? '## No staged changes' : '## No unstaged changes';
    }

    const lines = result.stdout.split('\n');
    const formatted: string[] = [`## Diff ${staged ? '(staged)' : '(unstaged)'}${file ? `: ${file}` : ''}:`, ''];

    for (const line of lines) {
      if (line.startsWith('@@')) {
        formatted.push('');
        formatted.push(line);
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        formatted.push(`+${line.substring(1)}`);
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        formatted.push(`-${line.substring(1)}`);
      } else if (!line.startsWith('diff') && !line.startsWith('index')) {
        formatted.push(line);
      }
    }

    return formatted.join('\n');
  },
};
