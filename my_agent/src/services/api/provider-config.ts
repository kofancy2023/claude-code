export type ProviderName =
  | 'anthropic'
  | 'openai'
  | 'glm'
  | 'kimi'
  | 'minimax'
  | 'siliconflow'
  | 'deepseek'
  | 'qwen'
  | 'gemini'
  | 'moonshot';

export interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
}

export interface ModelInfo {
  name: string;
  provider: ProviderName;
  contextWindow: number;
  supportsTools: boolean;
  supportsVision: boolean;
  streaming: boolean;
  description?: string;
}

export const KNOWN_MODELS: Record<string, ModelInfo> = {
  'claude-sonnet-4-20250514': {
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    contextWindow: 200000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Latest Claude model, best overall performance',
  },
  'claude-3-5-sonnet-20241022': {
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Previous generation, excellent performance',
  },
  'claude-3-5-haiku-20241017': {
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    contextWindow: 200000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Fast and efficient',
  },
  'glm-5.1': {
    name: 'GLM-5.1',
    provider: 'glm',
    contextWindow: 256000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Latest GLM model, best performance',
  },
  'glm-5': {
    name: 'GLM-5',
    provider: 'glm',
    contextWindow: 128000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Previous generation GLM',
  },
  'glm-4-plus': {
    name: 'GLM-4 Plus',
    provider: 'glm',
    contextWindow: 128000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
  },
  'glm-4': {
    name: 'GLM-4',
    provider: 'glm',
    contextWindow: 128000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
  },
  'kimi-k2.5': {
    name: 'Kimi K2.5',
    provider: 'kimi',
    contextWindow: 256000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Latest Kimi model with 256K context',
  },
  'moonshot-v1-128k': {
    name: 'Moonshot V1 128K',
    provider: 'kimi',
    contextWindow: 128000,
    supportsTools: true,
    supportsVision: false,
    streaming: true,
    description: 'Large context window',
  },
  'moonshot-v1-32k': {
    name: 'Moonshot V1 32K',
    provider: 'kimi',
    contextWindow: 32000,
    supportsTools: true,
    supportsVision: false,
    streaming: true,
  },
  'moonshot-v1-8k': {
    name: 'Moonshot V1 8K',
    provider: 'kimi',
    contextWindow: 8000,
    supportsTools: true,
    supportsVision: false,
    streaming: true,
    description: 'Fast and cost-effective',
  },
  'minimax-m2.7': {
    name: 'MiniMax M2.7',
    provider: 'minimax',
    contextWindow: 256000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Latest MiniMax model',
  },
  'abab6.5s-chat': {
    name: 'MiniMax ABAB6.5S',
    provider: 'minimax',
    contextWindow: 245000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Super speed model',
  },
  'abab6-chat': {
    name: 'MiniMax ABAB6',
    provider: 'minimax',
    contextWindow: 245000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
  },
  'deepseek-v3': {
    name: 'DeepSeek V3',
    provider: 'deepseek',
    contextWindow: 64000,
    supportsTools: true,
    supportsVision: false,
    streaming: true,
    description: 'Latest DeepSeek model',
  },
  'deepseek-chat': {
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    contextWindow: 64000,
    supportsTools: true,
    supportsVision: false,
    streaming: true,
  },
  'deepseek-coder': {
    name: 'DeepSeek Coder',
    provider: 'deepseek',
    contextWindow: 64000,
    supportsTools: true,
    supportsVision: false,
    streaming: true,
    description: 'Optimized for code generation',
  },
  'qwen-max': {
    name: 'Qwen Max',
    provider: 'qwen',
    contextWindow: 131072,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Best quality Qwen model',
  },
  'qwen-plus': {
    name: 'Qwen Plus',
    provider: 'qwen',
    contextWindow: 131072,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Balanced performance',
  },
  'qwen-turbo': {
    name: 'Qwen Turbo',
    provider: 'qwen',
    contextWindow: 128000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Fast and cost-effective',
  },
  'qwen-vl-max': {
    name: 'Qwen VL Max',
    provider: 'qwen',
    contextWindow: 32768,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Best vision capabilities',
  },
  'gemini-3.1-pro': {
    name: 'Gemini 3.1 Pro',
    provider: 'gemini',
    contextWindow: 2000000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Latest Gemini with 2M context',
  },
  'gemini-2.0-flash-exp': {
    name: 'Gemini 2.0 Flash (Experimental)',
    provider: 'gemini',
    contextWindow: 1000000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Experimental model',
  },
  'gemini-1.5-pro': {
    name: 'Gemini 1.5 Pro',
    provider: 'gemini',
    contextWindow: 2000000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Large context, excellent reasoning',
  },
  'gemini-1.5-flash': {
    name: 'Gemini 1.5 Flash',
    provider: 'gemini',
    contextWindow: 1000000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Fast and efficient',
  },
  'gemini-1.5-flash-8b': {
    name: 'Gemini 1.5 Flash 8B',
    provider: 'gemini',
    contextWindow: 1000000,
    supportsTools: true,
    supportsVision: true,
    streaming: true,
    description: 'Lightweight fast model',
  },
};

export const PROVIDER_ENDPOINTS: Record<ProviderName, { baseUrl: string; defaultModel: string; recommendedModel: string }> = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-haiku-20241017',
    recommendedModel: 'claude-sonnet-4-20250514',
  },
  glm: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5.1',
    recommendedModel: 'glm-5.1',
  },
  kimi: {
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.5',
    recommendedModel: 'kimi-k2.5',
  },
  minimax: {
    baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'minimax-m2.7',
    recommendedModel: 'minimax-m2.7',
  },
  siliconflow: {
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-v3',
    recommendedModel: 'deepseek-v3',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v3',
    recommendedModel: 'deepseek-v3',
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-max',
    recommendedModel: 'qwen-max',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-3.1-pro',
    recommendedModel: 'gemini-3.1-pro',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    recommendedModel: 'gpt-4o',
  },
  moonshot: {
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.5',
    recommendedModel: 'kimi-k2.5',
  },
};