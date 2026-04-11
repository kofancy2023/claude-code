/**
 * 权限类型定义
 * - read: 读取文件/数据
 * - write: 写入文件/数据
 * - execute: 执行命令
 * - network: 网络访问
 * - env: 环境变量访问
 */
export type Permission = 'read' | 'write' | 'execute' | 'network' | 'env';

/**
 * 权限检查上下文
 * 包含需要检查的操作信息
 */
export interface PermissionContext {
  /** 工具名称 */
  toolName: string;
  /** 操作类型 */
  action: string;
  /** 操作参数 */
  params: Record<string, unknown>;
}

/**
 * 权限规则配置接口
 * 用于从配置文件加载权限规则
 */
export interface PermissionRule {
  /** 工具名称，'*' 表示所有工具 */
  tool?: string;
  /** 操作类型 */
  action?: string;
  /** 命令前缀（仅对 BashTool 有效） */
  command?: string;
  /** 是否允许（true）或拒绝（false） */
  allow: boolean;
}

/**
 * 权限配置文件结构
 */
export interface PermissionConfig {
  /** 默认权限模式: 'allow_all' | 'deny_all' | 'custom' */
  defaultMode: 'allow_all' | 'deny_all' | 'custom';
  /** 允许的工具列表 */
  allowedTools?: string[];
  /** 拒绝的工具列表 */
  deniedTools?: string[];
  /** 允许的命令前缀列表 */
  allowedCommands?: string[];
  /** 是否允许网络访问 */
  allowNetwork?: boolean;
  /** 是否允许环境变量访问 */
  allowEnvAccess?: boolean;
  /** 自定义规则 */
  rules?: PermissionRule[];
}

/**
 * 权限系统类
 *
 * 用于控制 Agent 可以执行的操作：
 * - 工具访问控制（白名单/黑名单）
 * - 命令执行控制（仅允许特定命令）
 * - 网络访问控制
 * - 环境变量访问控制
 * - 配置文件加载支持
 *
 * @example
 * // 默认配置（允许所有）
 * const perm = new PermissionSystem();
 *
 * // 从配置文件加载
 * const perm = PermissionSystem.fromConfig({
 *   defaultMode: 'deny_all',
 *   allowedTools: ['FileReadTool', 'BashTool'],
 *   allowedCommands: ['git', 'ls'],
 *   allowNetwork: true,
 * });
 *
 * // 保存配置到文件
 * perm.saveToFile('./permissions.json');
 *
 * // 从文件加载配置
 * const loaded = PermissionSystem.fromFile('./permissions.json');
 */
export class PermissionSystem {
  /** 允许的工具列表，'*' 表示允许所有工具 */
  private allowedTools: Set<string> = new Set();
  /** 拒绝的工具列表 */
  private deniedTools: Set<string> = new Set();
  /** 允许的命令前缀列表 */
  private allowedCommands: Set<string> = new Set();
  /** 是否允许网络访问 */
  private networkEnabled: boolean = true;
  /** 是否允许访问环境变量 */
  private envAccessEnabled: boolean = true;
  /** 自定义规则列表 */
  private rules: PermissionRule[] = [];
  /** 当前权限模式 */
  private mode: 'allow_all' | 'deny_all' | 'custom' = 'allow_all';
  /** 配置文件路径 */
  private configPath: string | null = null;

  constructor() {
    this.loadDefaultPermissions();
  }

  /**
   * 从配置对象创建权限系统
   * @param config 权限配置对象
   */
  static fromConfig(config: PermissionConfig): PermissionSystem {
    const perm = new PermissionSystem();
    perm.loadFromConfig(config);
    return perm;
  }

  /**
   * 从配置文件加载权限规则
   * @param filePath 配置文件路径（JSON 或 YAML）
   */
  static fromFile(filePath: string): PermissionSystem {
    const perm = new PermissionSystem();
    perm.loadFromFile(filePath);
    return perm;
  }

  /**
   * 加载权限配置
   * @param config 权限配置对象
   */
  loadFromConfig(config: PermissionConfig): void {
    this.mode = config.defaultMode || 'allow_all';
    this.allowedTools.clear();
    this.deniedTools.clear();
    this.allowedCommands.clear();

    switch (this.mode) {
      case 'allow_all':
        this.allowAllTools();
        break;
      case 'deny_all':
        this.denyAllTools();
        break;
      case 'custom':
        if (config.allowedTools) {
          for (const tool of config.allowedTools) {
            this.allowedTools.add(tool);
          }
        }
        if (config.deniedTools) {
          for (const tool of config.deniedTools) {
            this.deniedTools.add(tool);
          }
        }
        break;
    }

    if (config.allowedCommands) {
      for (const cmd of config.allowedCommands) {
        this.allowedCommands.add(cmd);
      }
    }

    this.networkEnabled = config.allowNetwork ?? true;
    this.envAccessEnabled = config.allowEnvAccess ?? true;

    if (config.rules) {
      this.rules = [...config.rules];
    }
  }

  /**
   * 从文件加载权限配置
   * @param filePath 配置文件路径
   */
  loadFromFile(filePath: string): void {
    try {
      const fs = require('fs');
      const path = require('path');

      const absolutePath = path.resolve(filePath);
      const content = fs.readFileSync(absolutePath, 'utf-8');
      const ext = path.extname(absolutePath).toLowerCase();

      let config: PermissionConfig;

      if (ext === '.json' || ext === '.jsonc') {
        config = JSON.parse(content);
      } else if (ext === '.yaml' || ext === '.yml') {
        const yaml = require('yaml');
        config = yaml.parse(content);
      } else {
        config = JSON.parse(content);
      }

      this.configPath = absolutePath;
      this.loadFromConfig(config);
    } catch (error) {
      throw new Error(`Failed to load permission config from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 保存当前配置到文件
   * @param filePath 配置文件路径
   */
  saveToFile(filePath: string): void {
    const config = this.toConfig();
    const fs = require('fs');
    const path = require('path');

    const absolutePath = path.resolve(filePath);
    const ext = path.extname(absolutePath).toLowerCase();

    let content: string;
    if (ext === '.yaml' || ext === '.yml') {
      const yaml = require('yaml');
      content = yaml.stringify(config);
    } else {
      content = JSON.stringify(config, null, 2);
    }

    fs.writeFileSync(absolutePath, content, 'utf-8');
    this.configPath = absolutePath;
  }

  /**
   * 将当前配置转换为配置对象
   */
  toConfig(): PermissionConfig {
    return {
      defaultMode: this.mode,
      allowedTools: Array.from(this.allowedTools).filter(t => t !== '*'),
      deniedTools: Array.from(this.deniedTools),
      allowedCommands: Array.from(this.allowedCommands),
      allowNetwork: this.networkEnabled,
      allowEnvAccess: this.envAccessEnabled,
      rules: this.rules.length > 0 ? this.rules : undefined,
    };
  }

  /**
   * 加载默认权限配置
   * 默认允许所有工具和网络访问
   */
  private loadDefaultPermissions(): void {
    this.mode = 'allow_all';
    this.allowAllTools();
    this.allowNetworkAccess(true);
    this.enableEnvAccess(true);
  }

  /**
   * 允许使用指定工具
   * @param toolName 工具名称
   */
  allowTool(toolName: string): void {
    this.allowedTools.add(toolName);
    this.deniedTools.delete(toolName);
    if (this.mode === 'deny_all') {
      this.mode = 'custom';
    }
  }

  /**
   * 拒绝使用指定工具
   * @param toolName 工具名称
   */
  denyTool(toolName: string): void {
    this.deniedTools.add(toolName);
    this.allowedTools.delete(toolName);
    if (this.mode === 'allow_all') {
      this.mode = 'custom';
    }
  }

  /**
   * 允许执行指定命令（支持前缀匹配）
   * @param command 命令前缀，如 'git', 'ls', 'npm'
   */
  allowCommand(command: string): void {
    this.allowedCommands.add(command);
  }

  /**
   * 拒绝执行指定命令
   * @param command 命令前缀
   */
  denyCommand(command: string): void {
    this.allowedCommands.delete(command);
  }

  /**
   * 设置是否允许网络访问
   * @param enabled true=允许，false=拒绝
   */
  allowNetworkAccess(enabled: boolean): void {
    this.networkEnabled = enabled;
  }

  /**
   * 设置是否允许访问环境变量
   * @param enabled true=允许，false=拒绝
   */
  enableEnvAccess(enabled: boolean): void {
    this.envAccessEnabled = enabled;
  }

  /**
   * 允许所有工具（设置为通配符）
   */
  allowAllTools(): void {
    this.mode = 'allow_all';
    this.allowedTools.clear();
    this.deniedTools.clear();
    this.allowedTools.add('*');
  }

  /**
   * 拒绝所有工具（清空白名单）
   */
  denyAllTools(): void {
    this.mode = 'deny_all';
    this.allowedTools.clear();
    this.deniedTools.clear();
  }

  /**
   * 添加自定义规则
   * @param rule 权限规则
   */
  addRule(rule: PermissionRule): void {
    this.rules.push(rule);
  }

  /**
   * 清除所有自定义规则
   */
  clearRules(): void {
    this.rules = [];
  }

  /**
   * 检查工具是否被允许
   * @param toolName 工具名称
   * @returns 是否允许
   */
  isToolAllowed(toolName: string): boolean {
    if (this.allowedTools.has('*')) return true;
    if (this.deniedTools.has(toolName)) return false;
    return this.allowedTools.has(toolName);
  }

  /**
   * 检查命令是否被允许
   * 支持命令前缀匹配
   * @param command 要检查的命令
   * @returns 是否允许
   */
  isCommandAllowed(command: string): boolean {
    if (this.allowedCommands.has('*')) return true;
    for (const allowed of this.allowedCommands) {
      if (command.startsWith(allowed)) return true;
    }
    return this.allowedCommands.size === 0;
  }

  /**
   * 检查是否允许网络访问
   * @returns 是否允许网络访问
   */
  hasNetworkAccess(): boolean {
    return this.networkEnabled;
  }

  /**
   * 检查是否允许访问环境变量
   * @returns 是否允许环境变量访问
   */
  hasEnvAccess(): boolean {
    return this.envAccessEnabled;
  }

  /**
   * 执行完整的权限检查
   * @param context 权限检查上下文
   * @returns 检查结果，包含是否允许及原因
   */
  checkPermission(context: PermissionContext): PermissionCheckResult {
    if (!this.isToolAllowed(context.toolName)) {
      return {
        allowed: false,
        reason: `Tool '${context.toolName}' is not allowed. Add it with permissions.allowTool('${context.toolName}')`,
      };
    }

    if (context.toolName === 'BashTool' && context.action === 'execute') {
      const command = context.params.command as string;
      if (!this.isCommandAllowed(command)) {
        return {
          allowed: false,
          reason: `Command '${command}' is not allowed.`,
        };
      }
    }

    if (context.toolName === 'WebSearchTool' && !this.hasNetworkAccess()) {
      return {
        allowed: false,
        reason: 'Network access is disabled. Enable with permissions.allowNetworkAccess(true)',
      };
    }

    if (context.action === 'env' && !this.hasEnvAccess()) {
      return {
        allowed: false,
        reason: 'Environment variable access is disabled.',
      };
    }

    for (const rule of this.rules) {
      if (rule.tool && rule.tool !== context.toolName) continue;
      if (rule.action && rule.action !== context.action) continue;
      if (rule.command) {
        const cmd = context.params.command as string;
        if (cmd && !cmd.startsWith(rule.command)) continue;
      }
      return {
        allowed: rule.allow,
        reason: rule.allow ? undefined : `Rule denied: ${JSON.stringify(rule)}`,
      };
    }

    return { allowed: true };
  }

  /**
   * 获取当前权限状态
   * @returns 权限状态对象
   */
  getStatus(): PermissionStatus {
    return {
      mode: this.mode,
      allowedTools: Array.from(this.allowedTools),
      deniedTools: Array.from(this.deniedTools),
      allowedCommands: Array.from(this.allowedCommands),
      allowNetwork: this.networkEnabled,
      allowEnvAccess: this.envAccessEnabled,
      rulesCount: this.rules.length,
      configPath: this.configPath,
    };
  }

  /**
   * 重置权限系统到默认状态
   * 默认：允许所有工具和网络访问
   */
  reset(): void {
    this.allowedTools.clear();
    this.deniedTools.clear();
    this.allowedCommands.clear();
    this.rules = [];
    this.networkEnabled = true;
    this.envAccessEnabled = true;
    this.configPath = null;
    this.loadDefaultPermissions();
  }
}

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  /** 是否允许操作 */
  allowed: boolean;
  /** 如果拒绝，原因是什么 */
  reason?: string;
}

/**
 * 权限系统状态
 */
export interface PermissionStatus {
  /** 当前权限模式 */
  mode: 'allow_all' | 'deny_all' | 'custom';
  /** 允许的工具列表 */
  allowedTools: string[];
  /** 拒绝的工具列表 */
  deniedTools: string[];
  /** 允许的命令列表 */
  allowedCommands: string[];
  /** 是否允许网络访问 */
  allowNetwork: boolean;
  /** 是否允许环境变量访问 */
  allowEnvAccess: boolean;
  /** 自定义规则数量 */
  rulesCount: number;
  /** 配置文件路径 */
  configPath: string | null;
}

/**
 * 全局权限系统实例
 */
export const permissions = new PermissionSystem();