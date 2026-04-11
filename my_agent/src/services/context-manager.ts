import type { Message } from '../types/index.js';
import { KNOWN_MODELS } from '../services/api/provider-config.js';

/**
 * 摘要选项接口
 * 用于配置消息截断和摘要策略
 */
export interface SummarizationOptions {
  /** 目标最大 token 数 */
  maxTokens: number;
  /** 目标模型（用于获取正确的上下文窗口） */
  targetModel?: string;
  /** 是否保留系统消息（默认 true） */
  preserveSystemMessage?: boolean;
  /** 保留最后 N 条消息（默认 2） */
  preserveLastMessages?: number;
}

/**
 * 带 token 计数的消息结构
 */
export interface MessageWithTokens {
  /** 消息对象 */
  message: Message;
  /** 估算的 token 数 */
  tokens: number;
}

/**
 * 上下文管理器
 *
 * 核心职责：
 * - 管理对话上下文，防止超出模型限制
 * - 自动截断过长对话
 * - 生成对话摘要以保留关键信息
 *
 * 工作流程：
 * 1. 计算当前消息总 token 数
 * 2. 与模型上下文窗口对比
 * 3. 如超过限制，截断并摘要中间部分
 * 4. 保留系统消息和最近消息
 */
export class ContextManager {
  /**
   * 估算文本的 token 数量
   *
   * 简单估算方法：中文字符约 1 token / 4 字符
   * 实际 tokenization 会更复杂，但这种估算足够用于上下文管理
   *
   * @param text - 输入文本
   * @returns 估算的 token 数
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * 估算单条消息的 token 数
   *
   * 消息 token 组成：
   * - 内容本身（文本或工具结果）
   * - role 标记（约 4 tokens）
   *
   * @param message - 消息对象
   * @returns 估算的 token 数
   */
  estimateMessageTokens(message: Message): number {
    // 处理不同格式的内容
    const content = typeof message.content === 'string'
      ? message.content
      : message.content.map((block) => {
          // 文本内容
          if (block.type === 'text') return block.text;
          // 工具执行结果
          if (block.type === 'tool_result') return `[Tool: ${block.content}]`;
          return '';
        }).join('\n');

    // 内容 token + role 标记
    const baseTokens = this.estimateTokens(content);
    const roleTokens = 4;
    return baseTokens + roleTokens;
  }

  /**
   * 计算消息列表的总 token 数
   *
   * @param messages - 消息数组
   * @returns 总 token 数
   */
  calculateTotalTokens(messages: Message[]): number {
    return messages.reduce((sum, msg) => sum + this.estimateMessageTokens(msg), 0);
  }

  /**
   * 获取模型的上下文窗口大小
   *
   * 如果模型在已知列表中，返回配置的上下文窗口
   * 否则返回默认值 128K
   *
   * @param model - 模型名称（如 'kimi-k2.5'）
   * @returns 上下文窗口大小（tokens）
   */
  getModelContextWindow(model?: string): number {
    if (model && KNOWN_MODELS[model]) {
      return KNOWN_MODELS[model].contextWindow;
    }
    // 默认 128K
    return 128000;
  }

  /**
   * 检查是否需要进行上下文截断
   *
   * 当消息总 token 数超过（上下文窗口 - 预留空间）时返回 true
   *
   * @param messages - 消息列表
   * @param model - 模型名称
   * @param reservedTokens - 预留 token 数（默认 1000），用于保留给响应生成
   * @returns 是否需要截断
   */
  needsTruncation(
    messages: Message[],
    model?: string,
    reservedTokens: number = 1000
  ): boolean {
    const contextWindow = this.getModelContextWindow(model);
    // 最大可用 tokens = 上下文窗口 - 预留空间
    const maxTokens = contextWindow - reservedTokens;
    const currentTokens = this.calculateTotalTokens(messages);
    return currentTokens > maxTokens;
  }

  /**
   * 截断消息列表
   *
   * 截断策略：
   * 1. 保留系统消息（如果启用）
   * 2. 保留最后 N 条消息
   * 3. 中间消息合并为摘要
   *
   * 如果摘要后仍超出限制，进一步截断保留的消息尾部
   *
   * @param messages - 原始消息列表
   * @param options - 截断选项
   * @returns 截断后的消息列表
   */
  truncateMessages(
    messages: Message[],
    options: SummarizationOptions
  ): Message[] {
    const {
      maxTokens,
      preserveSystemMessage = true,
      preserveLastMessages = 2,
    } = options;

    // 消息太少，无需截断
    if (messages.length <= preserveLastMessages) {
      return messages;
    }

    // 分离系统消息和普通消息
    const systemMessages: Message[] = [];
    const regularMessages: Message[] = [];

    for (const msg of messages) {
      if (msg.role === 'system' && preserveSystemMessage) {
        systemMessages.push(msg);
      } else {
        regularMessages.push(msg);
      }
    }

    // 保留消息的头尾
    const preservedTail = regularMessages.slice(-preserveLastMessages);  // 最后 N 条
    const middleMessages = regularMessages.slice(0, -preserveLastMessages);  // 中间部分

    // 计算已保留消息的 token 数
    let totalTokens = preservedTail.reduce(
      (sum, msg) => sum + this.estimateMessageTokens(msg),
      0
    );
    totalTokens += systemMessages.reduce(
      (sum, msg) => sum + this.estimateMessageTokens(msg),
      0
    );

    // 收集可以保留的中间消息（不超过 maxTokens）
    const messagesToSummarize: Message[] = [];
    for (const msg of middleMessages) {
      const msgTokens = this.estimateMessageTokens(msg);
      if (totalTokens + msgTokens <= maxTokens) {
        messagesToSummarize.push(msg);
        totalTokens += msgTokens;
      } else {
        break;  // 超出限制，停止添加
      }
    }

    // 对中间消息进行摘要
    const summarized = this.summarizeMessages(messagesToSummarize);
    const summaryTokens = this.estimateMessageTokens(summarized);

    // 如果摘要确实节省了空间，使用摘要
    if (summaryTokens < this.calculateTotalTokens(messagesToSummarize)) {
      return [...systemMessages, summarized, ...preservedTail];
    }

    // 摘要效果不佳，进一步截断保留的消息
    const availableTokens = maxTokens - summaryTokens - this.calculateTotalTokens(preservedTail);
    const truncatedPreservedTail = this.truncateTail(preservedTail, availableTokens);

    return [...systemMessages, summarized, ...truncatedPreservedTail];
  }

  /**
   * 截断消息尾部以适应 token 限制
   *
   * 从前往后遍历，直到达到 token 限制
   *
   * @param messages - 消息数组
   * @param maxTokens - 最大 token 数
   * @returns 截断后的消息
   */
  private truncateTail(messages: Message[], maxTokens: number): Message[] {
    const result: Message[] = [];
    let totalTokens = 0;

    for (const msg of messages) {
      const msgTokens = this.estimateMessageTokens(msg);
      if (totalTokens + msgTokens <= maxTokens) {
        result.push(msg);
        totalTokens += msgTokens;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * 生成消息列表的摘要
   *
   * 摘要包含：
   * - 消息总数和估算 token 数
   * - 用户/助手/工具调用统计
   * - 最近 10 条消息的预览
   * - 标注"对话已被摘要"
   *
   * @param messages - 要摘要的消息列表
   * @returns 摘要消息（role 为 system）
   */
  summarizeMessages(messages: Message[]): Message {
    if (messages.length === 0) {
      return {
        role: 'system',
        content: '[Previous conversation summary: No previous messages]',
      };
    }

    const summaryParts: string[] = [];
    let toolCallCount = 0;
    let userMessageCount = 0;
    let assistantMessageCount = 0;
    let totalTokens = 0;

    // 遍历消息，收集统计信息和摘要
    for (const msg of messages) {
      // 提取消息内容
      const content = typeof msg.content === 'string'
        ? msg.content
        : msg.content.map((b) => b.type === 'text' ? b.text : `[${b.type}]`).join(' ');

      // 截断到 200 字符
      const truncated = content.slice(0, 200);

      // 分类统计
      if (msg.role === 'user') {
        userMessageCount++;
        summaryParts.push(`User: ${truncated}`);
      } else if (msg.role === 'assistant') {
        assistantMessageCount++;
        if (truncated) {
          summaryParts.push(`Assistant: ${truncated}`);
        }
      }

      totalTokens += this.estimateMessageTokens(msg);

      // 工具调用计数
      if (msg.role === 'assistant') {
        toolCallCount++;
      }
    }

    // 构建摘要文本
    const summary = [
      `[Conversation Summary: ${messages.length} messages, ~${totalTokens} tokens]`,
      `User messages: ${userMessageCount}, Assistant responses: ${assistantMessageCount}, Tool calls: ${toolCallCount}`,
      '',
      ...summaryParts.slice(-10),  // 只保留最近 10 条
      '',
      '(Full conversation has been summarized for context)',
    ].join('\n');

    return {
      role: 'system',
      content: summary,
    };
  }

  /**
   * 获取上下文使用状态
   *
   * 用于调试和监控
   *
   * @param messages - 消息列表
   * @param model - 模型名称
   * @returns 状态信息对象
   */
  getContextStatus(
    messages: Message[],
    model?: string
  ): {
    /** 当前使用的 token 数 */
    currentTokens: number;
    /** 最大可用 token 数 */
    maxTokens: number;
    /** 使用率百分比 */
    utilizationPercent: number;
    /** 是否需要截断 */
    needsTruncation: boolean;
  } {
    const maxTokens = this.getModelContextWindow(model) - 1000;
    const currentTokens = this.calculateTotalTokens(messages);

    return {
      currentTokens,
      maxTokens,
      utilizationPercent: Math.round((currentTokens / maxTokens) * 100),
      needsTruncation: currentTokens > maxTokens,
    };
  }
}

/**
 * 上下文管理器单例
 */
export const contextManager = new ContextManager();
