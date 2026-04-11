import type { AIProvider, ToolCall, StreamCallbacks } from './types.js';
import type { Message, Tool } from '../../types/index.js';
import { withRetry } from '../../utils/retry.js';
import { circuitBreakerRegistry, CircuitBreaker } from '../../utils/retry.js';
import { apiRateLimiter } from '../../utils/performance.js';

/**
 * 带弹性功能的 AI 客户端包装器
 *
 * 为基础 AI 客户端添加：
 * - 自动重试（指数退避 + 抖动）
 * - 熔断器保护
 * - 速率限制
 * - 并发控制
 *
 * 防止外部 API 不稳定导致的级联故障
 */
export class ResilientClient implements AIProvider {
  name: string;
  private client: AIProvider;
  private breaker: CircuitBreaker;

  constructor(client: AIProvider, breakerName?: string) {
    this.client = client;
    this.name = `Resilient(${client.name})`;
    this.breaker = circuitBreakerRegistry.get(breakerName || client.name);
  }

  async sendMessage(
    messages: Message[],
    tools: Tool[] = [],
    callbacks?: StreamCallbacks
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    await apiRateLimiter.acquire(1);

    return this.breaker.execute(() =>
      withRetry(
        () => this.client.sendMessage(messages, tools, callbacks),
        {
          maxRetries: 3,
          initialDelay: 1000,
          backoffMultiplier: 2,
          jitter: true,
        }
      )
    );
  }
}
