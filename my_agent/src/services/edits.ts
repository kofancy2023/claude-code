/**
 * 编辑历史管理服务
 *
 * 负责跟踪和管理文件编辑操作，支持：
 * - 记录每次编辑的详细信息
 * - 支持 undo（撤销）操作
 * - 支持 redo（重做）操作
 * - 按文件路径隔离历史记录
 *
 * 使用场景：
 * - 用户执行错误编辑后需要回滚
 * - 支持多位置编辑的事务性回滚
 * - 编辑历史查询和审计
 */

import { readFileSync, writeFileSync } from 'fs';

/**
 * 单次编辑操作记录
 */
export interface EditRecord {
  /** 文件路径 */
  path: string;
  /** 替换前的原始内容 */
  oldContent: string;
  /** 替换后的新内容 */
  newContent: string;
  /** 替换的位置（行号范围） */
  position?: {
    startLine: number;
    endLine: number;
  };
  /** 编辑时间戳 */
  timestamp: number;
  /** 编辑描述（可选） */
  description?: string;
}

/**
 * 文件编辑历史
 */
interface FileHistory {
  /** 文件路径 */
  path: string;
  /** 该文件的编辑记录 */
  records: EditRecord[];
  /** 当前历史位置（用于 undo/redo） */
  currentIndex: number;
}

/**
 * 编辑历史管理器
 *
 * 使用单例模式，确保全局唯一的编辑历史记录
 *
 * 设计思路：
 * - 每个文件维护独立的编辑历史
 * - 使用 currentIndex 跟踪当前历史位置
 * - undo 时 currentIndex--，redo 时 currentIndex++
 * - 新编辑会清空 currentIndex 之后的历史（类似 Git 的 HEAD）
 */
export class EditHistoryManager {
  /** 单例实例 */
  private static instance: EditHistoryManager | null = null;

  /** 文件历史映射表 */
  private fileHistories: Map<string, FileHistory> = new Map();

  /** 全局编辑序号 */
  private editCounter: number = 0;

  /**
   * 获取单例实例
   */
  static getInstance(): EditHistoryManager {
    if (!EditHistoryManager.instance) {
      EditHistoryManager.instance = new EditHistoryManager();
    }
    return EditHistoryManager.instance;
  }

  /**
   * 重置单例（用于测试）
   */
  static reset(): void {
    EditHistoryManager.instance = null;
  }

  /**
   * 私有构造函数
   */
  private constructor() {}

  /**
   * 记录一次编辑操作
   *
   * 执行流程：
   * 1. 如果文件没有历史记录，创建新的 FileHistory
   * 2. 如果 currentIndex 不是指向最后，清空之后的记录（类似 Git HEAD 移动后新编辑）
   * 3. 在 currentIndex 位置添加新记录
   * 4. currentIndex 移动到新记录位置
   *
   * @param filePath - 文件路径
   * @param oldContent - 编辑前的原始内容
   * @param newContent - 编辑后的新内容
   * @param position - 编辑位置信息
   * @param description - 编辑描述
   */
  recordEdit(
    filePath: string,
    oldContent: string,
    newContent: string,
    position?: { startLine: number; endLine: number },
    description?: string
  ): void {
    this.editCounter++;

    let fileHistory = this.fileHistories.get(filePath);

    if (!fileHistory) {
      fileHistory = {
        path: filePath,
        records: [],
        currentIndex: -1,
      };
      this.fileHistories.set(filePath, fileHistory);
    }

    const record: EditRecord = {
      path: filePath,
      oldContent,
      newContent,
      position,
      timestamp: Date.now(),
      description,
    };

    if (fileHistory.currentIndex < fileHistory.records.length - 1) {
      fileHistory.records = fileHistory.records.slice(0, fileHistory.currentIndex + 1);
    }

    fileHistory.records.push(record);
    fileHistory.currentIndex = fileHistory.records.length - 1;
  }

  /**
   * 撤销上一次编辑
   *
   * 执行流程：
   * 1. 获取文件历史
   * 2. 检查是否还有可以撤销的记录
   * 3. 获取 currentIndex 位置的记录
   * 4. 将文件内容恢复为 oldContent
   * 5. currentIndex--
   *
   * @param filePath - 文件路径
   * @returns 撤销是否成功
   */
  undo(filePath: string): boolean {
    const fileHistory = this.fileHistories.get(filePath);

    if (!fileHistory || fileHistory.currentIndex < 0) {
      return false;
    }

    const record = fileHistory.records[fileHistory.currentIndex];

    try {
      const currentContent = readFileSync(filePath, 'utf-8');

      if (currentContent !== record.newContent) {
        console.warn(`[EditHistory] File content has changed since last edit, undo may not restore exact state`);
      }

      writeFileSync(filePath, record.oldContent, 'utf-8');
      fileHistory.currentIndex--;

      return true;
    } catch (error) {
      console.error(`[EditHistory] Undo failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * 重做上一次撤销的编辑
   *
   * 执行流程：
   * 1. 获取文件历史
   * 2. 检查是否还有可以重做的记录
   * 3. currentIndex++
   * 4. 获取 currentIndex 位置的记录
   * 5. 将文件内容恢复为 newContent
   *
   * @param filePath - 文件路径
   * @returns 重做是否成功
   */
  redo(filePath: string): boolean {
    const fileHistory = this.fileHistories.get(filePath);

    if (!fileHistory || fileHistory.currentIndex >= fileHistory.records.length - 1) {
      return false;
    }

    fileHistory.currentIndex++;
    const record = fileHistory.records[fileHistory.currentIndex];

    try {
      writeFileSync(filePath, record.newContent, 'utf-8');
      return true;
    } catch (error) {
      console.error(`[EditHistory] Redo failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * 获取文件的编辑历史
   *
   * @param filePath - 文件路径
   * @returns 编辑记录列表
   */
  getHistory(filePath: string): EditRecord[] {
    const fileHistory = this.fileHistories.get(filePath);
    return fileHistory ? fileHistory.records : [];
  }

  /**
   * 获取文件的当前历史位置
   *
   * @param filePath - 文件路径
   * @returns 当前位置索引（-1 表示无历史）
   */
  getCurrentIndex(filePath: string): number {
    const fileHistory = this.fileHistories.get(filePath);
    return fileHistory ? fileHistory.currentIndex : -1;
  }

  /**
   * 检查是否可以撤销
   *
   * @param filePath - 文件路径
   * @returns 是否可以撤销
   */
  canUndo(filePath: string): boolean {
    const fileHistory = this.fileHistories.get(filePath);
    return fileHistory !== undefined && fileHistory.currentIndex >= 0;
  }

  /**
   * 检查是否可以重做
   *
   * @param filePath - 文件路径
   * @returns 是否可以重做
   */
  canRedo(filePath: string): boolean {
    const fileHistory = this.fileHistories.get(filePath);
    return fileHistory !== undefined && fileHistory.currentIndex < fileHistory.records.length - 1;
  }

  /**
   * 清除指定文件的编辑历史
   *
   * @param filePath - 文件路径
   */
  clearHistory(filePath: string): void {
    this.fileHistories.delete(filePath);
  }

  /**
   * 清除所有编辑历史
   */
  clearAll(): void {
    this.fileHistories.clear();
    this.editCounter = 0;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalFiles: number;
    totalEdits: number;
    filesWithUndo: number;
    filesWithRedo: number;
  } {
    let filesWithUndo = 0;
    let filesWithRedo = 0;
    let totalEdits = 0;

    for (const history of this.fileHistories.values()) {
      totalEdits += history.records.length;
      if (this.canUndo(history.path)) filesWithUndo++;
      if (this.canRedo(history.path)) filesWithRedo++;
    }

    return {
      totalFiles: this.fileHistories.size,
      totalEdits,
      filesWithUndo,
      filesWithRedo,
    };
  }
}

/**
 * 全局编辑历史管理器实例
 */
export const editHistoryManager = EditHistoryManager.getInstance();
