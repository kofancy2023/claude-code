/**
 * 文件编辑工具（增强版）
 *
 * 通过替换指定字符串来编辑文件，支持：
 * - 精确替换文件中的字符串
 * - 多位置同时编辑（multiEdit 模式）
 * - 撤销/重做操作
 * - 编辑历史跟踪
 *
 * 功能：
 * - 单位置编辑：替换文件中的第一个匹配项
 * - 多位置编辑：一次修改多个位置（事务性）
 * - undo：撤销上一次编辑
 * - redo：重做上一次撤销的编辑
 * - history：查看编辑历史
 *
 * 使用场景：
 * - 修改代码中的特定内容
 * - 同时修改多处相同的代码模式
 * - 错误编辑后需要回滚
 *
 * 注意事项：
 * - oldString 必须与文件内容完全匹配（包括空格）
 * - oldString 和 newString 不能相同
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import * as path from 'path';
import type { Tool } from '../types/index.js';
import { editHistoryManager } from '../services/edits.js';

/**
 * 单个编辑操作
 */
interface SingleEdit {
  /** 要替换的原始字符串 */
  oldStr: string;
  /** 新的替换字符串 */
  newStr: string;
}

/**
 * 编辑操作参数
 */
interface EditInput {
  /** 文件路径 */
  path: string;
  /** 要替换的原始字符串（用于单位置编辑） */
  oldString?: string;
  /** 新的替换字符串（用于单位置编辑） */
  newString?: string;
  /** 多个编辑操作（用于多位置编辑） */
  edits?: SingleEdit[];
  /** 操作类型：edit/undo/redo/history */
  action?: 'edit' | 'undo' | 'redo' | 'history';
  /** 是否记录到历史（默认 true） */
  recordHistory?: boolean;
}

/**
 * 获取文件内容并计算行号范围
 */
function getContentAndPosition(
  filePath: string,
  searchStr: string
): { content: string; position?: { startLine: number; endLine: number } } | null {
  if (!existsSync(filePath)) {
    return null;
  }

  const content = readFileSync(filePath, 'utf-8');
  const index = content.indexOf(searchStr);

  if (index === -1) {
    return null;
  }

  const linesBefore = content.substring(0, index).split('\n');
  const startLine = linesBefore.length;
  const endLine = startLine + searchStr.split('\n').length - 1;

  return {
    content,
    position: { startLine, endLine },
  };
}

/**
 * 执行单次编辑
 */
function executeSingleEdit(
  filePath: string,
  oldStr: string,
  newStr: string,
  recordHistory: boolean = true
): { success: boolean; error?: string } {
  if (!existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  const result = getContentAndPosition(filePath, oldStr);
  if (!result) {
    return { success: false, error: `oldString not found in file: ${oldStr.substring(0, 50)}...` };
  }

  const { content, position } = result;

  if (oldStr === newStr) {
    return { success: false, error: 'oldString and newString are the same. No changes to make.' };
  }

  const newContent = content.replace(oldStr, newStr);
  writeFileSync(filePath, newContent, 'utf-8');

  if (recordHistory) {
    editHistoryManager.recordEdit(filePath, content, newContent, position);
  }

  return { success: true };
}

/**
 * 执行多位置编辑（事务性）
 *
 * 设计思路：
 * - 先验证所有编辑是否都能匹配
 * - 如果任何一个编辑无法匹配，回滚所有已执行的操作并返回错误
 * - 只有所有编辑都成功，才算事务完成
 */
function executeMultiEdit(
  filePath: string,
  edits: SingleEdit[],
  recordHistory: boolean = true
): { success: boolean; error?: string; appliedCount?: number } {
  if (!existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  const content = readFileSync(filePath, 'utf-8');
  let newContent = content;

  const appliedEdits: { oldStr: string; newStr: string; position?: { startLine: number; endLine: number } }[] = [];

  for (const edit of edits) {
    if (edit.oldStr === edit.newStr) {
      return { success: false, error: `oldStr and newStr are the same: "${edit.oldStr.substring(0, 30)}..."` };
    }

    const index = newContent.indexOf(edit.oldStr);
    if (index === -1) {
      return { success: false, error: `oldString not found: "${edit.oldStr.substring(0, 50)}..."` };
    }

    const linesBefore = newContent.substring(0, index).split('\n');
    const startLine = linesBefore.length;
    const endLine = startLine + edit.oldStr.split('\n').length - 1;

    appliedEdits.push({
      oldStr: edit.oldStr,
      newStr: edit.newStr,
      position: { startLine, endLine },
    });

    newContent = newContent.replace(edit.oldStr, edit.newStr);
  }

  writeFileSync(filePath, newContent, 'utf-8');

  if (recordHistory) {
    editHistoryManager.recordEdit(filePath, content, newContent, {
      startLine: appliedEdits[0].position?.startLine || 0,
      endLine: appliedEdits[appliedEdits.length - 1].position?.endLine || 0,
    });
  }

  return { success: true, appliedCount: edits.length };
}

/**
 * 格式化编辑历史为可读字符串
 */
function formatHistory(filePath: string): string {
  const records = editHistoryManager.getHistory(filePath);
  const currentIndex = editHistoryManager.getCurrentIndex(filePath);

  if (records.length === 0) {
    return `No edit history for ${filePath}`;
  }

  const lines: string[] = [`Edit history for ${path.basename(filePath)}:`];
  lines.push(`Total edits: ${records.length}, current position: ${currentIndex + 1}/${records.length}`);
  lines.push('');

  records.forEach((record, index) => {
    const marker = index === currentIndex ? '→ ' : '  ';
    const timestamp = new Date(record.timestamp).toLocaleTimeString();
    const preview = record.oldContent.substring(0, 40).replace(/\n/g, '↵');
    lines.push(`${marker}[${index + 1}] ${timestamp}: "${preview}..."`);
  });

  return lines.join('\n');
}

/**
 * 增强版文件编辑工具
 */
export const EditTool: Tool = {
  /** 工具名称 */
  name: 'EditTool',
  /** 工具描述 */
  description: `Edit a file by replacing specific strings. Supports:
- Single edit: replace one occurrence of oldString with newString
- Multi-edit: replace multiple locations at once using the 'edits' parameter
- Undo: revert the last edit using action='undo'
- Redo: reapply a previously undone edit using action='redo'
- History: view edit history using action='history'`,
  /** 输入参数 schema */
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
      edits: {
        type: 'array',
        description: 'Multiple edits to apply at once',
        items: {
          type: 'object',
          description: 'Single edit operation',
          properties: {
            oldStr: { type: 'string', description: 'String to replace' },
            newStr: { type: 'string', description: 'Replacement string' },
          },
          required: ['oldStr', 'newStr'],
        },
      },
      action: {
        type: 'string',
        enum: ['edit', 'undo', 'redo', 'history'],
        description: "Operation type: 'edit' (default), 'undo', 'redo', or 'history'",
      },
    },
    required: ['path'],
  },

  /**
   * 编辑文件内容
   *
   * @param input - 包含编辑参数的对象
   * @returns 成功或错误信息
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const params = input as unknown as EditInput;
    const { path: filePath, action = 'edit', recordHistory = true } = params;

    switch (action) {
      case 'undo':
        if (editHistoryManager.undo(filePath)) {
          return `Successfully undone last edit for ${filePath}`;
        }
        return `No more edits to undo for ${filePath}`;

      case 'redo':
        if (editHistoryManager.redo(filePath)) {
          return `Successfully redid last undone edit for ${filePath}`;
        }
        return `No more edits to redo for ${filePath}`;

      case 'history':
        return formatHistory(filePath);

      case 'edit':
      default:
        if (params.edits && params.edits.length > 0) {
          const result = executeMultiEdit(filePath, params.edits, recordHistory);
          if (!result.success) {
            return `Error: ${result.error}`;
          }
          return `Successfully applied ${result.appliedCount} edits to ${filePath}`;
        }

        if (!params.oldString || !params.newString) {
          return 'Error: oldString and newString are required for edit action';
        }

        const result = executeSingleEdit(filePath, params.oldString, params.newString, recordHistory);
        if (!result.success) {
          return `Error: ${result.error}`;
        }
        return `Successfully edited ${filePath}`;
    }
  },
};
