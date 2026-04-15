import { spawn } from 'child_process';
import { LspClientConfig, RequestMessage, ResponseMessage, NotificationMessage } from './types';

// 语言服务器客户端类
export class LspClient {
  private config: LspClientConfig;
  private process: any = null;
  private messageId = 0;
  private pendingRequests: Map<number | string, (result: any, error: any) => void> = new Map();
  private initialized = false;
  private rootPath: string;

  constructor(config: LspClientConfig, rootPath: string) {
    this.config = config;
    this.rootPath = rootPath;
  }

  /**
   * 启动语言服务器
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 启动语言服务器进程
      this.process = spawn(this.config.command, this.config.args || [], {
        cwd: this.rootPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // 处理标准输出
      this.process.stdout.on('data', (data: Buffer) => {
        this._handleOutput(data);
      });

      // 处理标准错误
      this.process.stderr.on('data', (data: Buffer) => {
        console.error(`LSP Server Error: ${data.toString()}`);
      });

      // 处理进程退出
      this.process.on('exit', (code: number) => {
        console.log(`LSP Server exited with code ${code}`);
        this.initialized = false;
      });

      // 初始化语言服务器
      this.initialize().then(() => {
        this.initialized = true;
        resolve();
      }).catch(reject);
    });
  }

  /**
   * 停止语言服务器
   */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.initialized = false;
    }
  }

  /**
   * 发送请求
   */
  async sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const request: RequestMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, (result, error) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });

      this._sendMessage(request);
    });
  }

  /**
   * 发送通知
   */
  sendNotification(method: string, params: any): void {
    const notification: NotificationMessage = {
      jsonrpc: '2.0',
      method,
      params
    };

    this._sendMessage(notification);
  }

  /**
   * 初始化语言服务器
   */
  private async initialize(): Promise<void> {
    const result = await this.sendRequest('initialize', {
      processId: process.pid,
      rootPath: this.rootPath,
      rootUri: `file://${this.rootPath.replace(/\\/g, '/')}`,
      capabilities: this.config.capabilities || {},
      initializationOptions: {}
    });

    // 发送初始化完成通知
    this.sendNotification('initialized', {});
  }

  /**
   * 处理语言服务器输出
   */
  private _handleOutput(data: Buffer): void {
    const output = data.toString();
    const lines = output.split('\r\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      // 解析 LSP 消息
      if (line.startsWith('Content-Length:')) {
        const lengthMatch = line.match(/Content-Length: (\d+)/);
        if (lengthMatch) {
          const length = parseInt(lengthMatch[1]);
          // 这里简化处理，实际应该读取完整的消息
          // 为了演示，我们假设消息已经完整
        }
      } else if (line.startsWith('{')) {
        try {
          const message = JSON.parse(line);
          this._handleMessage(message);
        } catch (error) {
          console.error(`Error parsing LSP message: ${error}`);
        }
      }
    }
  }

  /**
   * 处理 LSP 消息
   */
  private _handleMessage(message: any): void {
    if ('id' in message) {
      // 响应消息
      const callback = this.pendingRequests.get(message.id);
      if (callback) {
        callback(message.result, message.error);
        this.pendingRequests.delete(message.id);
      }
    } else {
      // 通知消息
      this._handleNotification(message);
    }
  }

  /**
   * 处理通知消息
   */
  private _handleNotification(notification: NotificationMessage): void {
    switch (notification.method) {
      case 'textDocument/publishDiagnostics':
        // 处理诊断信息
        break;
      case 'window/showMessage':
        // 处理显示消息
        break;
      case 'window/logMessage':
        // 处理日志消息
        break;
      default:
        // 其他通知
        break;
    }
  }

  /**
   * 发送消息到语言服务器
   */
  private _sendMessage(message: any): void {
    if (!this.process) {
      throw new Error('LSP client is not started');
    }

    const json = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n`;
    this.process.stdin.write(header + json);
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}