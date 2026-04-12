import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryEngine, type QueryResult } from '../../core/QueryEngine.js';
import { MockAIProvider, createMockProvider } from '../mocks/MockAIProvider.js';
import type { Message, Tool } from '../../types/index.js';
import type { ToolCall } from '../../services/api/types.js';

describe('QueryEngine', () => {
  let mockProvider: MockAIProvider;
  let queryEngine: QueryEngine;
  let mockTools: Tool[];

  beforeEach(() => {
    mockProvider = createMockProvider();
    queryEngine = new QueryEngine(mockProvider);
    mockTools = [];
  });

  describe('基础功能', () => {
    it('should be instantiated with an AI provider', () => {
      expect(queryEngine).toBeDefined();
    });

    it('should return provider name', () => {
      expect(mockProvider.name).toBe('MockAI');
    });
  });

  describe('query - 基础查询（无工具调用）', () => {
    it('should return text response when no tool calls', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];

      mockProvider.setTextResponses(['Hello! How can I help you?']);

      const callbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      const result = await queryEngine.query(messages, mockTools, callbacks);

      expect(result.response).toBe('Hello! How can I help you?');
      expect(result.messages).toEqual(messages);
      expect(result.toolCallsExecuted).toBe(0);
    });

    it('should call onComplete callback with full text', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];

      mockProvider.setTextResponses(['Response text']);

      const callbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      await queryEngine.query(messages, mockTools, callbacks);

      expect(callbacks.onComplete).toHaveBeenCalledWith('Response text');
    });

    it('should handle multiple sequential queries', async () => {
      const messages1: Message[] = [{ role: 'user', content: 'Hello' }];
      const messages2: Message[] = [{ role: 'user', content: 'How are you?' }];

      mockProvider.setTextResponses(['Response 1', 'Response 2']);

      const callbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      const result1 = await queryEngine.query(messages1, mockTools, callbacks);
      expect(result1.response).toBe('Response 1');

      const result2 = await queryEngine.query(messages2, mockTools, callbacks);
      expect(result2.response).toBe('Response 2');
    });
  });

  describe('query - 空响应处理', () => {
    it('should handle empty text response (no tool calls)', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];

      mockProvider.setTextResponses(['']);

      const callbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      const result = await queryEngine.query(messages, mockTools, callbacks);

      expect(result.response).toBe('Maximum rounds reached');
      expect(result.toolCallsExecuted).toBe(0);
    });

    it('should handle two consecutive empty responses and stop', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];

      mockProvider.setTextResponses(['', '']);

      const callbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      const result = await queryEngine.query(messages, mockTools, callbacks);

      expect(result.response).toBe('Maximum rounds reached');
    });
  });

  describe('query - 错误处理', () => {
    it('should propagate provider errors', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];

      mockProvider.setError(true, 'Network error');

      const callbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      await expect(
        queryEngine.query(messages, mockTools, callbacks)
      ).rejects.toThrow('Network error');
    });
  });

  describe('query - 边界条件', () => {
    it('should handle empty messages array', async () => {
      const messages: Message[] = [];

      mockProvider.setTextResponses(['Response']);

      const callbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      const result = await queryEngine.query(messages, mockTools, callbacks);

      expect(result.response).toBe('Response');
    });

    it('should handle empty tools array', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];

      mockProvider.setTextResponses(['Response without tools']);

      const callbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      const result = await queryEngine.query(messages, [], callbacks);

      expect(result.response).toBe('Response without tools');
    });
  });

  describe('MockAIProvider - 详细行为', () => {
    it('should track call count correctly', async () => {
      mockProvider.setTextResponses(['Response 1', 'Response 2', 'Response 3']);

      await mockProvider.sendMessage([]);
      await mockProvider.sendMessage([]);
      await mockProvider.sendMessage([]);

      expect(mockProvider.getCallCount()).toBe(3);
    });

    it('should record call history', async () => {
      const messages1: Message[] = [{ role: 'user', content: 'First' }];
      const messages2: Message[] = [{ role: 'user', content: 'Second' }];

      mockProvider.setTextResponses(['Response 1', 'Response 2']);

      await mockProvider.sendMessage(messages1);
      await mockProvider.sendMessage(messages2);

      const history = mockProvider.getCallHistory();
      expect(history.length).toBe(2);
      expect(history[0].messages[0].content).toBe('First');
      expect(history[1].messages[0].content).toBe('Second');
    });

    it('should cycle through text responses when exceeding array length', async () => {
      mockProvider.setTextResponses(['Only One']);

      const result1 = await mockProvider.sendMessage([]);
      const result2 = await mockProvider.sendMessage([]);
      const result3 = await mockProvider.sendMessage([]);

      expect(result1.text).toBe('Only One');
      expect(result2.text).toBe('Only One');
      expect(result3.text).toBe('Only One');
    });

    it('should reset state correctly', async () => {
      mockProvider.setTextResponses(['Response 1', 'Response 2']);
      await mockProvider.sendMessage([]);
      await mockProvider.sendMessage([]);

      mockProvider.reset();

      expect(mockProvider.getCallCount()).toBe(0);
      expect(mockProvider.getCallHistory()).toEqual([]);
      expect(mockProvider.getCallCount()).toBe(0);
    });

    it('should respect delay setting', async () => {
      mockProvider.setDelay(20);

      const start = Date.now();
      await mockProvider.sendMessage([]);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(15);
    });
  });

  describe('MockAIProvider - 工具调用模拟', () => {
    it('should return empty toolCalls by default', async () => {
      const result = await mockProvider.sendMessage([]);
      expect(result.toolCalls).toEqual([]);
    });

    it('should return tool calls from queue', async () => {
      const toolCalls: ToolCall[] = [
        { id: 'call_1', name: 'TestTool', input: { arg: 'value' } }
      ];

      mockProvider.setToolCallQueues([toolCalls]);

      const result = await mockProvider.sendMessage([]);

      expect(result.toolCalls.length).toBe(1);
      expect(result.toolCalls[0].id).toBe('call_1');
      expect(result.toolCalls[0].name).toBe('TestTool');
    });

    it('should return different tool calls in sequence', async () => {
      const toolCalls1: ToolCall[] = [
        { id: 'call_1', name: 'ToolA', input: {} }
      ];
      const toolCalls2: ToolCall[] = [
        { id: 'call_2', name: 'ToolB', input: {} }
      ];

      mockProvider.setToolCallQueues([toolCalls1, toolCalls2]);

      const result1 = await mockProvider.sendMessage([]);
      const result2 = await mockProvider.sendMessage([]);

      expect(result1.toolCalls[0].name).toBe('ToolA');
      expect(result2.toolCalls[0].name).toBe('ToolB');
    });
  });
});

describe('QueryResult 类型验证', () => {
  it('should have correct structure', () => {
    const result: QueryResult = {
      response: 'test response',
      messages: [{ role: 'user', content: 'test' }],
      toolCallsExecuted: 5
    };

    expect(result).toHaveProperty('response');
    expect(result).toHaveProperty('messages');
    expect(result).toHaveProperty('toolCallsExecuted');
    expect(typeof result.response).toBe('string');
    expect(typeof result.toolCallsExecuted).toBe('number');
  });
});
