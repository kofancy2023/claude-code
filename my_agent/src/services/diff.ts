import * as fs from 'fs';

/**
 * Diff 计算结果
 */
export interface DiffResult {
  /** 文件路径 */
  path: string;
  /** 是否有变化 */
  hasChanges: boolean;
  /** 添加的行数 */
  addedLines: number;
  /** 删除的行数 */
  removedLines: number;
  /** 统一格式的 diff 行 */
  unifiedDiff: string[];
}

/**
 * 行级别 Diff 计算结果
 */
interface LineDiff {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

/**
 * 文件 Diff 服务
 *
 * 用于计算并展示文件的变更差异
 *
 * @example
 * const diff = new DiffService();
 * const result = diff.computeFileDiff('/path/to/file.ts', 'new content');
 * console.log(diff.formatUnifiedDiff(result));
 */
export class DiffService {
  /**
   * 计算文件的 diff
   *
   * @param filePath - 文件路径
   * @param newContent - 新的文件内容
   * @returns DiffResult 包含统一格式的 diff
   */
  computeFileDiff(filePath: string, newContent: string): DiffResult {
    let oldContent = '';
    let fileExists = false;

    try {
      if (fs.existsSync(filePath)) {
        oldContent = fs.readFileSync(filePath, 'utf-8');
        fileExists = true;
      }
    } catch {
      fileExists = false;
    }

    return this.computeDiff(filePath, oldContent, newContent, fileExists);
  }

  /**
   * 计算两个字符串之间的 diff
   *
   * @param filePath - 文件路径（用于显示）
   * @param oldContent - 原始内容
   * @param newContent - 新内容
   * @param isNewFile - 是否是新文件
   * @returns DiffResult
   */
  computeDiff(filePath: string, oldContent: string, newContent: string, isNewFile: boolean = false): DiffResult {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    let addedLines = 0;
    let removedLines = 0;
    const unifiedDiff: string[] = [];

    if (isNewFile) {
      // 新文件：所有行都是新增
      unifiedDiff.push(`--- /dev/null`);
      unifiedDiff.push(`+++ ${filePath}`);
      for (let i = 0; i < newLines.length; i++) {
        unifiedDiff.push(`@@ -0,0 +${i + 1} @@`);
        unifiedDiff.push(`+${newLines[i]}`);
        addedLines++;
      }
    } else {
      // 计算行级 diff
      const lineDiffs = this.computeLineDiff(oldLines, newLines);

      // 生成统一格式 diff
      unifiedDiff.push(`--- ${filePath}`);
      unifiedDiff.push(`+++ ${filePath}`);

      let oldLineNum = 1;
      let newLineNum = 1;
      let hunkOldLines = 0;
      let hunkNewLines = 0;

      for (const diff of lineDiffs) {
        if (diff.type === 'unchanged') {
          hunkOldLines++;
          hunkNewLines++;
          oldLineNum++;
          newLineNum++;
        } else if (diff.type === 'removed') {
          if (hunkOldLines === 0) {
            unifiedDiff.push(`@@ -${oldLineNum},${hunkOldLines + 1} +${newLineNum},${hunkNewLines + 1} @@`);
          }
          unifiedDiff.push(`-${diff.content}`);
          removedLines++;
          hunkOldLines++;
          oldLineNum++;
        } else if (diff.type === 'added') {
          if (hunkNewLines === 0) {
            unifiedDiff.push(`@@ -${oldLineNum},${hunkOldLines} +${newLineNum},${hunkNewLines + 1} @@`);
          }
          unifiedDiff.push(`+${diff.content}`);
          addedLines++;
          hunkNewLines++;
          newLineNum++;
        }
      }
    }

    return {
      path: filePath,
      hasChanges: addedLines > 0 || removedLines > 0,
      addedLines,
      removedLines,
      unifiedDiff,
    };
  }

  /**
   * 计算行级 diff（使用最长公共子序列算法）
   */
  private computeLineDiff(oldLines: string[], newLines: string[]): LineDiff[] {
    const m = oldLines.length;
    const n = newLines.length;

    // 构建 LCS 表
    const lcs: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          lcs[i][j] = lcs[i - 1][j - 1] + 1;
        } else {
          lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
        }
      }
    }

    // 回溯找出 diff
    let i = m;
    let j = n;

    const temp: LineDiff[] = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        temp.unshift({ type: 'unchanged', content: oldLines[i - 1], oldLineNum: i, newLineNum: j });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
        temp.unshift({ type: 'added', content: newLines[j - 1], newLineNum: j });
        j--;
      } else {
        temp.unshift({ type: 'removed', content: oldLines[i - 1], oldLineNum: i });
        i--;
      }
    }

    return temp;
  }

  /**
   * 格式化统一 diff 为终端显示
   *
   * @param result - DiffResult
   * @param theme - 颜色主题
   * @returns 格式化后的终端字符串
   */
  formatUnifiedDiff(result: DiffResult, theme?: DiffTheme): string {
    const t = theme || defaultDiffTheme;
    const lines: string[] = [];

    if (!result.hasChanges) {
      return t.bright + 'No changes' + t.reset;
    }

    for (const line of result.unifiedDiff) {
      if (line.startsWith('@@')) {
        lines.push(t.header + line + t.reset);
      } else if (line.startsWith('---') || line.startsWith('+++')) {
        lines.push(t.header + line + t.reset);
      } else if (line.startsWith('+')) {
        lines.push(t.added + line + t.reset);
      } else if (line.startsWith('-')) {
        lines.push(t.removed + line + t.reset);
      } else {
        lines.push(t.context + line + t.reset);
      }
    }

    return lines.join('\n');
  }

  /**
   * 生成简洁的 diff 摘要
   *
   * @param result - DiffResult
   * @returns 摘要字符串
   */
  formatSummary(result: DiffResult): string {
    if (!result.hasChanges) {
      return 'No changes';
    }
    return `+${result.addedLines} -${result.removedLines}`;
  }
}

/**
 * Diff 颜色主题
 */
export interface DiffTheme {
  added: string;
  removed: string;
  context: string;
  header: string;
  reset: string;
  bright: string;
}

/**
 * 默认的 diff 颜色主题（ANSI 颜色代码）
 */
export const defaultDiffTheme: DiffTheme = {
  added: '\x1b[32m',    // 绿色
  removed: '\x1b[31m',  // 红色
  context: '\x1b[90m',  // 灰色
  header: '\x1b[36m',   // 青色
  reset: '\x1b[0m',
  bright: '\x1b[1m',
};

/**
 * 亮色主题（无颜色）
 */
export const plainDiffTheme: DiffTheme = {
  added: '',
  removed: '',
  context: '',
  header: '',
  reset: '',
  bright: '',
};

/**
 * 全局 DiffService 实例
 */
export const diffService = new DiffService();
