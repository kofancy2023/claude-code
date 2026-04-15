/**
 * CLI 参数解析器
 *
 * 提供命令行参数解析功能：
 * - 支持短选项 (-p) 和长选项 (--provider)
 * - 支持位置参数
 * - 支持默认值
 * - 支持帮助和版本信息
 *
 * 设计思路：
 * 使用简单的解析器，避免引入 commander 或 yargs 等额外依赖
 * 支持常见的 CLI 约定
 */

export interface CliOption {
  /** 选项名称 */
  name: string;
  /** 短选项 */
  short?: string;
  /** 选项描述 */
  description: string;
  /** 是否需要值 */
  requiresValue: boolean;
  /** 默认值 */
  default?: string | boolean | number;
  /** 值类型 */
  type?: 'string' | 'number' | 'boolean';
}

export interface ParsedArgs {
  /** 位置参数 */
  positional: string[];
  /** 选项映射 */
  options: Record<string, string | boolean | number>;
  /** 未知选项 */
  unknown: string[];
}

/**
 * CLI 参数解析器
 */
export class ArgParser {
  /** 选项定义 */
  private options: Map<string, CliOption> = new Map();
  /** 程序名称 */
  private programName: string;
  /** 程序版本 */
  private version: string;
  /** 使用说明 */
  private usage: string;

  /**
   * 构造函数
   *
   * @param programName - 程序名称
   * @param version - 版本号
   * @param usage - 使用说明
   */
  constructor(programName: string, version: string, usage: string) {
    this.programName = programName;
    this.version = version;
    this.usage = usage;
  }

  /**
   * 注册选项
   */
  option(option: CliOption): this {
    this.options.set(option.name, option);
    return this;
  }

  /**
   * 批量注册选项
   */
  addOptions(opts: CliOption[]): this {
    for (const opt of opts) {
      this.options.set(opt.name, opt);
    }
    return this;
  }

  /**
   * 获取所有选项
   */
  getOptions(): Map<string, CliOption> {
    return this.options;
  }

  /**
   * 解析参数
   */
  parse(args: string[]): ParsedArgs {
    const result: ParsedArgs = {
      positional: [],
      options: {},
      unknown: [],
    };

    // 初始化选项默认值
    for (const [name, opt] of this.options) {
      if (opt.default !== undefined) {
        result.options[name] = opt.default;
      }
    }

    let i = 0;
    while (i < args.length) {
      const arg = args[i];

      // 处理 --help
      if (arg === '--help' || arg === '-h') {
        result.options['help'] = true;
        i++;
        continue;
      }

      // 处理 --version
      if (arg === '--version' || arg === '-v') {
        result.options['version'] = true;
        i++;
        continue;
      }

      // 处理选项
      if (arg.startsWith('--')) {
        const optStr = arg.substring(2);
        const [name, value] = this.parseOptionString(optStr);

        if (this.options.has(name)) {
          const opt = this.options.get(name)!;
          if (opt.requiresValue) {
            if (value !== undefined) {
              result.options[name] = this.castValue(value, opt.type);
            } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
              result.options[name] = this.castValue(args[++i], opt.type);
            } else {
              throw new Error(`Option --${name} requires a value`);
            }
          } else {
            result.options[name] = true;
          }
        } else {
          result.unknown.push(arg);
        }
      } else if (arg.startsWith('-')) {
        const optStr = arg.substring(1);

        // 处理短选项组合（如 -abc 等于 -a -b -c）
        if (optStr.length > 1 && !optStr.includes('=')) {
          for (let j = 0; j < optStr.length; j++) {
            const shortName = optStr[j];
            const opt = this.findByShort(shortName);
            if (opt) {
              result.options[opt.name] = true;
            } else {
              result.unknown.push(`-${shortName}`);
            }
          }
          i++;
          continue;
        }

        const [name, value] = this.parseOptionString(optStr);
        const opt = this.findByShort(name);

        if (opt) {
          if (opt.requiresValue) {
            if (value !== undefined) {
              result.options[opt.name] = this.castValue(value, opt.type);
            } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
              result.options[opt.name] = this.castValue(args[++i], opt.type);
            } else {
              throw new Error(`Option -${name} requires a value`);
            }
          } else {
            result.options[opt.name] = true;
          }
        } else {
          result.unknown.push(arg);
        }
      } else {
        // 位置参数
        result.positional.push(arg);
      }

      i++;
    }

    return result;
  }

  /**
   * 生成帮助文本
   */
  help(): string {
    const lines: string[] = [];

    lines.push(`${this.programName} v${this.version}`);
    lines.push('');
    lines.push('Usage:');
    lines.push(`  ${this.usage}`);
    lines.push('');
    lines.push('Options:');

    const optWidth = 28;
    for (const [name, opt] of this.options) {
      let optStr = '  ';

      if (opt.short) {
        optStr += `-${opt.short}, `;
      } else {
        optStr += '    ';
      }

      optStr += `--${name}`;

      if (opt.requiresValue) {
        optStr += ` <${opt.type || 'value'}>`;
      }

      // 填充对齐
      const padding = Math.max(0, optWidth - optStr.length);
      optStr += ' '.repeat(padding);

      optStr += opt.description;

      if (opt.default !== undefined) {
        optStr += ` (default: ${opt.default})`;
      }

      lines.push(optStr);
    }

    return lines.join('\n');
  }

  /**
   * 解析选项字符串（处理 key=value 格式）
   */
  private parseOptionString(optStr: string): [string, string | undefined] {
    const eqIndex = optStr.indexOf('=');
    if (eqIndex !== -1) {
      return [optStr.substring(0, eqIndex), optStr.substring(eqIndex + 1)];
    }
    return [optStr, undefined];
  }

  /**
   * 根据短名称查找选项
   */
  private findByShort(short: string): CliOption | undefined {
    for (const opt of this.options.values()) {
      if (opt.short === short) {
        return opt;
      }
    }
    return undefined;
  }

  /**
   * 类型转换
   */
  private castValue(value: string, type?: string): string | number | boolean {
    if (type === 'number') {
      const num = parseFloat(value);
      if (isNaN(num)) {
        throw new Error(`Invalid number: ${value}`);
      }
      return num;
    }

    if (type === 'boolean') {
      if (value === 'true' || value === '1') return true;
      if (value === 'false' || value === '0') return false;
      return Boolean(value);
    }

    return value;
  }
}

/**
 * CLI 选项定义
 */
export const CLI_OPTIONS: CliOption[] = [
  {
    name: 'provider',
    short: 'p',
    description: 'AI provider',
    requiresValue: true,
    type: 'string',
    default: 'glm',
  },
  {
    name: 'model',
    short: 'm',
    description: 'Model name',
    requiresValue: true,
    type: 'string',
  },
  {
    name: 'api-key',
    short: 'k',
    description: 'API key',
    requiresValue: true,
    type: 'string',
  },
  {
    name: 'base-url',
    short: 'b',
    description: 'API base URL',
    requiresValue: true,
    type: 'string',
  },
  {
    name: 'config',
    short: 'c',
    description: 'Config file path',
    requiresValue: true,
    type: 'string',
  },
  {
    name: 'debug',
    short: 'd',
    description: 'Enable debug mode',
    requiresValue: false,
    type: 'boolean',
    default: false,
  },
  {
    name: 'session-dir',
    short: 's',
    description: 'Session directory',
    requiresValue: true,
    type: 'string',
    default: '.sessions',
  },
  {
    name: 'permissions',
    description: 'Permissions config file',
    requiresValue: true,
    type: 'string',
  },
  {
    name: 'max-concurrent-tools',
    description: 'Max concurrent tools',
    requiresValue: true,
    type: 'number',
    default: 5,
  },
  {
    name: 'max-tool-call-rounds',
    description: 'Max tool call rounds',
    requiresValue: true,
    type: 'number',
    default: 20,
  },
];
