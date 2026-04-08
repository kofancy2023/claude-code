import type { Message, Tool } from '../../types/index.js';
import type { AIProvider, ToolCall } from './types.js';

export class GLMClient implements AIProvider {
  name = 'GLM';
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor({
    apiKey,
    baseUrl = 'https://open.bigmodel.cn/api/paas/v4',
    model = 'glm-5.1',
  }: {
    apiKey: string;
    baseUrl?: string;
    model?: string;
  }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async sendMessage(
    messages: Message[],
    tools: Tool[] = []
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    const url = `${this.baseUrl}/chat/completions`;

    const requestMessages = messages.map((msg) => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : this.contentToString(msg.content),
    }));

    // GLM 的 alltools 模型要求使用流式调用，否则报错 1212
    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages: requestMessages,
      stream: true,
    };

    if (tools.length > 0) {
      requestBody.tools = tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GLM API error: ${response.status} - ${errorText}`);
    }

    // 解析 SSE 流式响应，逐步拼接文本和工具调用
    const text = await this.parseSSEStream(response);
    return { text, toolCalls: [] };
  }

  /**
   * 解析 SSE（Server-Sent Events）流式响应
   * GLM 返回的流式格式为 data: {...}\n\n，每个 chunk 包含一个 delta
   */
  private async parseSSEStream(response: Response): Promise<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按 \n\n 分割 SSE 事件
      const lines = buffer.split('\n');
      buffer = lines.pop()!; // 保留最后一个可能不完整的行

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();

        // 流结束标记
        if (data === '[DONE]') continue;

        try {
          const chunk = JSON.parse(data) as {
            choices: Array<{
              delta: { content?: string };
            }>;
          };
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            fullText += content;
          }
        } catch {
          // 忽略无法解析的行
        }
      }
    }

    return fullText;
  }

  private contentToString(content: unknown[]): string {
    return content
      .map((block) => {
        if (typeof block === 'object' && block !== null) {
          const b = block as Record<string, unknown>;
          if (b.type === 'text' && typeof b.text === 'string') return b.text;
          if (b.type === 'tool_result' && typeof b.content === 'string') return `[Tool Result: ${b.content}]`;
          if (b.type === 'tool_use' && typeof b.name === 'string') return `[Tool Call: ${b.name}]`;
        }
        return String(block);
      })
      .join('');
  }
}
