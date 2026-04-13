import { describe, it, expect, beforeEach } from 'vitest';
import { DiffService, diffService, defaultDiffTheme, plainDiffTheme } from '../../services/diff.js';
import * as fs from 'fs';
import * as path from 'path';

describe('DiffService', () => {
  let diff: DiffService;
  const testDir = path.join(process.cwd(), 'test-output');

  beforeEach(() => {
    diff = new DiffService();
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  describe('computeDiff', () => {
    it('should return no changes for identical content', () => {
      const result = diff.computeDiff('/test/file.ts', 'hello\nworld\n', 'hello\nworld\n');
      expect(result.hasChanges).toBe(false);
      expect(result.addedLines).toBe(0);
      expect(result.removedLines).toBe(0);
    });

    it('should detect added lines', () => {
      const result = diff.computeDiff('/test/file.ts', 'hello\n', 'hello\nworld\n');
      expect(result.hasChanges).toBe(true);
      expect(result.addedLines).toBe(1);
      expect(result.removedLines).toBe(0);
      expect(result.unifiedDiff.some(line => line.startsWith('+'))).toBe(true);
    });

    it('should detect removed lines', () => {
      const result = diff.computeDiff('/test/file.ts', 'hello\nworld\n', 'hello\n');
      expect(result.hasChanges).toBe(true);
      expect(result.addedLines).toBe(0);
      expect(result.removedLines).toBe(1);
      expect(result.unifiedDiff.some(line => line.startsWith('-'))).toBe(true);
    });

    it('should handle empty old content', () => {
      const result = diff.computeDiff('/test/new.ts', '', 'hello\nworld\n');
      expect(result.hasChanges).toBe(true);
      expect(result.addedLines).toBe(2);
      expect(result.removedLines).toBe(0);
    });

    it('should handle empty new content', () => {
      const result = diff.computeDiff('/test/empty.ts', 'hello\nworld\n', '');
      expect(result.hasChanges).toBe(true);
      expect(result.addedLines).toBe(0);
      expect(result.removedLines).toBe(2);
    });

    it('should handle both empty', () => {
      const result = diff.computeDiff('/test/empty.ts', '', '');
      expect(result.hasChanges).toBe(false);
    });
  });

  describe('computeFileDiff', () => {
    it('should create new file diff when file does not exist', () => {
      const nonExistentPath = path.join(testDir, 'new-file-' + Date.now() + '.ts');
      const result = diff.computeFileDiff(nonExistentPath, 'new content\nline2\n');
      expect(result.hasChanges).toBe(true);
      expect(result.addedLines).toBe(2);
    });

    it('should compute diff for existing file', () => {
      const filePath = path.join(testDir, 'existing-' + Date.now() + '.ts');
      fs.writeFileSync(filePath, 'original content\n');
      const result = diff.computeFileDiff(filePath, 'modified content\n');
      expect(result.hasChanges).toBe(true);
      fs.unlinkSync(filePath);
    });
  });

  describe('formatUnifiedDiff', () => {
    it('should format diff with colors', () => {
      const result = diff.computeDiff('/test/file.ts', 'old\n', 'new\n');
      const formatted = diff.formatUnifiedDiff(result, defaultDiffTheme);
      expect(formatted).toContain('+');
      expect(formatted).toContain('-');
    });

    it('should format diff without colors', () => {
      const result = diff.computeDiff('/test/file.ts', 'old\n', 'new\n');
      const formatted = diff.formatUnifiedDiff(result, plainDiffTheme);
      expect(formatted).toContain('+new');
      expect(formatted).toContain('-old');
    });

    it('should return "No changes" for unchanged content', () => {
      const result = diff.computeDiff('/test/file.ts', 'same\n', 'same\n');
      const formatted = diff.formatUnifiedDiff(result);
      expect(formatted).toContain('No changes');
    });
  });

  describe('formatSummary', () => {
    it('should return "No changes" for unchanged content', () => {
      const result = diff.computeDiff('/test/file.ts', 'same\n', 'same\n');
      expect(diff.formatSummary(result)).toBe('No changes');
    });

    it('should return summary with added and removed counts', () => {
      const result = diff.computeDiff('/test/file.ts', 'old\nlines\n', 'new\nlines\nhere\n');
      const summary = diff.formatSummary(result);
      expect(summary).toMatch(/\+\d+/);
      expect(summary).toMatch(/-\d+/);
    });
  });
});

describe('diffService singleton', () => {
  it('should export a singleton instance', () => {
    expect(diffService).toBeInstanceOf(DiffService);
  });
});
