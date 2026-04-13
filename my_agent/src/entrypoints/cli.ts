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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export async function runCLI(): Promise<void> {
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
