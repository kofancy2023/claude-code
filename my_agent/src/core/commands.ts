import { terminal } from '../ui/terminal.js';
import { getAllProviders, getProviderInfo } from '../services/api/provider-factory.js';
import { toolRegistry } from '../tools/registry.js';
import type { Store } from '../state/store.js';
import type { AIProvider } from '../services/api/types.js';

/**
 * CLI 命令接口
 */
export interface CLICommand {
  /** 命令名称（不带斜杠） */
  name: string;
  /** 命令别名 */
  aliases?: string[];
  /** 命令描述 */
  description: string;
  /** 使用示例 */
  usage?: string;
  /** 执行命令 */
  execute: (args: string[], context: CommandContext) => Promise<void>;
}

/**
 * 命令执行上下文
 */
export interface CommandContext {
  /** 当前 AI 提供商客户端 */
  client: AIProvider;
  /** 状态存储 */
  store: Store;
}

/**
 * 命令注册表
 */
export class CommandRegistry {
  private commands: Map<string, CLICommand> = new Map();

  constructor() {
    this.registerBuiltInCommands();
  }

  /**
   * 注册命令
   */
  register(command: CLICommand): void {
    this.commands.set(command.name, command);
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.commands.set(alias, command);
      }
    }
  }

  /**
   * 获取命令
   */
  get(name: string): CLICommand | undefined {
    return this.commands.get(name);
  }

  /**
   * 获取所有命令
   */
  getAll(): CLICommand[] {
    return Array.from(this.commands.values()).filter(
      (cmd, index, arr) => arr.findIndex(c => c.name === cmd.name) === index
    );
  }

  /**
   * 检查是否为命令（以斜杠开头）
   */
  isCommand(input: string): boolean {
    return input.startsWith('/');
  }

  /**
   * 解析命令和参数
   */
  parse(input: string): { command: string; args: string[] } | null {
    if (!this.isCommand(input)) return null;

    const parts = input.slice(1).trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    return { command, args };
  }

  /**
   * 执行命令
   */
  async execute(input: string, context: CommandContext): Promise<boolean> {
    const parsed = this.parse(input);
    if (!parsed) return false;

    const command = this.get(parsed.command);
    if (!command) {
      console.log(terminal.renderError(`Unknown command: /${parsed.command}`));
      console.log(terminal.renderInfo('Type /help for available commands.'));
      return true;
    }

    try {
      await command.execute(parsed.args, context);
    } catch (error) {
      console.error(terminal.renderError(
        `Command error: ${error instanceof Error ? error.message : String(error)}`
      ));
    }

    return true;
  }

  /**
   * 注册内置命令
   */
  private registerBuiltInCommands(): void {
    // /help 命令
    this.register({
      name: 'help',
      aliases: ['h', '?'],
      description: '显示所有可用命令',
      usage: '/help [command]',
      execute: async (args) => {
        if (args.length > 0) {
          // 显示特定命令的帮助
          const cmd = this.get(args[0]);
          if (cmd) {
            console.log(terminal.renderDivider());
            console.log(terminal.renderInfo(`Command: /${cmd.name}`));
            console.log(terminal.renderInfo(`Description: ${cmd.description}`));
            if (cmd.usage) {
              console.log(terminal.renderInfo(`Usage: ${cmd.usage}`));
            }
            if (cmd.aliases && cmd.aliases.length > 0) {
              console.log(terminal.renderInfo(`Aliases: ${cmd.aliases.map(a => '/' + a).join(', ')}`));
            }
            console.log(terminal.renderDivider());
          } else {
            console.log(terminal.renderError(`Unknown command: /${args[0]}`));
          }
        } else {
          // 显示所有命令
          console.log(terminal.renderDivider());
          console.log(terminal.renderInfo('Available Commands:'));
          console.log();

          const commands = this.getAll();

          // 帮助命令
          const helpCmd = commands.find(c => c.name === 'help');
          if (helpCmd) {
            console.log(`  ${terminal.renderHighlight('/help')} [command]  ${helpCmd.description}`);
          }

          // 基础命令
          console.log();
          console.log(terminal.renderInfo('  Basic:'));
          for (const cmd of commands.filter(c => ['clear', 'model', 'tokens', 'history'].includes(c.name))) {
            const aliases = cmd.aliases ? ` (${cmd.aliases.map(a => '/' + a).join(', ')})` : '';
            console.log(`  ${terminal.renderHighlight('/' + cmd.name)}${aliases}  ${cmd.description}`);
          }

          // 工具命令
          console.log();
          console.log(terminal.renderInfo('  Tools:'));
          for (const cmd of commands.filter(c => ['tools', 'permissions'].includes(c.name))) {
            const aliases = cmd.aliases ? ` (${cmd.aliases.map(a => '/' + a).join(', ')})` : '';
            console.log(`  ${terminal.renderHighlight('/' + cmd.name)}${aliases}  ${cmd.description}`);
          }

          // 会话命令
          console.log();
          console.log(terminal.renderInfo('  Session:'));
          for (const cmd of commands.filter(c => ['save', 'sessions', 'load'].includes(c.name))) {
            const aliases = cmd.aliases ? ` (${cmd.aliases.map(a => '/' + a).join(', ')})` : '';
            console.log(`  ${terminal.renderHighlight('/' + cmd.name)}${aliases}  ${cmd.description}`);
          }

          console.log();
          console.log(terminal.renderDivider());
        }
      },
    });

    // /clear 命令
    this.register({
      name: 'clear',
      aliases: ['cls'],
      description: '清除对话历史',
      usage: '/clear',
      execute: async (_args, context) => {
        const messages = context.store.getMessages();
        if (messages.length === 0) {
          console.log(terminal.renderInfo('Conversation is already empty.'));
          return;
        }

        context.store.getState().messages = [];
        console.log(terminal.renderSuccess(`Cleared ${messages.length} messages.`));
      },
    });

    // /model 命令
    this.register({
      name: 'model',
      aliases: ['m'],
      description: '查看或切换 AI 模型',
      usage: '/model [provider] [model]',
      execute: async (args) => {
        if (args.length === 0) {
          // 显示当前模型
          const providers = getAllProviders();
          console.log(terminal.renderDivider());
          console.log(terminal.renderInfo('Supported Providers and Models:'));
          console.log();
          for (const provider of providers) {
            const info = getProviderInfo(provider);
            console.log(`  ${terminal.renderHighlight(provider.padEnd(15))} ${info.defaultModel}`);
          }
          console.log();
          console.log(terminal.renderInfo('Usage: /model <provider> [model]'));
          console.log(terminal.renderDivider());
        } else if (args.length === 1) {
          // 显示指定提供商的模型
          const provider = args[0].toLowerCase();
          try {
            const info = getProviderInfo(provider as any);
            console.log(terminal.renderDivider());
            console.log(terminal.renderInfo(`Provider: ${info.name}`));
            console.log(terminal.renderInfo(`Base URL: ${info.baseUrl}`));
            console.log(terminal.renderInfo(`Default Model: ${info.defaultModel}`));
            console.log(terminal.renderDivider());
          } catch {
            console.log(terminal.renderError(`Unknown provider: ${provider}`));
            console.log(terminal.renderInfo('Use /model without arguments to see all providers.'));
          }
        }
      },
    });

    // /tokens 命令
    this.register({
      name: 'tokens',
      aliases: ['t'],
      description: '查看当前对话的 token 使用统计',
      usage: '/tokens',
      execute: async (_args, context) => {
        const messages = context.store.getMessages();

        // 简单估算 token 数量（实际应使用 tokenizer）
        const estimateTokens = (text: string): number => {
          return Math.ceil(text.length / 4);
        };

        let totalTokens = 0;
        const breakdown: { role: string; tokens: number }[] = [];

        for (const msg of messages) {
          const content = typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content);
          const tokens = estimateTokens(content);
          totalTokens += tokens;
          breakdown.push({ role: msg.role, tokens });
        }

        console.log(terminal.renderDivider());
        console.log(terminal.renderInfo('Token Usage Statistics:'));
        console.log();
        console.log(`  ${terminal.renderHighlight('Total Messages:'.padEnd(20))} ${messages.length}`);
        console.log(`  ${terminal.renderHighlight('Estimated Tokens:'.padEnd(20))} ${totalTokens}`);
        console.log();
        console.log(terminal.renderInfo('  Breakdown:'));
        for (const item of breakdown) {
          console.log(`    ${item.role.padEnd(12)} ${item.tokens} tokens`);
        }
        console.log();
        console.log(terminal.renderInfo('  Note: Token count is estimated (1 token ≈ 4 characters).'));
        console.log(terminal.renderDivider());
      },
    });

    // /tools 命令
    this.register({
      name: 'tools',
      aliases: ['tool'],
      description: '列出所有已注册的工具',
      usage: '/tools [search]',
      execute: async (args) => {
        const tools = toolRegistry.getAll();
        const searchTerm = args.length > 0 ? args[0].toLowerCase() : '';

        const filteredTools = searchTerm
          ? tools.filter(t =>
              t.name.toLowerCase().includes(searchTerm) ||
              t.description.toLowerCase().includes(searchTerm)
            )
          : tools;

        console.log(terminal.renderDivider());
        console.log(terminal.renderInfo(`Registered Tools: ${filteredTools.length}`));
        if (searchTerm) {
          console.log(terminal.renderInfo(`(filtered by: "${searchTerm}")`));
        }
        console.log();

        for (const tool of filteredTools) {
          console.log(`  ${terminal.renderHighlight(tool.name)}`);
          console.log(`    ${tool.description}`);
          const params = Object.keys(tool.inputSchema.properties || {});
          if (params.length > 0) {
            console.log(`    Parameters: ${params.join(', ')}`);
          }
          console.log();
        }

        console.log(terminal.renderDivider());
      },
    });

    // /history 命令
    this.register({
      name: 'history',
      aliases: ['hist'],
      description: '显示对话历史',
      usage: '/history [count]',
      execute: async (args, context) => {
        const messages = context.store.getMessages();
        const count = args.length > 0 ? parseInt(args[0], 10) : messages.length;
        const recentMessages = messages.slice(-count);

        console.log(terminal.renderDivider());
        console.log(terminal.renderInfo(`Recent ${recentMessages.length} of ${messages.length} messages:`));
        console.log();

        for (let i = 0; i < recentMessages.length; i++) {
          const msg = recentMessages[i];
          const content = typeof msg.content === 'string'
            ? msg.content.slice(0, 100) + (msg.content.length > 100 ? '...' : '')
            : '[Complex content]';
          console.log(`  [${i + 1}] ${terminal.renderHighlight(msg.role.padEnd(10))} ${content}`);
        }

        console.log(terminal.renderDivider());
      },
    });

    // /permissions 命令
    this.register({
      name: 'permissions',
      aliases: ['perm'],
      description: '查看权限设置',
      usage: '/permissions',
      execute: async () => {
        console.log(terminal.renderDivider());
        console.log(terminal.renderInfo('Permission settings are managed by the PermissionSystem.'));
        console.log(terminal.renderInfo('Use permission configuration files for customization.'));
        console.log(terminal.renderDivider());
      },
    });

    // /mcp 命令 - MCP 服务器管理
    this.register({
      name: 'mcp',
      aliases: [],
      description: '管理 MCP 服务器连接',
      usage: '/mcp [connect|disconnect|list|tools] [options]',
      execute: async (args) => {
        const { mcpIntegration } = await import('../mcp/integration.js');

        console.log(terminal.renderDivider());
        console.log(terminal.renderInfo('MCP Server Management'));
        console.log();

        if (args.length === 0 || args[0] === 'list') {
          // 列出连接状态
          console.log(`  Status: ${mcpIntegration.isConnected() ? terminal.renderSuccess('Connected') : terminal.renderError('Disconnected')}`);
          console.log(`  Servers: ${mcpIntegration.getClientCount()}`);
          console.log(`  Registered Tools: ${mcpIntegration.getToolCount()}`);
          console.log();

          // 列出已注册的 MCP 工具
          const tools = mcpIntegration.getRegisteredTools();
          if (tools.length > 0) {
            console.log('  MCP Tools:');
            for (const tool of tools) {
              console.log(`    ${terminal.renderHighlight(tool.name)}`);
              console.log(`      Server: ${tool.serverId}`);
              console.log(`      Original: ${tool.originalName}`);
            }
          }

          console.log();
          console.log('  Usage:');
          console.log('    /mcp connect <transport> <url>   - 连接 MCP 服务器');
          console.log('    /mcp disconnect                   - 断开所有连接');
          console.log('    /mcp list                         - 显示连接状态');
          console.log('    /mcp tools                        - 列出 MCP 工具');
        } else if (args[0] === 'tools') {
          // 列出 MCP 工具详情
          const tools = mcpIntegration.getRegisteredTools();
          console.log(`  Total MCP Tools: ${tools.length}`);
          console.log();

          for (const tool of tools) {
            console.log(`  ${terminal.renderHighlight(tool.name)}`);
            console.log(`    Server: ${tool.serverId}`);
            console.log(`    Description: ${tool.description}`);
            console.log();
          }
        } else if (args[0] === 'disconnect') {
          // 断开连接
          await mcpIntegration.disconnect();
          console.log(terminal.renderSuccess('Disconnected from all MCP servers'));
        } else if (args[0] === 'connect' && args.length >= 3) {
          // 连接新的 MCP 服务器
          const transport = args[1] as 'http' | 'websocket' | 'stdio';
          const url = args[2];

          if (!['http', 'websocket', 'stdio'].includes(transport)) {
            console.log(terminal.renderError(`Invalid transport: ${transport}`));
            console.log('Valid transports: http, websocket, stdio');
            return;
          }

          console.log(terminal.renderInfo(`Connecting to ${transport}://${url}...`));

          // 注意：实际连接需要配置服务器
          console.log(terminal.renderWarning('Server configuration required. Use MCPIntegrationService directly.'));
        } else {
          console.log(terminal.renderError('Unknown subcommand'));
          console.log('Usage: /mcp [connect|disconnect|list|tools]');
        }

        console.log(terminal.renderDivider());
      },
    });
  }
}

/**
 * 全局命令注册表实例
 */
export const commandRegistry = new CommandRegistry();
