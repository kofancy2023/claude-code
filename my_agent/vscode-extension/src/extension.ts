import * as vscode from 'vscode';
import { MyAgentProvider } from './MyAgentProvider';
import { MyAgentViewProvider } from './MyAgentViewProvider';

/**
 * 激活扩展
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('My Agent extension activated');

  // 创建Agent提供器
  const agentProvider = new MyAgentProvider(context);

  // 创建视图提供器
  const viewProvider = new MyAgentViewProvider(context, agentProvider);

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('my-agent.start', () => {
      agentProvider.startAgent();
    }),

    vscode.commands.registerCommand('my-agent.ask', () => {
      vscode.window.showInputBox({
        placeHolder: 'Ask My Agent a question...',
        prompt: 'Enter your question for My Agent'
      }).then(question => {
        if (question) {
          agentProvider.askQuestion(question);
        }
      });
    }),

    vscode.commands.registerCommand('my-agent.clear', () => {
      viewProvider.clearChat();
    })
  );

  // 注册侧边栏视图
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('my-agent-sidebar', viewProvider)
  );

  // 监听配置变化
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('my-agent')) {
      agentProvider.updateConfig();
    }
  });
}

/**
 * 停用扩展
 */
export function deactivate() {
  console.log('My Agent extension deactivated');
}