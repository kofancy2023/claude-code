/**
 * CLI 入口点
 *
 * 负责：
 * - 解析命令行参数
 * - 初始化配置
 * - 初始化插件系统
 * - 启动 REPL
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { createProvider } from '../services/api/index.js';
import { Repl } from '../core/Repl.js';
import { createStore } from '../state/store.js';
import { terminal } from '../ui/terminal.js';
import { permissions } from '../services/permissions.js';
import { errorHandler } from '../utils/errors.js';
import { config, ConfigValidationError } from '../config/index.js';
import { getPluginManager } from '../plugins/index.js';
import { ArgParser, CLI_OPTIONS } from './args.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function showVersion(): void {
  console.log('my-agent v0.1.0');
  console.log('AI Agent CLI Tool - A Claude Code inspired agent');
}

function showHelp(parser: ArgParser): void {
  console.log(parser.help());
  console.log('');
  console.log('Environment Variables:');
  console.log('  AI_PROVIDER          AI provider (glm, anthropic, etc.)');
  console.log('  AI_API_KEY            API key for the provider');
  console.log('  AI_MODEL              Model name (optional)');
  console.log('  AI_BASE_URL           API base URL (optional)');
  console.log('  MAX_CONCURRENT_TOOLS  Max concurrent tools (default: 5)');
  console.log('  MAX_TOOL_CALL_ROUNDS  Max tool call rounds (default: 20)');
  console.log('  SESSION_DIR           Session directory (default: .sessions)');
  console.log('  PERMISSIONS_CONFIG    Permissions config file path');
  console.log('  DEBUG                 Enable debug mode (default: false)');
  console.log('');
  console.log('Examples:');
  console.log('  my-agent --provider glm --api-key your-key');
  console.log('  my-agent -p anthropic -k your-key -m claude-3-5-sonnet');
  console.log('  AI_PROVIDER=glm AI_API_KEY=key my-agent');
}

function loadPermissionsConfig(): void {
  const permissionsConfig = config.get('permissionsConfig');
  const configPath = permissionsConfig ||
    path.join(__dirname, '../../config/permissions.json');

  try {
    permissions.loadFromFile(configPath);
    console.log(terminal.renderSuccess(`Loaded permissions from: ${configPath}`));
    console.log(terminal.renderInfo(`Mode: ${permissions.getStatus().mode}`));
  } catch (error) {
    console.log(terminal.renderWarning(`Failed to load permissions config: ${error instanceof Error ? error.message : String(error)}`));
    console.log(terminal.renderInfo('Using default permissions (allow all)'));
  }
}

function configureErrorReporting(): void {
  const errorConfig = config.get('errorReporting');

  errorHandler.configureReporter({
    enabled: errorConfig.enabled,
    env: errorConfig.env,
    appName: errorConfig.appName,
    metadata: {
      version: process.env.npm_package_version || '0.1.0',
      platform: process.platform,
      nodeVersion: process.version,
    },
    filter: (error) => {
      if (errorConfig.env === 'development') return true;
      return !['VALIDATION_ERROR', 'AUTH_ERROR'].includes(error.code);
    },
  });

  if (errorConfig.env === 'development') {
    console.log(terminal.renderInfo('Error reporting: console mode'));
  }
}

/**
 * CLI 运行入口
 */
export async function runCLI(args: string[] = process.argv.slice(2)): Promise<void> {
  // 创建参数解析器
  const parser = new ArgParser(
    'my-agent',
    '0.1.0',
    'my-agent [options] [command]'
  );
  parser.addOptions(CLI_OPTIONS);

  // 解析参数
  let parsed;
  try {
    parsed = parser.parse(args);
  } catch (error) {
    console.error(terminal.renderError(`Argument parse error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }

  // 处理 --help
  if (parsed.options['help']) {
    showHelp(parser);
    process.exit(0);
  }

  // 处理 --version
  if (parsed.options['version']) {
    showVersion();
    process.exit(0);
  }

  // 处理未知选项
  if (parsed.unknown.length > 0) {
    console.error(terminal.renderWarning(`Unknown options: ${parsed.unknown.join(', ')}`));
    console.error(terminal.renderInfo('Use --help for available options'));
    process.exit(1);
  }

  // 应用 CLI 参数到环境变量（供配置系统读取）
  if (parsed.options.provider) {
    process.env.AI_PROVIDER = String(parsed.options.provider);
  }
  if (parsed.options['api-key']) {
    process.env.AI_API_KEY = String(parsed.options['api-key']);
  }
  if (parsed.options.model) {
    process.env.AI_MODEL = String(parsed.options.model);
  }
  if (parsed.options['base-url']) {
    process.env.AI_BASE_URL = String(parsed.options['base-url']);
  }
  if (parsed.options.debug) {
    process.env.DEBUG = 'true';
  }
  if (parsed.options.sessionDir) {
    process.env.SESSION_DIR = String(parsed.options.sessionDir);
  }
  if (parsed.options.permissions) {
    process.env.PERMISSIONS_CONFIG = String(parsed.options.permissions);
  }
  if (parsed.options['max-concurrent-tools']) {
    process.env.MAX_CONCURRENT_TOOLS = String(parsed.options['max-concurrent-tools']);
  }
  if (parsed.options['max-tool-call-rounds']) {
    process.env.MAX_TOOL_CALL_ROUNDS = String(parsed.options['max-tool-call-rounds']);
  }

  // 显示 CLI 配置来源
  const cliOpts = Object.entries(parsed.options).filter(([k, v]) => v !== undefined && k !== 'help' && k !== 'version');
  if (cliOpts.length > 0) {
    console.log(terminal.renderInfo('CLI Options:'));
    for (const [key, value] of cliOpts) {
      console.log(`  --${key}: ${value}`);
    }
    console.log(terminal.renderDivider());
  }

  // 加载配置
  try {
    config.load();
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.error(terminal.renderError(`Configuration error: ${error.message}`));
      console.error(terminal.renderInfo('\n支持的 Provider 和环境变量:'));
      console.error(terminal.renderInfo('  - anthropic: ANTHROPIC_API_KEY'));
      console.error(terminal.renderInfo('  - glm: GLM_API_KEY (或 AI_API_KEY)'));
      console.error(terminal.renderInfo('  - kimi: KIMI_API_KEY'));
      console.error(terminal.renderInfo('  - minimax: MINIMAX_API_KEY'));
      console.error(terminal.renderInfo('  - deepseek: DEEPSEEK_API_KEY'));
      console.error(terminal.renderInfo('  - qwen: QWEN_API_KEY'));
      console.error(terminal.renderInfo('  - gemini: GEMINI_API_KEY'));
      console.error(terminal.renderInfo('  - siliconflow: SILICONFLOW_API_KEY'));
      console.error(terminal.renderInfo(''));
      console.error(terminal.renderInfo('设置示例: AI_PROVIDER=glm AI_API_KEY=your-key npm run dev'));
    }
    process.exit(1);
  }

  console.log(terminal.renderWelcome());
  console.log(terminal.renderInfo(`Provider: ${config.get('provider')}`));
  console.log(terminal.renderDivider());

  loadPermissionsConfig();
  configureErrorReporting();

  const pluginManager = getPluginManager();
  try {
    await pluginManager.initialize();
    const stats = pluginManager.getStats();
    console.log(terminal.renderInfo(`Plugins: ${stats.pluginCount} loaded, ${stats.toolCount} tools available`));
  } catch (error) {
    console.log(terminal.renderWarning(`Plugin initialization failed: ${error instanceof Error ? error.message : String(error)}`));
    console.log(terminal.renderInfo('Continuing without plugins...'));
  }

  console.log(terminal.renderDivider());

  const provider = createProvider({
    provider: config.get('provider'),
    apiKey: config.get('apiKey'),
    baseUrl: config.get('baseUrl'),
    model: config.get('model'),
  });

  const store = createStore();
  const repl = new Repl({ client: provider, store });

  await repl.run();
}
