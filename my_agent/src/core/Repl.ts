import * as readline from 'readline';
import * as path from 'path';
import type { AIProvider, StreamCallbacks } from '../services/api/types.js';
import type { Store } from '../state/store.js';
import { toolRegistry } from '../tools/registry.js';
import { terminal } from '../ui/terminal.js';
import { formatError, errorHandler } from '../utils/errors.js';
import { SessionManager, type SessionData } from '../services/session.js';
import { ContextManager } from '../services/context-manager.js';
import { ToolChainExecutor } from '../services/tool-chain.js';
import { QueryEngine } from './QueryEngine.js';
import { commandRegistry } from './commands.js';
import { createAutoCommand } from './auto-command.js';
import { ReadlineEnhancer, readlineEnhancer } from './readline-enhancer.js';
import type { Message } from '../types/index.js';

/**
 * 会话存储目录
 * 所有会话数据将保存在项目根目录的 .sessions 文件夹下
 */
const SESSION_DIR = path.join(process.cwd(), '.sessions');

/**
 * REPL（读取-求值-打印循环）类
 *
 * 核心职责：
 * - 管理命令行交互式对话循环
 * - 协调 AI 模型、工具、权限系统之间的交互
 * - 处理用户输入并渲染输出
 *
 * 集成的功能模块：
 * - SessionManager: 会话持久化（自动保存/恢复）
 * - ContextManager: 上下文窗口管理（自动截断过长对话）
 * - ToolChainExecutor: 工具链系统（复杂任务编排）
 */
export class Repl {
  /** AI 模型客户端 */
  private client: AIProvider;
  /** 应用状态存储 */
  private store: Store;
  /** 命令行读取接口 */
  private rl: readline.Interface;
  /** 会话管理器（持久化） */
  private sessionManager: SessionManager;
  /** 上下文管理器（窗口管理） */
  private contextManager: ContextManager;
  /** 工具链执行器（高级任务） */
  private _toolChainExecutor: ToolChainExecutor;
  /** 查询引擎（工具循环） */
  private queryEngine: QueryEngine;
  /** 当前会话 ID（用于标识和恢复会话） */
  private currentSessionId: string | null = null;
  /** 自动保存定时器 ID */
  private autoSaveInterval: NodeJS.Timeout | null = null;
  /** 消息计数器（用于触发自动保存） */
  private messageCount = 0;

  /**
   * 构造函数
   * @param client - AI 模型客户端实例
   * @param store - 状态存储实例
   */
  constructor({
    client,
    store,
  }: {
    client: AIProvider;
    store: Store;
  }) {
    this.client = client;
    this.store = store;
    this.sessionManager = new SessionManager(SESSION_DIR);
    this.contextManager = new ContextManager();
    this._toolChainExecutor = new ToolChainExecutor();
    this.queryEngine = new QueryEngine(client);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
      completer: readlineEnhancer.createCompleter(),
    });

    readlineEnhancer.attach(this.rl);

    // 注册自主执行命令
    const autoCmd = createAutoCommand(client);
    commandRegistry.register(autoCmd);
  }

  /**
   * 获取工具链执行器
   * 供外部模块注册自定义工具链
   */
  getToolChainExecutor(): ToolChainExecutor {
    return this._toolChainExecutor;
  }

  /**
   * 启动 REPL 循环
   *
   * 初始化流程：
   * 1. 显示欢迎信息和提供商名称
   * 2. 检查并提示恢复已有会话
   * 3. 注册命令行事件处理器
   * 4. 进入交互式循环
   */
  async run(): Promise<void> {
    // 显示欢迎界面
    console.log(terminal.renderWelcome());
    console.log(terminal.renderInfo(`Provider: ${this.client.name}`));
    console.log(terminal.renderDivider());

    // 提示用户可以恢复已有会话
    await this.promptForSession();

    // 加载所有可用工具到状态存储
    this.store.setTools(toolRegistry.getAll());
    this.rl.prompt();

    // 注册行输入事件处理器
    this.rl.on('line', async (input: string) => {
      const trimmed = input.trim();

      if (!trimmed) {
        this.rl.prompt();
        return;
      }

      // 检查是否为斜杠命令
      if (trimmed.startsWith('/')) {
        await commandRegistry.execute(trimmed, {
          client: this.client,
          store: this.store,
        });
        this.rl.prompt();
        return;
      }

      // 兼容旧命令格式
      if (trimmed === 'exit' || trimmed === 'quit') {
        await this.cleanup();
        console.log(terminal.renderSuccess('Goodbye!'));
        this.rl.close();
        return;
      }

      if (trimmed === 'sessions') {
        await this.listSessions();
        this.rl.prompt();
        return;
      }

      if (trimmed.startsWith('load ')) {
        const sessionId = trimmed.slice(5).trim();
        await this.loadSession(sessionId);
        this.rl.prompt();
        return;
      }

      if (trimmed === 'save') {
        await this.saveCurrentSession();
        this.rl.prompt();
        return;
      }

      if (trimmed === 'chains') {
        const chains = this.getToolChainExecutor().listChains();
        console.log(terminal.renderInfo(`Registered chains: ${chains.length}`));
        for (const chain of chains) {
          console.log(`  - ${chain.id}: ${chain.name} (${chain.nodes.length} nodes)`);
        }
        this.rl.prompt();
        return;
      }

      // 处理用户消息
      await this.handleInput(trimmed);
      this.rl.prompt();
    });

    // 监听关闭事件
    this.rl.on('close', () => {
      process.exit(0);
    });
  }

  /**
   * 启动时提示会话恢复选项
   *
   * 如果存在已保存的会话，显示最近 5 个供用户选择
   */
  private async promptForSession(): Promise<void> {
    const sessions = await this.sessionManager.list();

    if (sessions.length > 0) {
      console.log(terminal.renderInfo('Available sessions:'));
      // 显示最近 5 个会话
      for (const s of sessions.slice(0, 5)) {
        const date = new Date(s.updatedAt).toLocaleString('zh-CN');
        console.log(`  ${terminal.renderDivider()}`);
        console.log(`  ID: ${s.id}`);
        console.log(`  Name: ${s.name}`);
        console.log(`  Messages: ${s.messages.length}`);
        console.log(`  Updated: ${date}`);
      }
      console.log(terminal.renderDivider());
      console.log(terminal.renderInfo('Commands: "load <id>" to restore, "sessions" to list, or just chat to start new session.\n'));
    } else {
      console.log(terminal.renderInfo('No saved sessions. Start chatting to create one.\n'));
    }
  }

  /**
   * 列出所有已保存的会话
   * 按更新时间倒序排列
   */
  private async listSessions(): Promise<void> {
    const sessions = await this.sessionManager.list();
    if (sessions.length === 0) {
      console.log(terminal.renderInfo('No saved sessions.'));
      return;
    }
    console.log(terminal.renderDivider());
    console.log(terminal.renderInfo(`Found ${sessions.length} sessions:`));
    for (const s of sessions) {
      const date = new Date(s.updatedAt).toLocaleString('zh-CN');
      console.log(`\n  [${s.id}] ${s.name}`);
      console.log(`  Messages: ${s.messages.length} | Updated: ${date}`);
    }
    console.log();
  }

  /**
   * 加载指定会话
   * 将会话中的消息恢复到状态存储
   *
   * @param sessionId - 要加载的会话 ID
   */
  private async loadSession(sessionId: string): Promise<void> {
    const session = await this.sessionManager.load(sessionId);
    if (!session) {
      console.error(terminal.renderError(`Session not found: ${sessionId}`));
      return;
    }

    // 恢复消息历史
    this.store.getState().messages = session.messages;
    this.currentSessionId = session.id;
    this.messageCount = session.messages.length;

    console.log(terminal.renderSuccess(`Loaded session: ${session.name}`));
    console.log(terminal.renderInfo(`Restored ${session.messages.length} messages.\n`));
  }

  /**
   * 保存当前会话
   * 将状态存储中的消息持久化到文件
   *
   * @param silent - 是否静默保存（静默模式下不显示成功提示）
   */
  private async saveCurrentSession(silent = false): Promise<void> {
    const messages = this.store.getMessages();
    if (messages.length === 0) {
      return;  // 无消息时不保存
    }

    // 生成会话 ID（首次保存时创建，之后复用）
    const sessionId = this.currentSessionId || `session-${Date.now()}`;

    // 构建会话数据
    const session: SessionData = {
      id: sessionId,
      name: `Chat ${new Date().toLocaleString('zh-CN')}`,
      // 如果是已有会话，保留原始创建时间
      createdAt: this.currentSessionId
        ? (await this.sessionManager.load(sessionId))?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages,
      metadata: {
        provider: this.client.name,
        model: (this.client as unknown as { model?: string }).model,
        messageCount: messages.length,
      },
    };

    // 持久化到文件
    await this.sessionManager.save(session);
    this.currentSessionId = sessionId;

    // 非静默模式显示成功提示
    if (!silent) {
      console.log(terminal.renderSuccess(`Session saved: ${sessionId}`));
    }
  }

  /**
   * 自动保存当前会话
   * 每 10 条消息自动触发一次
   */
  private async autoSave(): Promise<void> {
    if (this.messageCount > 0) {
      await this.saveCurrentSession(true);  // 静默保存
    }
  }

  /**
   * 清理函数
   * 退出前执行，包括停止定时器、自动保存等
   */
  private async cleanup(): Promise<void> {
    // 清除自动保存定时器
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    // 执行最终的保存操作
    await this.autoSave();
  }

  /**
   * 创建流式输出回调
   *
   * 返回的回调对象包含：
   * - onChunk: 处理每个文本片段
   * - onComplete: 处理完成时的统计信息
   * - onError: 处理错误
   * - onConfirm: 处理用户确认请求
   */
  private createStreamCallbacks(): StreamCallbacks {
    let tokenCount = 0;
    const startTime = Date.now();

    return {
      // 每个文本片段到达时触发
      onChunk: (text: string) => {
        tokenCount++;
        process.stdout.write(text);
      },
      // 响应完成时触发
      onComplete: (_fullText: string) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const speed = elapsed && parseFloat(elapsed) > 0
          ? Math.round(tokenCount / parseFloat(elapsed))
          : 0;
        process.stdout.write(`\n\x1b[32m✓\x1b[0m \x1b[90m${tokenCount} tokens, ${elapsed}s (${speed} tok/s)\x1b[0m\n\n`);
      },
      // 错误时触发
      onError: (error: Error) => {
        process.stdout.write('\n');
        console.error(terminal.renderError(error.message));
      },
      // 用户确认请求
      onConfirm: async (message: string, diff?: string[]): Promise<boolean> => {
        process.stdout.write('\n');
        console.log(terminal.renderConfirmation(message));
        if (diff && diff.length > 0) {
          console.log(terminal.renderDiff(diff));
        }
        process.stdout.write('\n');

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        return new Promise<boolean>((resolve) => {
          rl.question('Confirm? (y/n): ', (answer: string) => {
            rl.close();
            const confirmed = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
            resolve(confirmed);
          });
        });
      },
    };
  }

  /**
   * 获取要发送的消息列表
   *
   * 如果消息总长度超过模型上下文窗口限制，
   * 自动进行截断和摘要处理
   */
  private getMessagesForSending(): Message[] {
    const messages = this.store.getMessages();
    const model = (this.client as unknown as { model?: string }).model;

    // 显示上下文使用状态
    const contextBar = this.contextManager.renderContextBar(messages, model);
    console.log(terminal.renderInfo(`Context: ${contextBar}`));

    // 检查是否需要上下文截断，使用智能截断策略
    if (this.contextManager.needsTruncation(messages, model)) {
      console.log(terminal.renderInfo('[Applying smart context truncation...]'));
      return this.contextManager.smartTruncate(messages, model);
    }

    return messages;
  }

  /**
   * 处理用户输入的核心方法
   *
   * 处理流程：
   * 1. 添加用户消息到存储
   * 2. 检查是否触发自动保存
   * 3. 准备要发送的消息（可能经过截断）
   * 4. 发送给 AI 模型
   * 5. 处理返回的工具调用
   * 6. 处理最终文本响应
   *
   * @param input - 用户输入的文本
   */
  private async handleInput(input: string): Promise<void> {
    console.log(terminal.renderDivider());
    console.log(terminal.renderUserMessage(input));

    this.messageCount++;

    if (this.messageCount % 10 === 0) {
      await this.autoSave();
    }

    try {
      this.store.addMessage({
        role: 'user',
        content: input,
      });

      const callbacks = this.createStreamCallbacks();
      const messagesToSend = this.getMessagesForSending();

      const { response, toolCallsExecuted } = await this.queryEngine.query(
        messagesToSend,
        this.store.getTools(),
        callbacks
      );

      if (response) {
        this.store.addMessage({
          role: 'assistant',
          content: response,
        });
      }

      if (toolCallsExecuted > 0) {
        console.log(terminal.renderSuccess(`[Completed ${toolCallsExecuted} tool calls]`));
      }
    } catch (error) {
      await errorHandler.handle(error, { context: 'handleInput' });
      console.error(terminal.renderError(formatError(error)));
    }
  }
}
