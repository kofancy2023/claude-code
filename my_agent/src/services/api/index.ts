import type { AIProvider, ProviderConfig } from './types.js';
import { createProvider } from './provider-factory.js';

export function createAIProvider(config: ProviderConfig): AIProvider {
  return createProvider(config);
}

export { createProvider } from './provider-factory.js';

export { AnthropicClient } from './AnthropicClient.js';
export { OpenAICompatClient } from './OpenAICompatClient.js';
export { GeminiClient } from './GeminiClient.js';
export { ResilientClient } from './ResilientClient.js';

export type { AIProvider, ToolCall } from './types.js';
export type { ProviderConfig as AIProviderConfig } from './types.js';
export type { ProviderName, ModelInfo } from './provider-config.js';
export { PROVIDER_ENDPOINTS, KNOWN_MODELS } from './provider-config.js';