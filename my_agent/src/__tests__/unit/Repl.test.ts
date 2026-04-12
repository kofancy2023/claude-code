import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockProvider } from '../mocks/MockAIProvider.js';
import { createStore, type Store } from '../../state/store.js';
import { CommandRegistry, type CommandContext } from '../../core/commands.js';

describe('Repl 组件单元测试', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let store: Store;

  beforeEach(() => {
    mockProvider = createMockProvider();
    store = createStore();
  });

  describe('Store 状态管理', () => {
    it('should create store with initial state', () => {
      expect(store).toBeDefined();
      expect(store.getMessages()).toEqual([]);
    });

    it('should add messages to store', () => {
      store.addMessage({ role: 'user', content: 'Hello' });
      const messages = store.getMessages();
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe('Hello');
    });

    it('should set and get tools', () => {
      const mockTool = {
        name: 'TestTool',
        description: 'A test tool',
        inputSchema: { type: 'object' as const, properties: {} },
        execute: async () => 'result'
      };
      store.setTools([mockTool]);
      const tools = store.getTools();
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('TestTool');
    });

    it('should maintain messages in store', () => {
      store.addMessage({ role: 'user', content: 'Hello' });
      const messages = store.getMessages();
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe('Hello');
    });
  });

  describe('CommandRegistry 命令注册', () => {
    let registry: CommandRegistry;
    let context: CommandContext;

    beforeEach(() => {
      registry = new CommandRegistry();
      context = {
        client: mockProvider,
        store,
      };
    });

    it('should parse command correctly', () => {
      expect(registry.isCommand('/help')).toBe(true);
      expect(registry.isCommand('hello')).toBe(false);
    });

    it('should parse command with arguments', () => {
      const parsed = registry.parse('/model claude-3');
      expect(parsed).not.toBeNull();
      expect(parsed?.command).toBe('model');
      expect(parsed?.args).toEqual(['claude-3']);
    });

    it('should return null for non-command input', () => {
      const parsed = registry.parse('hello world');
      expect(parsed).toBeNull();
    });

    it('should get all registered commands', () => {
      const commands = registry.getAll();
      expect(commands.length).toBeGreaterThan(0);
    });

    it('should handle unknown command', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await registry.execute('/unknowncommand', context);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

describe('Repl 核心流程测试（模拟）', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;

  beforeEach(() => {
    mockProvider = createMockProvider();
  });

  it('should simulate user interaction flow', async () => {
    mockProvider.setTextResponses([
      'First response',
      'Second response after tool call'
    ]);

    const response1 = await mockProvider.sendMessage([]);
    expect(response1.text).toBe('First response');

    const response2 = await mockProvider.sendMessage([]);
    expect(response2.text).toBe('Second response after tool call');
  });

  it('should handle tool call simulation', async () => {
    const toolCall = {
      id: 'call_1',
      name: 'BashTool',
      input: { command: 'ls' }
    };

    mockProvider
      .setToolCallQueues([[toolCall]])
      .setTextResponses(['', 'Tool call completed']);

    const result1 = await mockProvider.sendMessage([]);
    expect(result1.toolCalls.length).toBe(1);
    expect(result1.toolCalls[0].name).toBe('BashTool');

    const result2 = await mockProvider.sendMessage([]);
    expect(result2.text).toBe('Tool call completed');
  });
});

describe('CLI 命令测试', () => {
  it('should handle /help command parsing', () => {
    const registry = new CommandRegistry();
    const parsed = registry.parse('/help');
    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe('help');
    expect(parsed?.args).toEqual([]);
  });

  it('should handle /clear command parsing', () => {
    const registry = new CommandRegistry();
    const parsed = registry.parse('/clear');
    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe('clear');
  });

  it('should handle /model command with model name', () => {
    const registry = new CommandRegistry();
    const parsed = registry.parse('/model claude-3-5-sonnet');
    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe('model');
    expect(parsed?.args).toEqual(['claude-3-5-sonnet']);
  });

  it('should handle /exit command', () => {
    const registry = new CommandRegistry();
    const parsed = registry.parse('/exit');
    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe('exit');
  });
});
