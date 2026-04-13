/**
 * 终端主题颜色接口
 * 定义终端输出的颜色配置
 */
export interface TerminalTheme {
  /** 主色调（青色）*/
  primary: string;
  /** 次要色调（紫色）*/
  secondary: string;
  /** 成功色（绿色）*/
  success: string;
  /** 错误色（红色）*/
  error: string;
  /** 警告色（黄色）*/
  warning: string;
  /** 信息色（蓝色）*/
  info: string;
  /** 暗淡/辅助色（灰色）*/
  muted: string;
  /** 标题色（青色）*/
  header: string;
  /** 背景色 */
  background: string;
  /** 前景色 */
  foreground: string;
}

/**
 * 默认终端主题
 * 使用 ANSI 转义序列定义颜色
 */
export const defaultTheme: TerminalTheme = {
  primary: '\x1b[36m',    // 青色 - 主要信息
  secondary: '\x1b[35m',   // 紫色 - 次要信息
  success: '\x1b[32m',     // 绿色 - 成功状态
  error: '\x1b[31m',       // 红色 - 错误状态
  warning: '\x1b[33m',     // 黄色 - 警告状态
  info: '\x1b[34m',        // 蓝色 - 信息
  muted: '\x1b[90m',       // 灰色 - 暗淡/辅助文字
  header: '\x1b[36m',      // 青色 - 标题（与 primary 相同）
  background: '\x1b[0m',   // 重置背景
  foreground: '\x1b[97m',  // 亮白色前景
};

/**
 * 渲染选项接口
 */
export interface RenderOptions {
  /** 自定义主题 */
  theme?: TerminalTheme;
  /** 是否显示时间戳 */
  showTimestamp?: boolean;
  /** 是否显示工具图标 */
  showToolIcons?: boolean;
}

/**
 * 终端渲染器类
 *
 * 负责美化命令行输出，提供：
 * - ANSI 颜色支持
 * - ASCII 艺术边框
 * - 统一的消息格式化
 * - 时间戳显示
 *
 * @example
 * import { terminal } from './ui/terminal.js';
 *
 * // 欢迎信息
 * console.log(terminal.renderWelcome());
 *
 * // 用户消息
 * console.log(terminal.renderUserMessage("帮我列出文件"));
 *
 * // AI 回复
 * console.log(terminal.renderAssistantMessage("好的，我来执行 ls 命令"));
 *
 * // 工具调用
 * console.log(terminal.renderToolCall("BashTool", { command: "ls" }));
 *
 * // 帮助信息
 * console.log(terminal.renderHelp());
 */
export class TerminalRenderer {
  /** 当前使用的主题 */
  private theme: TerminalTheme;
  /** 是否显示时间戳 */
  private showTimestamp: boolean;
  /** 是否显示工具图标 */
  private showToolIcons: boolean;

  /**
   * 创建终端渲染器
   * @param options 渲染选项
   */
  constructor(options: RenderOptions = {}) {
    this.theme = options.theme || defaultTheme;
    this.showTimestamp = options.showTimestamp ?? true;
    this.showToolIcons = options.showToolIcons ?? true;
  }

  /**
   * 重置 ANSI 样式
   * @returns 重置转义序列
   */
  private reset(): string {
    return '\x1b[0m';
  }

  /**
   * 获取颜色转义序列
   * @param color 颜色代码
   * @returns 颜色转义序列
   */
  private color(color: string): string {
    return color;
  }

  /**
   * 渲染暗淡（灰色）文字
   * 用于时间戳等辅助信息
   * @param text 文字内容
   * @returns 格式化后的文字
   */
  private dim(text: string): string {
    return `${this.theme.muted}${text}${this.reset()}`;
  }

  /**
   * 生成时间戳字符串
   * @returns 格式化的时间戳
   */
  private timestamp(): string {
    if (!this.showTimestamp) return '';
    const now = new Date();
    const ts = now.toISOString().split('T')[1].split('.')[0];
    return `${this.dim(`[${ts}]`)} `;
  }

  /**
   * 渲染欢迎界面
   * @returns ASCII 艺术欢迎框
   */
  renderWelcome(): string {
    return `
${this.color(this.theme.primary)}
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🤖  My Agent CLI                                           ║
║                                                              ║
║   Type your message or command.                              ║
║   Use /help for available commands.                          ║
║   Use /exit to quit.                                         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
${this.reset()}`;
  }

  /**
   * 渲染提示符
   * @param agentName 代理名称
   * @returns 格式化提示符
   */
  renderPrompt(agentName: string = 'Assistant'): string {
    return `${this.color(this.theme.primary)}${agentName}> ${this.reset()}`;
  }

  /**
   * 渲染用户消息
   * @param message 用户输入的消息
   * @returns 格式化后的用户消息
   */
  renderUserMessage(message: string): string {
    return `${this.timestamp()}${this.color(this.theme.secondary)}User: ${this.reset()}${message}`;
  }

  /**
   * 渲染助手/AI 消息
   * @param message AI 回复内容
   * @param isStreaming 是否为流式输出
   * @returns 格式化后的 AI 消息
   */
  renderAssistantMessage(message: string, isStreaming: boolean = false): string {
    const prefix = isStreaming ? `${this.color(this.theme.warning)}▌` : `${this.color(this.theme.success)}▶`;
    return `${this.timestamp()}${prefix} ${this.reset()}${message}`;
  }

  /**
   * 渲染工具调用信息
   * @param toolName 工具名称
   * @param input 工具输入参数
   * @returns 格式化后的工具调用信息
   */
  renderToolCall(toolName: string, input: Record<string, unknown>): string {
    const icon = this.showToolIcons ? '🔧' : '•';
    const toolLabel = `${this.color(this.theme.info)}${icon} ${toolName}${this.reset()}`;
    const inputStr = JSON.stringify(input, null, 2)
      .split('\n')
      .map((line, i) => i === 0 ? line : `  ${line}`)
      .join('\n');
    return `${this.timestamp()}${toolLabel}\n${this.dim(inputStr)}`;
  }

  /**
   * 渲染工具执行结果
   * @param result 执行结果
   * @param truncated 是否截断过长的输出
   * @returns 格式化后的结果
   */
  renderToolResult(result: string, truncated: boolean = false): string {
    if (truncated && result.length > 200) {
      result = result.substring(0, 200) + '...';
    }
    return `${this.color(this.theme.success)}✓ Result: ${this.reset()}${result}`;
  }

  /**
   * 渲染错误信息
   * @param error 错误消息
   * @returns 格式化后的错误信息
   */
  renderError(error: string): string {
    return `${this.timestamp()}${this.color(this.theme.error)}✗ Error: ${this.reset()}${error}`;
  }

  /**
   * 渲染警告信息
   * @param warning 警告消息
   * @returns 格式化后的警告信息
   */
  renderWarning(warning: string): string {
    return `${this.timestamp()}${this.color(this.theme.warning)}⚠ Warning: ${this.reset()}${warning}`;
  }

  /**
   * 渲染一般信息
   * @param info 信息内容
   * @returns 格式化后的信息
   */
  renderInfo(info: string): string {
    return `${this.timestamp()}${this.color(this.theme.info)}ℹ ${this.reset()}${info}`;
  }

  /**
   * 渲染成功消息
   * @param message 成功消息内容
   * @returns 格式化后的成功消息
   */
  renderSuccess(message: string): string {
    return `${this.timestamp()}${this.color(this.theme.success)}✓ ${this.reset()}${message}`;
  }

  /**
   * 渲染高亮文本
   * 用于命令名称等需要突出的内容
   * @param text 高亮文本内容
   * @returns 格式化后的高亮文本
   */
  renderHighlight(text: string): string {
    return `${this.color(this.theme.primary)}${text}${this.reset()}`;
  }

  /**
   * 渲染分隔线
   * @param char 分隔字符
   * @param length 分隔线长度
   * @returns 分隔线字符串
   */
  renderDivider(char: string = '─', length: number = 60): string {
    return this.dim(char.repeat(length));
  }

  /**
   * 渲染标题框
   * @param text 标题文字
   * @param width 框的宽度
   * @returns 格式化后的标题框
   */
  renderHeader(text: string, width: number = 60): string {
    const padding = width - text.length - 2;
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return `${this.color(this.theme.primary)}╔${'═'.repeat(width)}╗
║${' '.repeat(leftPad)}${text}${' '.repeat(rightPad)}║
╚${'═'.repeat(width)}╝${this.reset()}`;
  }

  /**
   * 渲染内容框
   * @param content 框内的内容
   * @param width 框的宽度
   * @returns 格式化后的内容框
   */
  renderBox(content: string, width: number = 60): string {
    const lines = content.split('\n');
    const result: string[] = [`${this.color(this.theme.primary)}╔${'─'.repeat(width)}╗`];
    for (const line of lines) {
      const padding = width - line.length;
      result.push(`║${line}${' '.repeat(Math.max(0, padding))}║`);
    }
    result.push(`╚${'─'.repeat(width)}╝${this.reset()}`);
    return result.join('\n');
  }

  /**
   * 渲染工具列表
   * @param tools 工具数组
   * @returns 格式化后的工具列表
   */
  renderToolList(tools: Array<{ name: string; description: string }>): string {
    const header = `${this.color(this.theme.primary)}Available Tools:${this.reset()}`;
    const toolList = tools
      .map((t) => `  ${this.color(this.theme.info)}${t.name.padEnd(25)}${this.reset()}${t.description}`)
      .join('\n');
    return `${header}\n${toolList}`;
  }

  /**
   * 渲染帮助信息
   * @returns 格式化后的帮助框
   */
  renderHelp(): string {
    return this.renderBox(
      `${this.color(this.theme.info)}Available Commands:${this.reset()}

  /help              显示帮助信息
  /exit, /quit       退出程序
  /clear             清空对话历史
  /tools             列出所有可用工具
  /model [name]      切换 AI 模型
  /context           显示当前上下文信息
  /retry             重试上次失败的请求
  /permissions       显示当前权限状态`,
      55
    );
  }

  /**
   * 清屏
   * 使用 ANSI 转义序列清空终端屏幕
   */
  clearScreen(): void {
    process.stdout.write('\x1b[2J\x1b[H');
  }

  /**
   * 向上移动光标
   * @param lines 移动的行数
   */
  moveCursorUp(lines: number = 1): void {
    process.stdout.write(`\x1b[${lines}A`);
  }

  /**
   * 清除当前行
   */
  clearLine(): void {
    process.stdout.write('\x1b[2K');
  }

  /**
   * 启用终端回显
   * 用于密码输入等场景后恢复
   */
  enableEcho(): void {
    process.stdin.setRawMode?.(false);
  }

  /**
   * 禁用终端回显
   * 用于密码输入等场景
   */
  disableEcho(): void {
    process.stdin.setRawMode?.(true);
  }

  /**
   * 创建流式渲染器
   */
  createStream(): StreamingRenderer {
    return new StreamingRenderer();
  }

  /**
   * 写入流式内容到指定输出流
   * @param text 文本内容
   * @param outputStream 输出目标
   */
  writeStream(text: string, outputStream: NodeJS.WriteStream = process.stdout): void {
    outputStream.write(text);
  }

  /**
   * 渲染文件 Diff
   *
   * @param diff - 统一格式的 diff 行数组
   * @returns 格式化后的 diff 字符串
   */
  renderDiff(diff: string[]): string {
    const lines: string[] = [];

    for (const line of diff) {
      if (line.startsWith('@@')) {
        lines.push(this.color(this.theme.header) + line + this.reset());
      } else if (line.startsWith('---') || line.startsWith('+++')) {
        lines.push(this.color(this.theme.header) + line + this.reset());
      } else if (line.startsWith('+')) {
        lines.push(this.color(this.theme.success) + line + this.reset());
      } else if (line.startsWith('-')) {
        lines.push(this.color(this.theme.error) + line + this.reset());
      } else {
        lines.push(line);
      }
    }

    return lines.join('\n');
  }

  /**
   * 渲染确认提示
   *
   * @param message - 提示消息
   * @returns 格式化的确认提示
   */
  renderConfirmation(message: string): string {
    return `${this.color(this.theme.warning)}⚠ ${message}${this.reset()}`;
  }

  /**
   * 渲染流式块开始标记
   * @param label 块标签
   */
  renderStreamStart(label: string): string {
    return `\x1b[33m▌ ${label}...\x1b[0m\x1b[K`;
  }

  /**
   * 渲染加载动画帧
   * @param frame 当前帧索引
   */
  renderLoadingFrame(frame: number): string {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    return `\x1b[33m${frames[frame % frames.length]}\x1b[0m`;
  }
}

/**
 * 流式渲染器类
 *
 * 负责实时渲染流式输出，支持：
 * - 原地更新输出（覆盖之前的显示）
 * - 显示打字机效果
 * - 显示加载动画
 * - 显示 token 计数
 *
 * @example
 * const streamer = terminal.createStream();
 *
 * // 开始流式输出
 * streamer.start('thinking');
 *
 * // 更新输出内容
 * streamer.update('typing...', 15); // 15 tokens
 *
 * // 完成输出
 * streamer.finish('Final response');
 *
 * // 或者使用原生 WriteStream
 * terminal.writeStream('Hello ', process.stdout);
 * terminal.writeStream('World!', process.stdout);
 */
export class StreamingRenderer {
  private buffer: string = '';
  private lastLength: number = 0;
  private lineCount: number = 0;
  private startTime: number = 0;
  private output: NodeJS.WriteStream | null = null;

  /**
   * 开始流式输出
   * @param prefix 前缀文本（如 'thinking', 'typing'）
   * @param outputStream 输出目标（默认为 stdout）
   */
  start(prefix: string = '', outputStream: NodeJS.WriteStream = process.stdout): void {
    this.buffer = prefix;
    this.lastLength = 0;
    this.lineCount = 0;
    this.startTime = Date.now();
    this.output = outputStream;

    if (prefix) {
      outputStream.write(`\x1b[33m▌ ${prefix}\x1b[0m`);
    }
  }

  /**
   * 更新流式输出内容
   * 覆盖之前显示的内容
   *
   * @param text 新文本内容
   * @param tokens token 数量（可选，用于显示速度）
   */
  update(text: string, tokens?: number): void {
    if (!this.output) return;

    const elapsed = Date.now() - this.startTime;
    const speed = tokens && elapsed > 0 ? Math.round(tokens / (elapsed / 1000)) : 0;

    const prefix = tokens !== undefined ? `\x1b[33m▌\x1b[0m ` : '\x1b[2K';
    const suffix = tokens !== undefined ? ` \x1b[90m(${speed} tok/s)\x1b[0m` : '';

    const spaces = ' '.repeat(Math.max(0, this.lastLength - text.length));
    this.output.write(`${prefix}${text}${spaces}${suffix}\x1b[K`);

    this.buffer = text;
    this.lastLength = text.length;
  }

  /**
   * 完成流式输出
   * @param finalText 最终显示的完整文本
   * @param clearLoader 是否清除加载动画
   */
  finish(finalText: string, clearLoader: boolean = true): void {
    if (!this.output) return;

    const elapsed = Date.now() - this.startTime;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);

    if (clearLoader && this.lastLength > 0) {
      const back = `\x1b[${this.lineCount + 1}F\x1b[2K`;
      this.output.write(back);
    }

    if (mins > 0) {
      const timeStr = `\x1b[90m (${mins}m ${secs}s)\x1b[0m`;
      this.output.write(`\x1b[32m✓\x1b[0m ${finalText}${timeStr}\n`);
    } else if (secs > 0) {
      const timeStr = `\x1b[90m (${secs}s)\x1b[0m`;
      this.output.write(`\x1b[32m✓\x1b[0m ${finalText}${timeStr}\n`);
    } else {
      this.output.write(`\x1b[32m✓\x1b[0m ${finalText}\n`);
    }

    this.buffer = '';
    this.lastLength = 0;
    this.lineCount = 0;
    this.output = null;
  }

  /**
   * 写入一行（不覆盖）
   * @param text 文本内容
   * @param outputStream 输出目标
   */
  writeLine(text: string, outputStream: NodeJS.WriteStream = process.stdout): void {
    outputStream.write(text + '\n');
    this.lineCount++;
  }

  /**
   * 写入原始文本（用于流式 API 响应）
   * @param text 文本内容
   * @param outputStream 输出目标
   */
  writeRaw(text: string, outputStream: NodeJS.WriteStream = process.stdout): void {
    outputStream.write(text);
    this.buffer += text;
    this.lastLength = this.buffer.length;
  }

  /**
   * 取消流式输出
   */
  cancel(): void {
    if (!this.output) return;

    const back = `\x1b[${this.lineCount + 1}F\x1b[2K`;
    this.output.write(back);
    this.output.write('\n');

    this.buffer = '';
    this.lastLength = 0;
    this.lineCount = 0;
    this.output = null;
  }

  /**
   * 获取已缓冲的内容
   */
  getBuffer(): string {
    return this.buffer;
  }
}

/**
 * 创建流式渲染器实例
 * @returns 新的流式渲染器
 */
export function createStreamingRenderer(): StreamingRenderer {
  return new StreamingRenderer();
}

/**
 * 全局终端渲染器实例
 */
export const terminal = new TerminalRenderer();