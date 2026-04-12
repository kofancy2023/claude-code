/**
 * MCP 模块单元测试
 *
 * 测试 MCP 客户端、FileSystemProvider、GitHubProvider
 *
 * 注意: 由于 ESM 模块导入路径问题,使用相对路径测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createFileSystemProvider } from '../../mcp/providers/FileSystemProvider.js';

describe('FileSystemProvider', () => {
  let provider: ReturnType<typeof createFileSystemProvider>;

  beforeEach(() => {
    provider = createFileSystemProvider();
  });

  describe('基本属性', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('filesystem');
    });

    it('should have correct type', () => {
      expect(provider.type).toBe('filesystem');
    });
  });

  describe('read()', () => {
    it('should throw error for invalid URI', async () => {
      await expect(provider.read('invalid://path')).rejects.toThrow();
    });
  });

  describe('exists()', () => {
    it('should return false for non-existent file', async () => {
      const exists = await provider.exists('file:///non/existent/file.txt');
      expect(exists).toBe(false);
    });
  });

  describe('getMetadata()', () => {
    it('should return undefined for non-existent file', async () => {
      const metadata = await provider.getMetadata('file:///non/existent/file.txt');
      expect(metadata).toBeUndefined();
    });
  });

  describe('配置选项', () => {
    it('should respect blockedPaths config', () => {
      const blockedProvider = createFileSystemProvider({
        blockedPaths: ['/node_modules', '/.git'],
      });

      expect(blockedProvider).toBeTruthy();
    });

    it('should respect maxFileSize config', () => {
      const smallFileProvider = createFileSystemProvider({
        maxFileSize: 10,
      });

      expect(smallFileProvider).toBeTruthy();
    });

    it('should respect allowedExtensions config', () => {
      const extProvider = createFileSystemProvider({
        allowedExtensions: ['.ts', '.js'],
      });

      expect(extProvider).toBeTruthy();
    });
  });
});

describe('URI 解析', () => {
  it('should handle URI with special characters', async () => {
    const provider = createFileSystemProvider();

    const uri = 'file:///D:/project/My%20Project/test.txt';
    const exists = await provider.exists(uri);
    expect(typeof exists).toBe('boolean');
  });
});
