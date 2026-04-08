import Anthropic from '@anthropic-ai/sdk';
import type { Message, Tool } from '../../types/index.js';
import type { AIProvider, ToolCall } from './types.js';

export class AnthropicClient implements AIProvider {
  name = 'Anthropic';
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

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

  async sendMessage(
    messages: Message[],
    tools: Tool[] = []
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    const anthropicMessages = messages.map((msg) => ({
      role: msg.role,
      content: typeof msg.content === 'string'
        ? msg.content
        : this.contentBlocksToString(msg.content),
    }));

    const anthropicTools = tools.length > 0 ? tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
    })) : undefined;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: anthropicMessages,
      tools: anthropicTools as Anthropic.ToolUnion[] | undefined,
    });

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

    return {
      text: textParts.join(''),
      toolCalls,
    };
  }

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
