import type { Message, Tool } from '../../types/index.js';
import type { AIProvider, ToolCall, StreamCallbacks } from './types.js';

/**
 * OpenAI 兼容 API 客户端
 *
 * 用于支持任何兼容 OpenAI ChatCompletions API 的服务：
 * - OpenAI 官方 API
 * - Azure OpenAI
 * - 本地模型（如 LM Studio、Ollama）
 * - 其他兼容 API（如 Groq、Perplexity 等）
 */
export class OpenAICompatClient implements AIProvider {
  /** 提供商名称 */
  name: string;

  /** API 密钥 */
  private apiKey: string;

  /** API 基础 URL */
  private baseUrl: string;

  /** 模型名称 */
  private model: string;

  /**
   * 构造函数
   *
   * @param name - 提供商名称（用于显示）
   * @param apiKey - API 密钥
   * @param baseUrl - API 基础 URL
   * @param model - 模型名称
   */
  constructor({
    name,
    apiKey,
    baseUrl,
    model,
  }: {
    name: string;
    apiKey: string;
    baseUrl: string;
    model: string;
  }) {
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');  // 移除末尾斜杠
    this.model = model;
  }

  /**
   * 发送消息给 AI
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
    const url = `${this.baseUrl}/chat/completions`;

    // 构建系统提示
    const systemPromptWithDate = this.buildSystemPrompt();

    // 准备请求消息
    const requestMessages = [
      { role: 'system' as const, content: systemPromptWithDate },
      ...messages.map((msg) => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : this.contentToString(msg.content),
      })),
    ];

    // 构建请求体
    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages: requestMessages,
      stream: true,  // 启用流式输出
    };

    // 如果有工具，添加工具列表
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

    // 发送请求
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
      const error = new Error(`${this.name} API error: ${response.status} - ${errorText}`);
      callbacks?.onError?.(error);
      throw error;
    }

    // 解析 SSE 流
    const { text, toolCalls } = await this.parseSSEStream(response, callbacks);
    return { text, toolCalls };
  }

  /**
   * 解析 SSE 流式响应
   *
   * @param response - fetch 响应对象
   * @param callbacks - 流式回调
   */
  private async parseSSEStream(
    response: Response,
    callbacks?: StreamCallbacks
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    // 存储正在构建的工具调用
    const toolCallsMap = new Map<string, { id: string; name: string; arguments: string }>();
    let currentToolCallId: string | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 解码数据块
        buffer += decoder.decode(value, { stream: true });

        // 按行分割
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();

          if (data === '[DONE]') continue;

          try {
            const chunk = JSON.parse(data) as {
              choices: Array<{
                delta: {
                  content?: string;
                  tool_calls?: Array<{
                    index?: number;
                    id?: string;
                    type?: string;
                    function?: {
                      name?: string;
                      arguments?: string;
                    };
                  }>;
                };
              }>;
            };

            const delta = chunk.choices[0]?.delta;

            // 处理工具调用增量
            if (delta?.tool_calls && delta.tool_calls.length > 0) {
              for (const toolCallDelta of delta.tool_calls) {
                const func = toolCallDelta?.function;
                const id = toolCallDelta?.id;
                if (id && func?.name && !toolCallsMap.has(id)) {
                  // 新工具调用开始
                  toolCallsMap.set(id, {
                    id: id,
                    name: func.name || '',
                    arguments: func.arguments || '',
                  });
                  currentToolCallId = id;
                } else if (currentToolCallId && toolCallsMap.has(currentToolCallId) && func?.arguments) {
                  // 追加参数片段
                  const existing = toolCallsMap.get(currentToolCallId)!;
                  existing.arguments += func.arguments;
                }
              }
            }

            // 处理文本内容
            if (delta?.content) {
              fullText += delta.content;
              callbacks?.onChunk?.(delta.content);
            }
          } catch {
            // 忽略无法解析的行
          }
        }
      }
    } catch (error) {
      callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }

    // 构建最终的工具调用列表
    const toolCalls: ToolCall[] = [];
    for (const [id, tc] of toolCallsMap) {
      let args: Record<string, unknown> = {};
      try {
        if (tc.arguments) {
          args = JSON.parse(tc.arguments);
        }
      } catch {
        args = { _raw: tc.arguments };
      }
      toolCalls.push({
        id,
        name: tc.name || '',
        input: args,
      });
    }

    callbacks?.onComplete?.(fullText);
    return { text: fullText, toolCalls };
  }

  /**
   * 构建系统提示
   *
   * 包含日期时间和工具使用规则
   */
  private buildSystemPrompt(): string {
    const now = new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    return [
      `当前时间：${dateStr} ${timeStr}（${tz}）。注意：现在是2026年，请使用这个日期回答问题。`,
      '',
      '你拥有实时联网能力，可以获取最新信息。当用户询问新闻、时事、最新动态等需要时效性信息的问题时，请基于你获取到的最新信息直接回答，不要声称自己无法联网。',
      '',
      '## 工具使用规则',
      '- BashTool: 仅用于本地命令行操作（如 ls、git、npm 等），禁止用于网络请求',
      '- WebSearchTool: 用于网络搜索，获取最新资讯',
      '- FileReadTool/FileWriteTool/EditTool: 仅用于本地文件操作',
      '- GitHub*Tools: 仅在用户明确要求查询 GitHub 仓库/Issue/PR 时使用',
      '- 禁止使用 BashTool 执行 curl/wget 等网络请求',
      '- 禁止调用与用户问题无关的工具',
    ].join('\n');
  }

  /**
   * 将内容块数组转换为字符串
   */
  private contentToString(content: unknown[]): string {
    return content
      .map((block) => {
        if (typeof block === 'object' && block !== null) {
          const b = block as Record<string, unknown>;
          if (b.type === 'text' && typeof b.text === 'string') return b.text;
          if (b.type === 'tool_result' && typeof b.content === 'string') return `[Tool Result: ${b.content}]`;
        }
        return String(block);
      })
      .join('');
  }
}
