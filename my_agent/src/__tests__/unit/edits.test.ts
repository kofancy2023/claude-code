/**
 * 编辑历史管理服务单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, unlinkSync, mkdirSync, existsSync, rmSync } from 'fs';
import * as path from 'path';
import { EditHistoryManager } from '../../services/edits.js';

describe('EditHistoryManager', () => {
  const testDir = path.join(process.cwd(), 'test-edits');
  const testFile = path.join(testDir, 'test.txt');

  beforeEach(() => {
    EditHistoryManager.reset();
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    writeFileSync(testFile, 'line1\nline2\nline3\nline4\nline5\n', 'utf-8');
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('recordEdit', () => {
    it('should record an edit operation', () => {
      const manager = EditHistoryManager.getInstance();
      const original = readFileSync(testFile, 'utf-8');
      const newContent = original.replace('line1', 'newline1');
      manager.recordEdit(testFile, original, newContent);

      const history = manager.getHistory(testFile);
      expect(history).toHaveLength(1);
      expect(history[0].oldContent).toBe(original);
      expect(history[0].newContent).toBe(newContent);
    });

    it('should record multiple edits for the same file', () => {
      const manager = EditHistoryManager.getInstance();
      let content = readFileSync(testFile, 'utf-8');
      let newContent = content.replace('line1', 'newline1');
      manager.recordEdit(testFile, content, newContent);
      
      content = newContent;
      newContent = content.replace('line2', 'newline2');
      manager.recordEdit(testFile, content, newContent);

      const history = manager.getHistory(testFile);
      expect(history).toHaveLength(2);
      expect(manager.getCurrentIndex(testFile)).toBe(1);
    });

    it('should clear future history when new edit is recorded after undo', () => {
      const manager = EditHistoryManager.getInstance();
      let content = readFileSync(testFile, 'utf-8');
      let newContent = content.replace('line1', 'newline1');
      manager.recordEdit(testFile, content, newContent);
      
      content = newContent;
      newContent = content.replace('line2', 'newline2');
      manager.recordEdit(testFile, content, newContent);
      
      manager.undo(testFile);
      
      content = readFileSync(testFile, 'utf-8');
      newContent = content.replace('line3', 'newline3');
      manager.recordEdit(testFile, content, newContent);

      const history = manager.getHistory(testFile);
      expect(history).toHaveLength(2);
      expect(history[0].newContent).toContain('newline1');
      expect(history[1].newContent).toContain('newline3');
    });
  });

  describe('undo', () => {
    it('should restore file to previous state', () => {
      const manager = EditHistoryManager.getInstance();
      const original = readFileSync(testFile, 'utf-8');
      const newContent = original.replace('line1', 'newline1');
      manager.recordEdit(testFile, original, newContent);

      const undone = manager.undo(testFile);
      expect(undone).toBe(true);
      expect(readFileSync(testFile, 'utf-8')).toBe(original);
    });

    it('should return false when no history exists', () => {
      const manager = EditHistoryManager.getInstance();
      const result = manager.undo(testFile);
      expect(result).toBe(false);
    });

    it('should return false when all edits have been undone', () => {
      const manager = EditHistoryManager.getInstance();
      manager.recordEdit(testFile, 'line1', 'newline1');
      manager.undo(testFile);

      const result = manager.undo(testFile);
      expect(result).toBe(false);
    });
  });

  describe('redo', () => {
    it('should restore file to next state', () => {
      const manager = EditHistoryManager.getInstance();
      const original = readFileSync(testFile, 'utf-8');
      const newContent = original.replace('line1', 'newline1');
      manager.recordEdit(testFile, original, newContent);
      manager.undo(testFile);

      const redone = manager.redo(testFile);
      expect(redone).toBe(true);
      expect(readFileSync(testFile, 'utf-8')).not.toBe(original);
      expect(readFileSync(testFile, 'utf-8')).toContain('newline1');
    });

    it('should return false when no redo is available', () => {
      const manager = EditHistoryManager.getInstance();
      const result = manager.redo(testFile);
      expect(result).toBe(false);
    });
  });

  describe('canUndo/canRedo', () => {
    it('should correctly report undo/redo availability', () => {
      const manager = EditHistoryManager.getInstance();

      expect(manager.canUndo(testFile)).toBe(false);
      expect(manager.canRedo(testFile)).toBe(false);

      const original = readFileSync(testFile, 'utf-8');
      const newContent = original.replace('line1', 'newline1');
      manager.recordEdit(testFile, original, newContent);
      expect(manager.canUndo(testFile)).toBe(true);
      expect(manager.canRedo(testFile)).toBe(false);

      manager.undo(testFile);
      expect(manager.canUndo(testFile)).toBe(false);
      expect(manager.canRedo(testFile)).toBe(true);

      manager.redo(testFile);
      expect(manager.canUndo(testFile)).toBe(true);
      expect(manager.canRedo(testFile)).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const manager = EditHistoryManager.getInstance();
      let content = readFileSync(testFile, 'utf-8');
      let newContent = content.replace('line1', 'newline1');
      manager.recordEdit(testFile, content, newContent);
      
      content = newContent;
      newContent = content.replace('line2', 'newline2');
      manager.recordEdit(testFile, content, newContent);
      
      manager.undo(testFile);

      const stats = manager.getStats();
      expect(stats.totalFiles).toBe(1);
      expect(stats.totalEdits).toBe(2);
      expect(stats.filesWithUndo).toBe(1);
      expect(stats.filesWithRedo).toBe(1);
    });
  });

  describe('clearHistory', () => {
    it('should clear history for specific file', () => {
      const manager = EditHistoryManager.getInstance();
      const original = readFileSync(testFile, 'utf-8');
      const newContent = original.replace('line1', 'newline1');
      manager.recordEdit(testFile, original, newContent);
      manager.clearHistory(testFile);

      expect(manager.getHistory(testFile)).toHaveLength(0);
      expect(manager.canUndo(testFile)).toBe(false);
    });
  });
});
