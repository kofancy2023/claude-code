import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import { toolRegistry } from '../tools/registry.js';
import { commandRegistry } from './commands.js';

/**
 * 补全项类型
 */
interface CompletionItem {
  /** 显示文本 */
  text: string;
  /** 描述信息 */
  description?: string;
  /** 类型图标 */
  type?: 'command' | 'tool' | 'file' | 'directory' | 'setting';
}

/**
 * Readline 增强器配置选项
 */
export interface ReadlineEnhancerOptions {
  /** 历史文件路径 */
  historyPath?: string;
  /** 最大历史记录条数 */
  maxHistorySize?: number;
  /** 是否启用文件路径补全 */
  enablePathCompletion?: boolean;
  /** 是否启用工具名补全 */
  enableToolCompletion?: boolean;
  /** 是否启用命令补全 */
  enableCommandCompletion?: boolean;
}

/**
 * Readline 增强器
 *
 * 为 REPL 提供高级交互功能：
 * - 命令历史记录（持久化，支持上下键导航）
 * - 智能补全（命令、工具、文件路径）
 * - 多行输入支持
 * - 自定义键盘快捷键
 *
 * @example
 * const enhancer = new ReadlineEnhancer({ historyPath: './.history' });
 * enhancer.attach(rl);
 *
 * // 设置补全回调
 * enhancer.onComplete((line) => {
 *   return enhancer.getCompletions(line);
 * });
 */
export class ReadlineEnhancer {
  /** 历史记录列表 */
  private history: string[] = [];
  /** 历史记录文件路径 */
  private historyPath: string;
  /** 最大历史记录条数 */
  private maxHistorySize: number;
  /** 是否启用文件路径补全 */
  private enablePathCompletion: boolean;
  /** 是否启用工具补全 */
  private enableToolCompletion: boolean;
  /** 是否启用命令补全 */
  private enableCommandCompletion: boolean;
  /** 内部 readline.Interface 实例 */
  private rl: readline.Interface | null = null;
  /** 原始 completer 函数 */
  private originalCompleter: readline.Completer | null = null;

  constructor(options: ReadlineEnhancerOptions = {}) {
    const {
      historyPath = path.join(process.cwd(), '.repl-history'),
      maxHistorySize = 1000,
      enablePathCompletion = true,
      enableToolCompletion = true,
      enableCommandCompletion = true,
    } = options;

    this.historyPath = historyPath;
    this.maxHistorySize = maxHistorySize;
    this.enablePathCompletion = enablePathCompletion;
    this.enableToolCompletion = enableToolCompletion;
    this.enableCommandCompletion = enableCommandCompletion;

    this.loadHistory();
  }

  /**
   * 加载历史记录
   * 从文件系统中读取历史记录
   */
  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyPath)) {
        const content = fs.readFileSync(this.historyPath, 'utf-8');
        this.history = content.split('\n').filter(line => line.trim() !== '');
        if (this.history.length > this.maxHistorySize) {
          this.history = this.history.slice(-this.maxHistorySize);
        }
      }
    } catch (error) {
      console.warn('Failed to load history:', error);
      this.history = [];
    }
  }

  /**
   * 保存历史记录
   * 将历史记录写入文件
   */
  private saveHistory(): void {
    try {
      const dir = path.dirname(this.historyPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.historyPath, this.history.join('\n'), 'utf-8');
    } catch (error) {
      console.warn('Failed to save history:', error);
    }
  }

  /**
   * 添加历史记录
   *
   * @param line - 要添加的命令行
   */
  addHistory(line: string): void {
    if (!line.trim()) return;

    const lastHistory = this.history[this.history.length - 1];
    if (lastHistory === line) return;

    this.history.push(line);

    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }

    this.saveHistory();
  }

  /**
   * 获取历史记录
   *
   * @returns 历史记录列表
   */
  getHistory(): string[] {
    return [...this.history];
  }

  /**
   * 清空历史记录
   */
  clearHistory(): void {
    this.history = [];
    this.saveHistory();
  }

  /**
   * 搜索历史记录
   *
   * @param prefix - 搜索前缀
   * @returns 匹配的历史记录
   */
  searchHistory(prefix: string): string[] {
    return this.history.filter(line => line.startsWith(prefix));
  }

  /**
   * 获取所有命令补全项
   */
  private getCommandCompletions(): CompletionItem[] {
    const items: CompletionItem[] = [];

    if (this.enableCommandCompletion) {
      const commands = commandRegistry.getCommands();
      for (const cmd of commands) {
        items.push({
          text: `/${cmd.name}`,
          description: cmd.description,
          type: 'command',
        });
      }
    }

    return items;
  }

  /**
   * 获取所有工具补全项
   */
  private getToolCompletions(): CompletionItem[] {
    const items: CompletionItem[] = [];

    if (this.enableToolCompletion) {
      const tools = toolRegistry.getAll();
      for (const tool of tools) {
        items.push({
          text: tool.name,
          description: tool.description.substring(0, 50),
          type: 'tool',
        });
      }
    }

    return items;
  }

  /**
   * 获取文件路径补全
   *
   * @param partial - 部分路径
   * @returns 匹配的文件/目录
   */
  private getPathCompletions(partial: string): CompletionItem[] {
    const items: CompletionItem[] = [];

    if (!this.enablePathCompletion) return items;

    try {
      const dir = path.dirname(partial);
      const basename = path.basename(partial);
      const fullDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);

      if (!fs.existsSync(fullDir)) return items;

      const entries = fs.readdirSync(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(basename)) {
          const fullPath = path.join(fullDir, entry.name);
          items.push({
            text: path.join(dir, entry.name) + (entry.isDirectory() ? '/' : ''),
            description: fullPath,
            type: entry.isDirectory() ? 'directory' : 'file',
          });
        }
      }
    } catch {
      // 忽略文件访问错误
    }

    return items;
  }

  /**
   * 获取所有补全项
   *
   * @param line - 当前输入行
   * @returns 补全项数组
   */
  getCompletions(line: string): CompletionItem[] {
    const items: CompletionItem[] = [];

    if (line.startsWith('/')) {
      items.push(...this.getCommandCompletions());
    } else if (line.startsWith('!')) {
      // Bash commands
      items.push(...this.getPathCompletions(line.slice(1)));
    } else if (line.includes(' ')) {
      const [firstWord] = line.split(' ');
      if (firstWord === 'load' || firstWord === 'save') {
        items.push(...this.getPathCompletions(line.split(' ')[1] || ''));
      } else if (toolRegistry.get(firstWord)) {
        items.push(...this.getToolCompletions());
      }
    } else {
      items.push(...this.getCommandCompletions());
      items.push(...this.getToolCompletions());
    }

    return items;
  }

  /**
   * 绑定到 readline.Interface
   *
   * @param rl - readline.Interface 实例
   */
  attach(rl: readline.Interface): void {
    this.rl = rl;

    this.originalCompleter = rl.completer;

    rl.completer = (line: string, callback: (err: Error | null, result: [string[], string]) => void) => {
      const completions = this.getCompletions(line);
      const hits = completions.map(c => c.text);

      if (hits.length === 1 && hits[0] !== line) {
        callback(null, [hits, line]);
      } else {
        callback(null, [hits, line]);
      }
    };

    let historyIndex = this.history.length;
    let currentLine = '';
    let inMultiLine = false;
    let multiLineBuffer = '';

    rl.on('line', (input: string) => {
      const trimmed = input.trim();

      if (trimmed === '' && !inMultiLine) {
        return;
      }

      if (trimmed === 'exit' || trimmed === 'quit') {
        return;
      }

      if (!trimmed.startsWith('/') && !trimmed.startsWith('!')) {
        this.addHistory(input);
        historyIndex = this.history.length;
      }
    });
  }

  /**
   * 解绑 readline.Interface
   */
  detach(): void {
    if (this.rl && this.originalCompleter) {
      this.rl.completer = this.originalCompleter;
      this.rl = null;
      this.originalCompleter = null;
    }
  }

  /**
   * 创建补全函数
   *
   * 用于直接传递给 readline.createInterface
   *
   * @returns 补全函数
   */
  createCompleter(): (line: string) => [string[], string] {
    return (line: string): [string[], string] => {
      const completions = this.getCompletions(line);
      return [completions.map(c => c.text), line];
    };
  }
}

/**
 * 全局 ReadlineEnhancer 实例
 */
export const readlineEnhancer = new ReadlineEnhancer();
