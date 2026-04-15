import * as vscode from 'vscode';
import { WebSocket } from 'ws';

/**
 * My Agent 提供器
 * 负责与后端Agent服务通信
 */
export class MyAgentProvider {
  private context: vscode.ExtensionContext;
  private config: vscode.WorkspaceConfiguration;
  private ws: WebSocket | null = null;
  private messageHandlers: ((message: any) => void)[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.config = vscode.workspace.getConfiguration('my-agent');
  }

  /**
   * 启动Agent
   */
  async startAgent() {
    try {
      // 这里简化处理，实际应该启动后端服务
      // 或者连接到现有的后端服务
      vscode.window.showInformationMessage('My Agent started');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to start My Agent: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 发送问题给Agent
   */
  async askQuestion(question: string) {
    try {
      // 这里简化处理，实际应该发送到后端服务
      // 模拟Agent响应
      setTimeout(() => {
        const response = `I received your question: "${question}". This is a simulated response.`;
        this.notifyMessage({ type: 'response', content: response });
      }, 1000);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to ask question: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 更新配置
   */
  updateConfig() {
    this.config = vscode.workspace.getConfiguration('my-agent');
  }

  /**
   * 注册消息处理器
   */
  onMessage(handler: (message: any) => void) {
    this.messageHandlers.push(handler);
  }

  /**
   * 通知消息
   */
  private notifyMessage(message: any) {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    }
  }

  /**
   * 获取配置
   */
  getConfig() {
    return this.config;
  }
}