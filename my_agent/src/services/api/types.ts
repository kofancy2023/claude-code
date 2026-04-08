import type { Message, Tool } from '../../types/index.js';

export type Provider = 'anthropic' | 'glm';

export interface AIProvider {
  name: string;
  sendMessage(
    messages: Message[],
    tools?: Tool[]
  ): Promise<{ text: string; toolCalls: ToolCall[] }>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}
