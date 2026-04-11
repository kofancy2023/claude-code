import type { AIProvider, StreamCallbacks, ToolCall } from '../services/api/types.js';
import type { Message, Tool } from '../types/index.js';
import { toolRegistry } from '../tools/registry.js';
import { permissions } from '../services/permissions.js';
import { terminal } from '../ui/terminal.js';
import { ToolExecutionError, formatError, errorHandler } from '../utils/errors.js';

/**
 * 最多允许的对话轮数（每轮可能包含多个工具调用）
 * 防止 AI 进入无限循环
 */
const MAX_TOOL_CALL_ROUNDS = 20;

/**
 * 最多允许的总工具调用次数
 * 防止资源耗尽
 */
const MAX_TOOL_CALLS_TOTAL = 100;

/**
 * 查询结果接口
 * 包含 AI 最终响应和执行统计
 */
export interface QueryResult {
  /** AI 最终响应的文本内容 */
  response: string;
  /** 更新后的对话消息列表（包含工具调用结果） */
  messages: Message[];
  /** 本次查询中执行的工具调用总次数 */
  toolCallsExecuted: number;
}

/**
 * 查询引擎类
 *
 * 核心职责：管理 AI 对话的多轮工具调用循环
 *
 * 工作流程：
 * 1. 发送用户消息给 AI
 * 2. 如果 AI 返回工具调用，执行工具
 * 3. 将工具结果添加到消息历史
 * 4. 重复步骤 1-3，直到 AI 不再调用工具
 * 5. 返回最终响应
 *
 * 循环终止条件：
 * - AI 不再返回工具调用
 * - 达到最大轮数（20 轮）
 * - 达到最大工具调用次数（100 次）
 * - 连续 2 次空响应
 */
export class QueryEngine {
  /** AI 模型客户端实例 */
  private client: AIProvider;

  constructor(client: AIProvider) {
    this.client = client;
  }

  /**
   * 执行一次完整的查询
   *
   * @param messages - 对话历史消息数组
   * @param tools - 可用的工具列表
   * @param callbacks - 流式输出回调函数
   * @returns 查询结果，包含响应文本、更新后的消息和工具调用次数
   */
  async query(
    messages: Message[],
    tools: Tool[],
    callbacks: StreamCallbacks
  ): Promise<QueryResult> {
    // 累计执行的工具调用次数
    let totalToolCalls = 0;
    // 连续空响应的次数（用于检测死循环）
    let consecutiveEmptyResponses = 0;

    // 主循环：最多执行 MAX_TOOL_CALL_ROUNDS 轮
    for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
      // 显示当前轮次
      callbacks.onChunk?.(`\n${terminal.renderInfo(`[Round ${round + 1}]`)} `);

      // 发送消息给 AI 模型，获取响应
      const { text, toolCalls } = await this.client.sendMessage(
        messages,
        tools,
        callbacks
      );

      // 处理 AI 响应
      if (toolCalls.length === 0) {
        // 没有工具调用，检查响应内容
        if (!text || text.trim() === '') {
          // 空响应，连续计数 +1
          consecutiveEmptyResponses++;
          if (consecutiveEmptyResponses >= 2) {
            // 连续 2 次空响应，停止循环
            callbacks.onChunk?.(`\n${terminal.renderWarning('[Warning: Empty response, stopping]')}`);
            break;
          }
        } else {
          // 有文本响应，返回结果
          return {
            response: text,
            messages,
            toolCallsExecuted: totalToolCalls,
          };
        }
      } else {
        // 有工具调用，重置连续空响应计数
        consecutiveEmptyResponses = 0;
      }

      // 执行所有工具调用
      for (const toolCall of toolCalls) {
        // 执行单个工具调用
        const result = await this.executeToolCall(toolCall, callbacks);

        // 将工具结果作为新消息添加到历史
        messages.push({
          role: 'user',
          content: JSON.stringify({
            type: 'tool_result',
            tool_call_id: toolCall.id,
            content: result,
          }),
        });

        // 累计工具调用次数
        totalToolCalls++;

        // 检查是否达到总调用次数限制
        if (totalToolCalls >= MAX_TOOL_CALLS_TOTAL) {
          callbacks.onChunk?.(`\n${terminal.renderWarning('[Warning: Max tool calls reached, stopping]')}`);
          return {
            response: text || 'Maximum tool calls reached',
            messages,
            toolCallsExecuted: totalToolCalls,
          };
        }
      }
    }

    // 达到最大轮数限制
    callbacks.onChunk?.(`\n${terminal.renderWarning('[Warning: Max rounds reached, stopping]')}`);
    return {
      response: 'Maximum rounds reached',
      messages,
      toolCallsExecuted: totalToolCalls,
    };
  }

  /**
   * 执行单个工具调用
   *
   * 执行流程：
   * 1. 从工具注册表查找工具
   * 2. 检查权限
   * 3. 执行工具
   * 4. 返回结果（或错误信息）
   *
   * @param toolCall - 工具调用请求（包含工具名和参数）
   * @param callbacks - 流式输出回调函数
   * @returns 工具执行结果的 JSON 字符串
   */
  private async executeToolCall(
    toolCall: ToolCall,
    callbacks: StreamCallbacks
  ): Promise<string> {
    // 显示工具调用信息
    console.log(terminal.renderToolCall(toolCall.name, toolCall.input));

    // 步骤 1：查找工具
    const tool = toolRegistry.get(toolCall.name);
    if (!tool) {
      // 工具不存在
      const errorMsg = `Tool not found: ${toolCall.name}`;
      console.error(terminal.renderError(errorMsg));
      return JSON.stringify({
        type: 'tool_result',
        tool_call_id: toolCall.id,
        content: `Error: ${errorMsg}`,
        is_error: true,
      });
    }

    // 步骤 2：权限检查
    const permResult = permissions.checkPermission({
      toolName: toolCall.name,
      action: 'execute',
      params: toolCall.input,
    });

    if (!permResult.allowed) {
      // 权限被拒绝
      const errorMsg = `Permission denied: ${permResult.reason}`;
      console.error(terminal.renderError(errorMsg));
      return JSON.stringify({
        type: 'tool_result',
        tool_call_id: toolCall.id,
        content: `Error: ${errorMsg}`,
        is_error: true,
      });
    }

    // 步骤 3：执行工具
    try {
      const result = await tool.execute(toolCall.input);
      console.log(terminal.renderToolResult(result));
      // 通过回调通知工具执行完成
      callbacks.onChunk?.(`\n${terminal.renderSuccess('[Tool executed] ')}`);
      return JSON.stringify({
        type: 'tool_result',
        tool_call_id: toolCall.id,
        content: result,
      });
    } catch (error) {
      // 工具执行出错
      const appError = new ToolExecutionError(
        toolCall.name,
        error instanceof Error ? error.message : String(error)
      );
      await errorHandler.handle(appError, { toolCall });
      const formattedError = formatError(appError);
      console.error(terminal.renderError(formattedError));
      return JSON.stringify({
        type: 'tool_result',
        tool_call_id: toolCall.id,
        content: `Error: ${formattedError}`,
        is_error: true,
      });
    }
  }
}
