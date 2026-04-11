import Anthropic from '@anthropic-ai/sdk';
import type { Message, Tool } from '../../types/index.js';
import type { AIProvider, ToolCall, StreamCallbacks } from './types.js';

/**
 * Anthropic AI 客户端
 *
 * 实现与 Anthropic API 的交互，支持：
 * - 普通消息发送
 * - 流式输出响应
 * - 工具调用
 */
export class AnthropicClient implements AIProvider {
  /** 提供商名称 */
  name = 'Anthropic';

  /** Anthropic SDK 客户端实例 */
  private client: Anthropic;

  /** 当前使用的模型名称 */
  private model: string;

  /** 单次响应最大 token 数 */
  private maxTokens: number;

  /**
   * 构造函数
   *
   * @param apiKey - Anthropic API 密钥
   * @param model - 模型名称，默认为 claude-3-5-haiku
   * @param maxTokens - 最大响应 token 数，默认为 1024
   */
  constructor({
    apiKey,
    model = 'claude-3-5-haiku-20241017',
    maxTokens = 1024,
  }: {
    apiKey: string;
    model?: string;
    maxTokens?: number;
  }) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  /**
   * 发送消息给 AI
   *
   * 支持普通模式和流式输出模式：
   * - 如果提供了 callbacks，则使用流式输出
   * - 否则等待完整响应
   *
   * @param messages - 对话历史
   * @param tools - 可用工具列表
   * @param callbacks - 流式回调（可选）
   */
  async sendMessage(
    messages: Message[],
    tools: Tool[] = [],
    callbacks?: StreamCallbacks
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    // 过滤掉系统消息（Anthropic API 不支持单独的 system 消息）
    // 并转换消息格式
    const anthropicMessages = messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'string'
          ? msg.content
          : this.contentBlocksToString(msg.content),
      }));

    // 转换工具格式为 Anthropic API 格式
    const anthropicTools = tools.length > 0 ? tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
    })) : undefined;

    // 根据是否提供回调决定使用流式还是普通模式
    if (callbacks) {
      return this.sendMessageStream(anthropicMessages, anthropicTools, callbacks);
    }

    // 普通模式：等待完整响应
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: anthropicMessages,
      tools: anthropicTools as Anthropic.ToolUnion[] | undefined,
    });

    // 解析响应内容
    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return { text: textParts.join(''), toolCalls };
  }

  /**
   * 流式发送消息
   *
   * 使用 Anthropic 的流式 API，实时返回响应内容
   *
   * @param messages - 对话历史
   * @param tools - 工具列表
   * @param callbacks - 流式回调
   */
  private async sendMessageStream(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    tools: Anthropic.Tool[] | undefined,
    callbacks: StreamCallbacks
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    // 当前正在构建的工具调用
    let currentToolCall: { id: string; name: string; input: Record<string, unknown> } | null = null;
    // 工具参数的缓冲区（流式传输时参数是分片发送的）
    let currentArgBuffer = '';

    // 创建流
    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: this.maxTokens,
      messages,
      tools,
    });

    try {
      // 遍历流事件
      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          // 内容块增量（可能是文本或工具参数）
          if (event.delta.type === 'text_delta') {
            // 文本增量
            const text = event.delta.text;
            textParts.push(text);
            callbacks.onChunk?.(text);
          } else if (event.delta.type === 'input_json_delta') {
            // 工具参数增量（JSON 片段）
            currentArgBuffer += event.delta.partial_json;
            if (currentToolCall) {
              try {
                currentToolCall.input = JSON.parse(currentArgBuffer);
              } catch {
                // 解析不完整，忽略
              }
            }
          }
        } else if (event.type === 'content_block_start') {
          // 内容块开始
          if (event.content_block.type === 'tool_use') {
            // 开始一个工具调用
            currentToolCall = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: {},
            };
            currentArgBuffer = '';
          }
        } else if (event.type === 'content_block_stop') {
          // 内容块结束
          if (currentToolCall) {
            toolCalls.push(currentToolCall);
            currentToolCall = null;
            currentArgBuffer = '';
          }
        }
      }

      // 获取最终消息
      await stream.finalMessage();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      callbacks.onError?.(err);
      throw error;
    }

    const text = textParts.join('');
    callbacks.onComplete?.(text);
    return { text, toolCalls };
  }

  /**
   * 将内容块数组转换为字符串
   *
   * 用于处理消息中可能包含的复杂内容块
   */
  private contentBlocksToString(blocks: unknown[]): string {
    return blocks
      .map((block) => {
        if (typeof block === 'object' && block !== null) {
          const b = block as { type?: string; text?: string; name?: string; content?: string };
          if (b.type === 'text' && b.text) return b.text;
          if (b.type === 'tool_use' && b.name) return `[Tool call: ${b.name}]`;
          if (b.type === 'tool_result' && b.content) return `[Tool result: ${b.content}]`;
        }
        return '';
      })
      .join('');
  }
}
