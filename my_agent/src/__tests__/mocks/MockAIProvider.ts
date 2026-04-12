import type { AIProvider, StreamCallbacks, ToolCall } from '../../services/api/types.js';
import type { Message, Tool } from '../../types/index.js';

/**
 * Mock AI 提供者 - 用于测试
 *
 * 模拟 AI 提供者的行为，支持：
 * - 预设固定响应
 * - 预设工具调用
 * - 可配置的延迟
 * - 模拟错误
 *
 * 使用场景：
 * - 单元测试：无需真实 API 即可测试业务逻辑
 * - 集成测试：模拟特定场景
 * - TDD 开发：先写测试再实现
 */
export class MockAIProvider implements AIProvider {
  /** 提供者名称 */
  name = 'MockAI';

  /** 预设的文本响应队列 */
  private textResponses: string[] = [];

  /** 预设的工具调用队列 */
  private toolCallQueues: ToolCall[][] = [];

  /** 模拟延迟（毫秒） */
  private delayMs: number = 0;

  /** 是否模拟错误 */
  private shouldError: boolean = false;

  /** 错误消息 */
  private errorMessage: string = 'Mock error';

  /** 调用计数 */
  private callCount: number = 0;

  /** 记录每次调用的参数 */
  private callHistory: Array<{
    messages: Message[];
    tools?: Tool[];
    callbacks?: StreamCallbacks;
  }> = [];

  /**
   * 设置预设的文本响应
   * 每次调用 sendMessage 会按顺序返回预设响应
   */
  setTextResponses(responses: string[]): this {
    this.textResponses = [...responses];
    return this;
  }

  /**
   * 设置预设的工具调用
   * 每次调用 sendMessage 会按顺序返回预设工具调用
   */
  setToolCallQueues(queues: ToolCall[][]): this {
    this.toolCallQueues = [...queues];
    return this;
  }

  /**
   * 设置模拟延迟
   */
  setDelay(ms: number): this {
    this.delayMs = ms;
    return this;
  }

  /**
   * 设置是否模拟错误
   */
  setError(enabled: boolean, message?: string): this {
    this.shouldError = enabled;
    if (message) this.errorMessage = message;
    return this;
  }

  /**
   * 获取调用次数
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * 获取调用历史
   */
  getCallHistory(): Array<{
    messages: Message[];
    tools?: Tool[];
    callbacks?: StreamCallbacks;
  }> {
    return [...this.callHistory];
  }

  /**
   * 重置所有状态
   */
  reset(): void {
    this.textResponses = [];
    this.toolCallQueues = [];
    this.delayMs = 0;
    this.shouldError = false;
    this.errorMessage = 'Mock error';
    this.callCount = 0;
    this.callHistory = [];
  }

  /**
   * 发送消息并获取 AI 响应
   *
   * 实现 AIProvider 接口
   * 按顺序返回预设的响应和工具调用
   */
  async sendMessage(
    messages: Message[],
    tools?: Tool[],
    callbacks?: StreamCallbacks
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    // 记录调用
    this.callCount++;
    this.callHistory.push({ messages, tools, callbacks });

    // 模拟延迟
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    // 模拟错误
    if (this.shouldError) {
      throw new Error(this.errorMessage);
    }

    // 获取预设响应
    const textIndex = Math.min(this.callCount - 1, this.textResponses.length - 1);
    const toolIndex = Math.min(this.callCount - 1, this.toolCallQueues.length - 1);

    const text = this.textResponses[textIndex] ?? '';
    const toolCalls = this.toolCallQueues[toolIndex] ?? [];

    // 如果有回调，执行流式输出
    if (callbacks?.onChunk && text) {
      // 模拟逐字输出
      for (const char of text) {
        callbacks.onChunk(char);
        // 小延迟模拟打字效果
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }

    callbacks?.onComplete?.(text);

    return { text, toolCalls };
  }
}

/**
 * 创建一个预配置的 Mock 提供者
 * 适合快速测试场景
 */
export function createMockProvider(): MockAIProvider {
  return new MockAIProvider();
}

/**
 * 创建一个总是返回简单文本的 Mock 提供者
 */
export function createSimpleTextProvider(text: string): MockAIProvider {
  return new MockAIProvider().setTextResponses([text]);
}

/**
 * 创建一个模拟工具调用的 Mock 提供者
 * 第一轮返回工具调用，第二轮返回最终文本
 */
export function createToolCallProvider(
  toolCall: ToolCall,
  finalText: string
): MockAIProvider {
  return new MockAIProvider()
    .setToolCallQueues([[toolCall]])
    .setTextResponses(['', finalText]);
}
