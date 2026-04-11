import type { Message, Tool } from '../../types/index.js';
import type { ProviderName } from './provider-config.js';

/**
 * 流式输出回调接口
 *
 * 用于处理 AI 响应的流式输出：
 * - onChunk: 每个文本片段到达时调用
 * - onComplete: 整个响应完成时调用
 * - onError: 发生错误时调用
 */
export interface StreamCallbacks {
  /** 每个文本片段到达时触发（用于实时显示 AI 响应） */
  onChunk?: (text: string) => void;
  /** 整个响应完成时触发（用于显示统计信息） */
  onComplete?: (fullText: string) => void;
  /** 发生错误时触发（用于错误提示） */
  onError?: (error: Error) => void;
}

/**
 * AI 提供商接口
 *
 * 统一不同 AI API 的调用方式
 * 所有 AI 客户端（如 Anthropic、OpenAI、GLM）都需要实现此接口
 */
export interface AIProvider {
  /** 提供商名称（如 'Anthropic'、'OpenAI'） */
  name: string;

  /**
   * 发送消息并获取 AI 响应
   *
   * @param messages - 对话历史消息数组
   * @param tools - 可用的工具列表（可选）
   * @param callbacks - 流式回调函数（可选，用于流式输出）
   * @returns AI 响应，包含文本内容和工具调用列表
   */
  sendMessage(
    messages: Message[],
    tools?: Tool[],
    callbacks?: StreamCallbacks
  ): Promise<{ text: string; toolCalls: ToolCall[] }>;
}

/**
 * 工具调用请求
 *
 * 当 AI 需要调用工具时，会返回此类型的数据
 */
export interface ToolCall {
  /** 工具调用的唯一 ID */
  id: string;
  /** 要调用的工具名称 */
  name: string;
  /** 工具输入参数 */
  input: Record<string, unknown>;
}

/**
 * 提供商配置接口
 *
 * 用于创建 AI 客户端时的配置参数
 */
export interface ProviderConfig {
  /** 提供商名称（对应支持的 AI 服务） */
  provider: ProviderName;
  /** API 密钥 */
  apiKey: string;
  /** API 基础 URL（可选，用于代理或自定义端点） */
  baseUrl?: string;
  /** 模型名称（可选，不同提供商有不同的模型） */
  model?: string;
}
