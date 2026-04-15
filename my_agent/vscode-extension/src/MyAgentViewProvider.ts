import * as vscode from 'vscode';
import { MyAgentProvider } from './MyAgentProvider';

/**
 * My Agent 视图提供器
 * 负责渲染侧边栏视图
 */
export class MyAgentViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private context: vscode.ExtensionContext;
  private agentProvider: MyAgentProvider;
  private messages: { role: 'user' | 'assistant', content: string }[] = [];

  constructor(context: vscode.ExtensionContext, agentProvider: MyAgentProvider) {
    this.context = context;
    this.agentProvider = agentProvider;

    // 注册消息处理器
    agentProvider.onMessage((message) => {
      if (message.type === 'response') {
        this.addMessage('assistant', message.content);
        this.updateView();
      }
    });
  }

  /**
   * 解析视图
   */
  resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext<unknown>, token: vscode.CancellationToken): void | Thenable<void> {
    this.view = webviewView;

    // 配置webview
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    // 加载初始内容
    webviewView.webview.html = this.getHtmlContent();

    // 处理webview消息
    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.type) {
        case 'ask':
          this.handleAsk(message.content);
          break;
        case 'clear':
          this.clearChat();
          break;
      }
    });

    // 处理视图可见性变化
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.updateView();
      }
    });
  }

  /**
   * 处理用户提问
   */
  private async handleAsk(content: string) {
    if (!content.trim()) return;

    // 添加用户消息
    this.addMessage('user', content);
    this.updateView();

    // 发送给Agent
    await this.agentProvider.askQuestion(content);
  }

  /**
   * 添加消息
   */
  private addMessage(role: 'user' | 'assistant', content: string) {
    this.messages.push({ role, content });
  }

  /**
   * 清空聊天
   */
  clearChat() {
    this.messages = [];
    this.updateView();
  }

  /**
   * 更新视图
   */
  private updateView() {
    if (this.view) {
      this.view.webview.html = this.getHtmlContent();
    }
  }

  /**
   * 获取HTML内容
   */
  private getHtmlContent(): string {
    const messagesHtml = this.messages.map(msg => {
      const className = msg.role === 'user' ? 'user-message' : 'assistant-message';
      return `
        <div class="message ${className}">
          <div class="message-content">${this.escapeHtml(msg.content)}</div>
        </div>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>My Agent</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
          }
          .header {
            background-color: #007acc;
            color: white;
            padding: 12px;
            font-weight: bold;
            font-size: 16px;
          }
          .messages {
            flex: 1;
            padding: 12px;
            overflow-y: auto;
          }
          .message {
            margin-bottom: 12px;
            padding: 8px 12px;
            border-radius: 8px;
            max-width: 80%;
          }
          .user-message {
            background-color: #e6f7ff;
            align-self: flex-start;
            margin-left: auto;
          }
          .assistant-message {
            background-color: white;
            align-self: flex-start;
            border: 1px solid #e0e0e0;
          }
          .input-area {
            padding: 12px;
            background-color: white;
            border-top: 1px solid #e0e0e0;
            display: flex;
          }
          .input-area input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            margin-right: 8px;
          }
          .input-area button {
            padding: 8px 16px;
            background-color: #007acc;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          .input-area button:hover {
            background-color: #005a9e;
          }
          .clear-button {
            margin: 8px 12px;
            padding: 6px 12px;
            background-color: #f0f0f0;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
          }
          .clear-button:hover {
            background-color: #e0e0e0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">My Agent</div>
          <div class="messages">
            ${messagesHtml}
          </div>
          <button class="clear-button" onclick="clearChat()">Clear Chat</button>
          <div class="input-area">
            <input type="text" id="input" placeholder="Ask My Agent..." onkeypress="if(event.key === 'Enter') sendMessage()">
            <button onclick="sendMessage()">Send</button>
          </div>
        </div>
        <script>
          const vscode = acquireVsCodeApi();

          function sendMessage() {
            const input = document.getElementById('input');
            if (input) {
              const content = input.value;
              if (content.trim()) {
                vscode.postMessage({ type: 'ask', content });
                input.value = '';
              }
            }
          }

          function clearChat() {
            vscode.postMessage({ type: 'clear' });
          }
        </script>
      </body>
      </html>
    `;
  }

  /**
   * 转义HTML
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}