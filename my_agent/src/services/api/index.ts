import type { AIProvider, ProviderConfig } from './types.js';
import { AnthropicClient } from './AnthropicClient.js';
import { GLMClient } from './GLMClient.js';

export function createProvider(config: ProviderConfig): AIProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicClient({
        apiKey: config.apiKey,
        model: config.model,
      });

    case 'glm':
      return new GLMClient({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      });

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export { AnthropicClient } from './AnthropicClient.js';
export { GLMClient } from './GLMClient.js';
export type { AIProvider, ProviderConfig, ToolCall } from './types.js';
export type { Provider } from './types.js';
