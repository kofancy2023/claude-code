import * as readline from 'readline';
import type { AIProvider } from '../services/api/types.js';
import type { Store } from '../state/store.js';
import { toolRegistry } from '../tools/registry.js';

/**
 * REPL（读取-求值-打印循环）类
 *
 * 负责管理命令行交互式对话循环：
 * - 读取用户输入
 * - 将消息发送给 AI 模型
 * - 处理模型返回的文本和工具调用
 * - 将结果打印到终端
 */
export class Repl {
  /** AI 服务提供者，负责与模型 API 通信 */
  private client: AIProvider;
  /** 状态存储，管理对话历史和工具列表 */
  private store: Store;
  /** readline 接口实例，处理终端输入输出 */
  private rl: readline.Interface;

  constructor({
    client,
    store,
  }: {
    client: AIProvider;
    store: Store;
  }) {
    this.client = client;
    this.store = store;
    // 创建 readline 交互接口，设置提示符为 "> "
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    });
  }

  /**
   * 启动 REPL 主循环
   *
   * 流程：
   * 1. 打印欢迎信息
   * 2. 从工具注册表加载所有可用工具到 store
   * 3. 监听用户输入行，分发给 handleInput 处理
   * 4. 监听关闭事件，退出进程
   */
  async run(): Promise<void> {
    console.log('🤖 My Agent CLI (with Tools!)');
    console.log('Type your messages or "exit" to quit.\n');

    // 将所有已注册的工具加载到状态存储中，供 API 调用时使用
    this.store.setTools(toolRegistry.getAll());

    // 显示命令行提示符
    this.rl.prompt();

    // 监听每一行用户输入
    this.rl.on('line', async (input: string) => {
      const trimmed = input.trim();

      // 输入 "exit" 或 "quit" 时退出程序
      if (trimmed === 'exit' || trimmed === 'quit') {
        console.log('Goodbye!');
        this.rl.close();
        return;
      }

      // 非空输入才进行处理
      if (trimmed) {
        await this.handleInput(trimmed);
      }

      // 处理完毕后重新显示提示符，等待下一轮输入
      this.rl.prompt();
    });

    // 当 readline 关闭时（如用户按 Ctrl+D），退出进程
    this.rl.on('close', () => {
      process.exit(0);
    });
  }

  /**
   * 处理用户输入的核心逻辑
   *
   * 流程：
   * 1. 将用户消息存入对话历史
   * 2. 调用 AI 模型获取回复
   * 3. 如果模型请求工具调用 → 执行工具 → 再次调用模型获取最终回复
   * 4. 如果模型直接返回文本 → 直接输出
   */
  private async handleInput(input: string): Promise<void> {
    console.log(`\n[Processing: "${input}"]`);

    try {
      // 将用户输入作为一条 user 消息添加到对话历史
      this.store.addMessage({
        role: 'user',
        content: input,
      });

      // 向 AI 模型发送当前完整的对话历史和可用工具定义
      const { text, toolCalls } = await this.client.sendMessage(
        this.store.getMessages(),
        this.store.getTools()
      );

      if (toolCalls.length > 0) {
        // 模型请求了一个或多个工具调用
        console.log('\n🔧 Tool calls detected:');
        for (const toolCall of toolCalls) {
          await this.handleToolCall(toolCall);
        }

        // 工具调用完成后，再次向模型发送消息（包含工具结果），
        // 让模型根据工具执行结果生成最终的自然语言回复
        const { text: finalText } = await this.client.sendMessage(
          this.store.getMessages(),
          this.store.getTools()
        );

        if (finalText) {
          console.log(`\n${finalText}\n`);
          this.store.addMessage({
            role: 'assistant',
            content: finalText,
          });
        }
      } else {
        // 模型直接返回文本回复，无需工具调用
        if (text) {
          console.log(`\n${text}\n`);
          this.store.addMessage({
            role: 'assistant',
            content: text,
          });
        }
      }
    } catch (error) {
      // 捕获并显示请求过程中的错误
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 处理单个工具调用
   *
   * 流程：
   * 1. 根据工具名称从注册表中查找对应工具
   * 2. 如果工具不存在，返回错误结果给模型
   * 3. 执行工具并将结果（或错误信息）作为 tool_result 消息存入对话历史
   *
   * @param toolCall - 模型返回的工具调用请求，包含 id、名称和输入参数
   */
  private async handleToolCall(toolCall: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  }): Promise<void> {
    // 打印工具调用信息，方便用户了解执行进度
    console.log(`  📦 ${toolCall.name}:`, toolCall.input);

    // 从工具注册表中查找对应工具
    const tool = toolRegistry.get(toolCall.name);
    if (!tool) {
      // 工具未找到，将错误信息作为 tool_result 返回给模型
      console.error(`  ❌ Tool not found: ${toolCall.name}`);
      this.store.addMessage({
        role: 'user',
        content: JSON.stringify({
          type: 'tool_result',
          tool_call_id: toolCall.id,
          content: `Error: Tool ${toolCall.name} not found`,
          is_error: true,
        }),
      });
      return;
    }

    try {
      // 执行工具并获取结果
      const result = await tool.execute(toolCall.input);
      // 截断显示过长的结果（最多显示 100 个字符）
      console.log(`  ✅ Result: ${result.substring(0, 100)}${result.length > 100 ? '...' : ''}`);

      // 将工具执行结果存入对话历史，供模型在下一轮调用时参考
      this.store.addMessage({
        role: 'user',
        content: JSON.stringify({
          type: 'tool_result',
          tool_call_id: toolCall.id,
          content: result,
        }),
      });
    } catch (error) {
      // 工具执行出错，将错误信息作为 tool_result 返回
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Error: ${errorMessage}`);

      this.store.addMessage({
        role: 'user',
        content: JSON.stringify({
          type: 'tool_result',
          tool_call_id: toolCall.id,
          content: `Error: ${errorMessage}`,
          is_error: true,
        }),
      });
    }
  }
}
