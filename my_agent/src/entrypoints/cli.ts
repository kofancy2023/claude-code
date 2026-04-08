import { createProvider, type Provider } from '../services/api/index.js';
import { Repl } from '../core/Repl.js';
import { createStore } from '../state/store.js';

function getConfig() {
  const envProvider = process.env.AI_PROVIDER as Provider | undefined;
  const apiKey = process.env.AI_API_KEY;

  if (!apiKey) {
    console.error('Error: AI_API_KEY environment variable not set');
    console.error('Please set it with one of:');
    console.error('  - ANTHROPIC_API_KEY (for Anthropic)');
    console.error('  - AI_API_KEY (for GLM or other OpenAI-compatible)');
    process.exit(1);
  }

  const provider = envProvider || 'glm';

  return {
    provider,
    apiKey,
    model: process.env.AI_MODEL,
    baseUrl: process.env.AI_BASE_URL,
  };
}

export async function runCLI(): Promise<void> {
  console.log('🤖 My Agent CLI');
  console.log('Type your messages or "exit" to quit.\n');

  const config = getConfig();

  const provider = createProvider({
    provider: config.provider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  });

  console.log(`Using provider: ${provider.name}\n`);

  const store = createStore();
  const repl = new Repl({ client: provider, store });

  await repl.run();
}
