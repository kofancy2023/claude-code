import type { ProviderName, ProviderConfig } from './provider-config.js';
import { PROVIDER_ENDPOINTS } from './provider-config.js';
import type { AIProvider } from './types.js';
import { AnthropicClient } from './AnthropicClient.js';
import { OpenAICompatClient } from './OpenAICompatClient.js';
import { GeminiClient } from './GeminiClient.js';
import { ResilientClient } from './ResilientClient.js';

/**
 * 创建 AI 提供商客户端
 *
 * 根据配置创建对应的 AI 客户端实例
 * 自动包装 ResilientClient 提供重试和熔断器保护
 * 支持的提供商：Anthropic、OpenAI 兼容、GLM、Gemini 等
 *
 * @param config - 提供商配置
 * @returns AI 客户端实例（带弹性功能）
 */
export function createProvider(config: ProviderConfig): AIProvider {
  const { provider, apiKey, baseUrl, model } = config;

  let client: AIProvider;

  switch (provider) {
    case 'anthropic':
      client = new AnthropicClient({
        apiKey,
        model: model || PROVIDER_ENDPOINTS.anthropic.recommendedModel,
      });
      break;

    case 'glm':
    case 'kimi':
    case 'minimax':
    case 'siliconflow':
    case 'deepseek':
    case 'qwen':
    case 'openai':
    case 'moonshot':
      client = new OpenAICompatClient({
        name: provider,
        apiKey,
        baseUrl: baseUrl || PROVIDER_ENDPOINTS[provider].baseUrl,
        model: model || PROVIDER_ENDPOINTS[provider].recommendedModel,
      });
      break;

    case 'gemini':
      client = new GeminiClient({
        apiKey,
        model: model || PROVIDER_ENDPOINTS.gemini.recommendedModel,
      });
      break;

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  return new ResilientClient(client, provider);
}

/**
 * 获取提供商信息
 *
 * @param provider - 提供商名称
 * @returns 提供商信息（名称、基础 URL、默认模型）
 */
export function getProviderInfo(provider: ProviderName): { name: string; baseUrl: string; defaultModel: string } {
  const info = PROVIDER_ENDPOINTS[provider];
  return {
    name: provider.charAt(0).toUpperCase() + provider.slice(1),
    baseUrl: info.baseUrl,
    defaultModel: info.defaultModel,
  };
}

/**
 * 获取所有支持的提供商列表
 *
 * @returns 提供商名称数组
 */
export function getAllProviders(): ProviderName[] {
  return Object.keys(PROVIDER_ENDPOINTS) as ProviderName[];
}

/**
 * 检查提供商是否支持
 *
 * @param provider - 提供商名称
 * @returns 是否支持
 */
export function isProviderSupported(provider: string): provider is ProviderName {
  return provider in PROVIDER_ENDPOINTS;
}
