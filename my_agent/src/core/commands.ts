import type { Message } from '../types';
import { sessionManager } from '../services/session';
import { terminal } from '../ui/terminal';
import type { AIProvider } from '../services/api/types.js';
import type { Store } from '../state/store.js';

/**
 * 命令上下文接口
 */
export interface CommandContext {
  client: AIProvider;
  store: Store;
}

/**
 * 命令接口
 */
export interface Command {
  name: string;
  description: string;
  usage?: string;
  execute: (args: string[], context: CommandContext) => Promise<void>;
}

/**
 * 命令注册表
 * 管理所有可用的命令
 */
export class CommandRegistry {
  private commands: Map<string, Command> = new Map();

  /**
   * 注册命令
   */
  register(command: Command): void {
    this.commands.set(command.name, command);
  }

  /**
   * 检查是否为命令
   */
  isCommand(input: string): boolean {
    return input.startsWith('/');
  }

  /**
   * 解析命令
   */
  parse(input: string): { command: string; args: string[] } | null {
    if (!this.isCommand(input)) {
      return null;
    }

    const parts = input.slice(1).split(' ');
    const command = parts[0];
    const args = parts.slice(1);

    return { command, args };
  }

  /**
   * 获取所有命令
   */
  getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * 获取命令名称列表
   */
  getCommands(): string[] {
    return Array.from(this.commands.keys());
  }

  /**
   * 执行命令
   */
  async execute(input: string, context: CommandContext): Promise<void> {
    const parsed = this.parse(input);
    if (!parsed) {
      return;
    }

    const { command, args } = parsed;
    const cmd = this.commands.get(command);

    if (cmd) {
      await cmd.execute(args, context);
    } else {
      console.log(terminal.renderError(`Unknown command: ${command}`));
      console.log(terminal.renderInfo('Use /help for available commands'));
    }
  }
}

/**
 * 全局命令注册表实例
 */
export const commandRegistry = new CommandRegistry();

/**
 * 会话管理命令
 */
export class SessionCommands {
  /**
   * 列出所有会话
   */
  static async listSessions() {
    try {
      const sessions = await sessionManager.list();
      
      if (sessions.length === 0) {
        console.log(terminal.renderInfo('No sessions found'));
        return;
      }

      console.log(terminal.renderTitle('Saved Sessions:'));
      console.log('');

      sessions.forEach((session, index) => {
        console.log(`${terminal.renderInfo(`[${index + 1}]`)} ${terminal.renderBold(session.name)}`);
        console.log(`  ID: ${session.id}`);
        console.log(`  Created: ${new Date(session.createdAt).toLocaleString()}`);
        console.log(`  Updated: ${new Date(session.updatedAt).toLocaleString()}`);
        console.log(`  Messages: ${session.metadata.messageCount}`);
        if (session.metadata.provider) {
          console.log(`  Provider: ${session.metadata.provider}`);
        }
        if (session.metadata.model) {
          console.log(`  Model: ${session.metadata.model}`);
        }
        console.log('');
      });
    } catch (error) {
      console.error(terminal.renderError(`Error listing sessions: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * 创建新会话
   */
  static async createSession(name?: string, provider?: string, model?: string) {
    try {
      const session = sessionManager.createSession({ name, provider, model });
      await sessionManager.save(session);
      console.log(terminal.renderSuccess(`Created new session: ${session.name} (ID: ${session.id})`));
      return session;
    } catch (error) {
      console.error(terminal.renderError(`Error creating session: ${error instanceof Error ? error.message : String(error)}`));
      return null;
    }
  }

  /**
   * 加载会话
   */
  static async loadSession(sessionId: string) {
    try {
      const session = await sessionManager.load(sessionId);
      if (!session) {
        console.error(terminal.renderError(`Session not found: ${sessionId}`));
        return null;
      }
      console.log(terminal.renderSuccess(`Loaded session: ${session.name}`));
      return session;
    } catch (error) {
      console.error(terminal.renderError(`Error loading session: ${error instanceof Error ? error.message : String(error)}`));
      return null;
    }
  }

  /**
   * 删除会话
   */
  static async deleteSession(sessionId: string) {
    try {
      const success = await sessionManager.delete(sessionId);
      if (success) {
        console.log(terminal.renderSuccess(`Deleted session: ${sessionId}`));
      } else {
        console.error(terminal.renderError(`Session not found: ${sessionId}`));
      }
      return success;
    } catch (error) {
      console.error(terminal.renderError(`Error deleting session: ${error instanceof Error ? error.message : String(error)}`));
      return false;
    }
  }

  /**
   * 重命名会话
   */
  static async renameSession(sessionId: string, newName: string) {
    try {
      const session = await sessionManager.load(sessionId);
      if (!session) {
        console.error(terminal.renderError(`Session not found: ${sessionId}`));
        return null;
      }
      session.name = newName;
      await sessionManager.save(session);
      console.log(terminal.renderSuccess(`Renamed session to: ${newName}`));
      return session;
    } catch (error) {
      console.error(terminal.renderError(`Error renaming session: ${error instanceof Error ? error.message : String(error)}`));
      return null;
    }
  }

  /**
   * 导出会话
   */
  static async exportSession(sessionId: string, outputPath?: string) {
    try {
      const jsonContent = await sessionManager.exportSession(sessionId);
      if (!jsonContent) {
        console.error(terminal.renderError(`Session not found: ${sessionId}`));
        return null;
      }

      if (outputPath) {
        await Bun.write(outputPath, jsonContent);
        console.log(terminal.renderSuccess(`Exported session to: ${outputPath}`));
      } else {
        console.log(jsonContent);
      }
      return jsonContent;
    } catch (error) {
      console.error(terminal.renderError(`Error exporting session: ${error instanceof Error ? error.message : String(error)}`));
      return null;
    }
  }

  /**
   * 导入会话
   */
  static async importSession(inputPath: string) {
    try {
      const jsonContent = await Bun.read(inputPath, 'utf-8');
      const session = await sessionManager.importSession(jsonContent);
      console.log(terminal.renderSuccess(`Imported session: ${session.name} (ID: ${session.id})`));
      return session;
    } catch (error) {
      console.error(terminal.renderError(`Error importing session: ${error instanceof Error ? error.message : String(error)}`));
      return null;
    }
  }
}

/**
 * 帮助命令
 */
export class HelpCommands {
  /**
   * 显示帮助信息
   */
  static showHelp() {
    console.log(terminal.renderTitle('My Agent Help'));
    console.log('');
    console.log(terminal.renderBold('Commands:'));
    console.log('');
    console.log('  /help                    - Show this help message');
    console.log('  /session list            - List all saved sessions');
    console.log('  /session create [name]   - Create a new session');
    console.log('  /session load <id>       - Load a session by ID');
    console.log('  /session delete <id>     - Delete a session by ID');
    console.log('  /session rename <id> <name> - Rename a session');
    console.log('  /session export <id> [path] - Export a session');
    console.log('  /session import <path>   - Import a session');
    console.log('  /clear                   - Clear the terminal');
    console.log('  /exit                    - Exit My Agent');
    console.log('');
    console.log(terminal.renderBold('Examples:'));
    console.log('');
    console.log('  /session create "My Project"');
    console.log('  /session load session-12345');
    console.log('  /session export session-12345 session.json');
    console.log('');
  }

  /**
   * 显示会话管理帮助
   */
  static showSessionHelp() {
    console.log(terminal.renderTitle('Session Management Help'));
    console.log('');
    console.log(terminal.renderBold('Session Commands:'));
    console.log('');
    console.log('  /session list            - List all saved sessions');
    console.log('  /session create [name]   - Create a new session');
    console.log('  /session load <id>       - Load a session by ID');
    console.log('  /session delete <id>     - Delete a session by ID');
    console.log('  /session rename <id> <name> - Rename a session');
    console.log('  /session export <id> [path] - Export a session');
    console.log('  /session import <path>   - Import a session');
    console.log('');
  }
}