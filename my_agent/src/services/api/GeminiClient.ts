import type { Message, Tool, ToolInputSchema } from '../../types/index.js';
import type { AIProvider, ToolCall, StreamCallbacks } from './types.js';
import { PROVIDER_ENDPOINTS } from './provider-config.js';

export class GeminiClient implements AIProvider {
  name = 'Gemini';
  private apiKey: string;
  private model: string;

  constructor({
    apiKey,
    model = 'gemini-1.5-flash',
  }: {
    apiKey: string;
    model?: string;
  }) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async sendMessage(
    messages: Message[],
    tools: Tool[] = [],
    callbacks?: StreamCallbacks
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    const contents = this.convertMessagesToContents(messages);

    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
      },
    };

    if (tools.length > 0) {
      requestBody.tools = {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: this.convertSchema(tool.inputSchema),
        })),
      };
    }

    const baseUrl = PROVIDER_ENDPOINTS.gemini.baseUrl;
    const url = `${baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(`Gemini API error: ${response.status} - ${errorText}`);
      callbacks?.onError?.(error);
      throw error;
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            functionCall?: {
              name: string;
              args: Record<string, unknown>;
            };
          }>;
        };
      }>;
      promptFeedback?: {
        blockReason?: string;
      };
    };

    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    const candidate = data.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          textParts.push(part.text);
          callbacks?.onChunk?.(part.text);
        } else if (part.functionCall) {
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: part.functionCall.name,
            input: part.functionCall.args,
          });
        }
      }
    }

    callbacks?.onComplete?.(textParts.join(''));
    return { text: textParts.join(''), toolCalls };
  }

  private convertMessagesToContents(messages: Message[]): Array<{ role: string; parts: Array<{ text?: string }> }> {
    const contents: Array<{ role: string; parts: Array<{ text?: string }> }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      const content = typeof msg.content === 'string' ? msg.content : this.contentToString(msg.content);

      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: content }],
      });
    }

    return contents;
  }

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

  private convertSchema(schema: ToolInputSchema): Record<string, unknown> {
    if (schema.type === 'object' && schema.properties) {
      return {
        type: 'object',
        properties: schema.properties,
        required: schema.required,
      };
    }
    return schema as unknown as Record<string, unknown>;
  }
}