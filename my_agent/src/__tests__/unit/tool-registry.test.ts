import { describe, it, expect, beforeEach } from 'vitest';
import { toolRegistry } from '../../tools/registry.js';

describe('ToolRegistry', () => {
  beforeEach(() => {
  });

  it('should have registered default tools', () => {
    const tools = toolRegistry.getAll();
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should register BashTool', () => {
    const tool = toolRegistry.get('BashTool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('BashTool');
  });

  it('should register FileReadTool', () => {
    const tool = toolRegistry.get('FileReadTool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('FileReadTool');
  });

  it('should register FileWriteTool', () => {
    const tool = toolRegistry.get('FileWriteTool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('FileWriteTool');
  });

  it('should register GlobTool', () => {
    const tool = toolRegistry.get('GlobTool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('GlobTool');
  });

  it('should register WebSearchTool', () => {
    const tool = toolRegistry.get('WebSearchTool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('WebSearchTool');
  });

  it('should register GitHubBranchTool', () => {
    const tool = toolRegistry.get('GitHubBranchTool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('GitHubBranchTool');
  });

  it('should check if tool exists using has()', () => {
    expect(toolRegistry.has('BashTool')).toBe(true);
    expect(toolRegistry.has('NonExistentTool')).toBe(false);
  });

  it('should get all registered tools', () => {
    const tools = toolRegistry.getAll();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThanOrEqual(14);
  });

  it('should have tool with valid inputSchema', () => {
    const bashTool = toolRegistry.get('BashTool');
    expect(bashTool?.inputSchema).toBeDefined();
    expect(bashTool?.inputSchema.type).toBe('object');
    expect(bashTool?.inputSchema.properties).toBeDefined();
  });

  it('should have tool with description', () => {
    const bashTool = toolRegistry.get('BashTool');
    expect(bashTool?.description).toBeDefined();
    expect(typeof bashTool?.description).toBe('string');
    expect(bashTool?.description.length).toBeGreaterThan(0);
  });

  it('should return undefined for non-existent tool', () => {
    const tool = toolRegistry.get('NonExistentTool');
    expect(tool).toBeUndefined();
  });

  it('should have execute function for each tool', () => {
    const tools = toolRegistry.getAll();
    tools.forEach((tool) => {
      expect(typeof tool.execute).toBe('function');
    });
  });

  it('should have unique tool names', () => {
    const tools = toolRegistry.getAll();
    const names = tools.map(t => t.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it('should register EditTool', () => {
    const tool = toolRegistry.get('EditTool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('EditTool');
  });

  it('should register FileListTool', () => {
    const tool = toolRegistry.get('FileListTool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('FileListTool');
  });

  it('should register GitHubUserTool', () => {
    const tool = toolRegistry.get('GitHubUserTool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('GitHubUserTool');
  });

  it('should register GitHubRepoTool', () => {
    const tool = toolRegistry.get('GitHubRepoTool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('GitHubRepoTool');
  });

  it('should register GitHubIssueTool', () => {
    const tool = toolRegistry.get('GitHubIssueTool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('GitHubIssueTool');
  });

  it('should register GitHubCodeSearchTool', () => {
    const tool = toolRegistry.get('GitHubCodeSearchTool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('GitHubCodeSearchTool');
  });

  it('should register GitHubPullRequestTool', () => {
    const tool = toolRegistry.get('GitHubPullRequestTool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('GitHubPullRequestTool');
  });

  it('should register GitHubCommitTool', () => {
    const tool = toolRegistry.get('GitHubCommitTool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('GitHubCommitTool');
  });

  it('should have required fields for all tools', () => {
    const tools = toolRegistry.getAll();
    tools.forEach((tool) => {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
      expect(tool).toHaveProperty('execute');
    });
  });

  describe('normalizeParams', () => {
    it('should normalize GrepTool parameters', () => {
      const input = { file_path: 'test.ts', regex: 'TODO' };
      const result = toolRegistry.normalizeParams('GrepTool', input);
      expect(result).toEqual({ path: 'test.ts', pattern: 'TODO' });
    });

    it('should normalize EditTool parameters', () => {
      const input = { file_path: 'test.ts', old_content: 'old', new_content: 'new' };
      const result = toolRegistry.normalizeParams('EditTool', input);
      expect(result).toEqual({ path: 'test.ts', oldString: 'old', newString: 'new' });
    });

    it('should normalize CopyTool parameters', () => {
      const input = { src: 'a.txt', dest: 'b.txt' };
      const result = toolRegistry.normalizeParams('CopyTool', input);
      expect(result).toEqual({ source: 'a.txt', destination: 'b.txt' });
    });

    it('should normalize MoveTool parameters', () => {
      const input = { source_path: 'a.txt', destination_path: 'b.txt' };
      const result = toolRegistry.normalizeParams('MoveTool', input);
      expect(result).toEqual({ source: 'a.txt', destination: 'b.txt' });
    });

    it('should normalize BashTool parameters', () => {
      const input = { cmd: 'ls -la' };
      const result = toolRegistry.normalizeParams('BashTool', input);
      expect(result).toEqual({ command: 'ls -la' });
    });

    it('should not modify unknown tools parameters', () => {
      const input = { foo: 'bar' };
      const result = toolRegistry.normalizeParams('UnknownTool', input);
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should not modify parameters without aliases', () => {
      const input = { path: 'test.ts', pattern: 'TODO' };
      const result = toolRegistry.normalizeParams('GrepTool', input);
      expect(result).toEqual({ path: 'test.ts', pattern: 'TODO' });
    });

    it('should handle camelCase aliases', () => {
      const input = { filePath: 'test.ts', newContent: 'content' };
      const result = toolRegistry.normalizeParams('EditTool', input);
      expect(result).toEqual({ path: 'test.ts', newString: 'content' });
    });

    it('should preserve non-aliased parameters', () => {
      const input = { path: 'test.ts', pattern: 'TODO', recursive: true };
      const result = toolRegistry.normalizeParams('GrepTool', input);
      expect(result).toEqual({ path: 'test.ts', pattern: 'TODO', recursive: true });
    });
  });
});
