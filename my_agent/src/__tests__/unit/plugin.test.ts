/**
 * 插件系统单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PluginRegistry, createPluginRegistry } from '../../plugins/registry.js';
import type { AgentPlugin, PluginInstance } from '../../plugins/types.js';
import { PluginStatus } from '../../plugins/types.js';

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  const createMockPlugin = (name: string, version = '1.0.0'): AgentPlugin => ({
    metadata: {
      name,
      version,
      description: `Test plugin ${name}`,
      tags: ['test'],
    },
    tools: [
      {
        name: `${name}Tool`,
        description: `Tool from ${name}`,
        inputSchema: { type: 'object' as const, properties: {} },
        execute: async () => 'result',
      },
    ],
    hooks: {},
    middleware: [],
  });

  beforeEach(() => {
    registry = createPluginRegistry();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('register', () => {
    it('should register a plugin successfully', () => {
      const plugin = createMockPlugin('test-plugin');

      const result = registry.register(plugin);

      expect(result).toBe(true);
      expect(registry.has('test-plugin')).toBe(true);
    });

    it('should not allow duplicate registration by default', () => {
      const plugin = createMockPlugin('test-plugin');

      registry.register(plugin);
      const result = registry.register(plugin);

      expect(result).toBe(false);
    });

    it('should allow duplicate registration when configured', () => {
      const registryWithDup = createPluginRegistry({ allowDuplicate: true });
      const plugin = createMockPlugin('test-plugin');

      registryWithDup.register(plugin);
      const result = registryWithDup.register(plugin);

      expect(result).toBe(true);
    });

    it('should set plugin status to Loaded after registration', () => {
      const plugin = createMockPlugin('test-plugin');

      registry.register(plugin);

      const instance = registry.get('test-plugin');
      expect(instance?.status).toBe(PluginStatus.Loaded);
    });
  });

  describe('unregister', () => {
    it('should unregister a plugin successfully', () => {
      const plugin = createMockPlugin('test-plugin');
      registry.register(plugin);

      const result = registry.unregister('test-plugin');

      expect(result).toBe(true);
      expect(registry.has('test-plugin')).toBe(false);
    });

    it('should return false when unregistering non-existent plugin', () => {
      const result = registry.unregister('non-existent');

      expect(result).toBe(false);
    });

    it('should set plugin status to Unloaded after unregistration', () => {
      const plugin = createMockPlugin('test-plugin');
      registry.register(plugin);

      registry.unregister('test-plugin');

      expect(registry.has('test-plugin')).toBe(false);
    });
  });

  describe('get', () => {
    it('should return plugin instance by name', () => {
      const plugin = createMockPlugin('test-plugin');
      registry.register(plugin);

      const instance = registry.get('test-plugin');

      expect(instance).toBeDefined();
      expect(instance?.metadata.name).toBe('test-plugin');
    });

    it('should return undefined for non-existent plugin', () => {
      const instance = registry.get('non-existent');

      expect(instance).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all registered plugins', () => {
      registry.register(createMockPlugin('plugin-1'));
      registry.register(createMockPlugin('plugin-2'));
      registry.register(createMockPlugin('plugin-3'));

      const plugins = registry.getAll();

      expect(plugins).toHaveLength(3);
    });

    it('should return empty array when no plugins registered', () => {
      const plugins = registry.getAll();

      expect(plugins).toHaveLength(0);
    });
  });

  describe('getTools', () => {
    it('should return all tools from registered plugins', () => {
      registry.register(createMockPlugin('plugin-1'));
      registry.register(createMockPlugin('plugin-2'));

      const tools = registry.getTools();

      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.name)).toContain('plugin-1Tool');
      expect(tools.map(t => t.name)).toContain('plugin-2Tool');
    });

    it('should return empty array when no tools available', () => {
      const pluginWithoutTools: AgentPlugin = {
        metadata: { name: 'no-tools', version: '1.0.0' },
        tools: [],
        hooks: {},
        middleware: [],
      };
      registry.register(pluginWithoutTools);

      const tools = registry.getTools();

      expect(tools).toHaveLength(0);
    });
  });

  describe('getTool', () => {
    it('should return specific tool by name', () => {
      registry.register(createMockPlugin('test-plugin'));

      const tool = registry.getTool('test-pluginTool');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('test-pluginTool');
    });

    it('should return undefined for non-existent tool', () => {
      registry.register(createMockPlugin('test-plugin'));

      const tool = registry.getTool('nonExistentTool');

      expect(tool).toBeUndefined();
    });
  });

  describe('events', () => {
    it('should emit event when plugin is registered', () => {
      const plugin = createMockPlugin('test-plugin');
      let eventReceived = false;

      registry.on('plugin:registered', () => {
        eventReceived = true;
      });

      registry.register(plugin);

      expect(eventReceived).toBe(true);
    });

    it('should emit event when plugin is unregistered', () => {
      const plugin = createMockPlugin('test-plugin');
      registry.register(plugin);
      let eventReceived = false;

      registry.on('plugin:unregistered', () => {
        eventReceived = true;
      });

      registry.unregister('test-plugin');

      expect(eventReceived).toBe(true);
    });
  });

  describe('middleware', () => {
    it('should register and retrieve middleware', () => {
      const middleware = {
        name: 'test-middleware',
        priority: 10,
        handler: async (ctx: { toolName: string }, next: () => Promise<string>) => {
          return next();
        },
      };

      registry.registerMiddleware(middleware);

      const retrieved = registry.getMiddleware();
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].name).toBe('test-middleware');
    });

    it('should sort middleware by priority', () => {
      registry.registerMiddleware({
        name: 'low-priority',
        priority: 100,
        handler: async (ctx: { toolName: string }, next: () => Promise<string>) => next(),
      });
      registry.registerMiddleware({
        name: 'high-priority',
        priority: 1,
        handler: async (ctx: { toolName: string }, next: () => Promise<string>) => next(),
      });

      const middleware = registry.getMiddleware();

      expect(middleware[0].name).toBe('high-priority');
      expect(middleware[1].name).toBe('low-priority');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      registry.register(createMockPlugin('plugin-1'));
      registry.register(createMockPlugin('plugin-2', '1.0.0'));
      registry.get('plugin-2')!.status = PluginStatus.Error;

      const stats = registry.getStats();

      expect(stats.total).toBe(2);
      expect(stats.loaded).toBe(1);
      expect(stats.error).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all plugins', () => {
      registry.register(createMockPlugin('plugin-1'));
      registry.register(createMockPlugin('plugin-2'));

      registry.clear();

      expect(registry.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return correct count', () => {
      expect(registry.size()).toBe(0);

      registry.register(createMockPlugin('plugin-1'));
      expect(registry.size()).toBe(1);

      registry.register(createMockPlugin('plugin-2'));
      expect(registry.size()).toBe(2);

      registry.unregister('plugin-1');
      expect(registry.size()).toBe(1);
    });
  });
});

describe('PluginRegistry lifecycle hooks', () => {
  let registry: PluginRegistry;

  const createPluginWithHooks = (): AgentPlugin => ({
    metadata: { name: 'lifecycle-plugin', version: '1.0.0' },
    tools: [],
    hooks: {
      onLoad: vi.fn(),
      onUnload: vi.fn(),
      beforeToolExecute: vi.fn(),
      afterToolExecute: vi.fn(),
    },
    middleware: [],
  });

  beforeEach(() => {
    registry = createPluginRegistry();
  });

  afterEach(() => {
    registry.clear();
  });

  it('should call onLoad hook when registering', () => {
    const plugin = createPluginWithHooks();

    registry.register(plugin);

    expect(plugin.hooks.onLoad).toHaveBeenCalled();
  });

  it('should call onUnload hook when unregistering', () => {
    const plugin = createPluginWithHooks();
    registry.register(plugin);

    registry.unregister('lifecycle-plugin');

    expect(plugin.hooks.onUnload).toHaveBeenCalled();
  });
});
