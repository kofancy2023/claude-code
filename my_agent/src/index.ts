import { runCLI } from './entrypoints/cli.js';

runCLI().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
