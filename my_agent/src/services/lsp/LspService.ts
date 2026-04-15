import { LspClient } from './LspClient';
import { LspServiceConfig, CompletionList, SignatureHelp, Location, Diagnostic } from './types';

// LSP 服务类
export class LspService {
  private config: LspServiceConfig;
  private clients: Map<string, LspClient> = new Map();
  private rootPath: string;

  constructor(config: LspServiceConfig, rootPath: string) {
    this.config = config;
    this.rootPath = rootPath;
  }

  /**
   * 启动指定语言的LSP客户端
   */
  async startClient(language: string): Promise<void> {
    const clientConfig = this.config.languageServers[language];
    if (!clientConfig) {
      throw new Error(`No LSP configuration for language: ${language}`);
    }

    if (this.clients.has(language)) {
      return; // 客户端已经启动
    }

    const client = new LspClient(clientConfig, this.rootPath);
    await client.start();
    this.clients.set(language, client);
  }

  /**
   * 停止指定语言的LSP客户端
   */
  stopClient(language: string): void {
    const client = this.clients.get(language);
    if (client) {
      client.stop();
      this.clients.delete(language);
    }
  }

  /**
   * 停止所有LSP客户端
   */
  stopAllClients(): void {
    for (const client of this.clients.values()) {
      client.stop();
    }
    this.clients.clear();
  }

  /**
   * 获取代码补全
   */
  async getCompletions(
    language: string,
    uri: string,
    line: number,
    character: number
  ): Promise<CompletionList> {
    const client = await this._ensureClient(language);
    return client.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position: { line, character }
    });
  }

  /**
   * 获取签名帮助
   */
  async getSignatureHelp(
    language: string,
    uri: string,
    line: number,
    character: number
  ): Promise<SignatureHelp> {
    const client = await this._ensureClient(language);
    return client.sendRequest('textDocument/signatureHelp', {
      textDocument: { uri },
      position: { line, character }
    });
  }

  /**
   * 查找定义
   */
  async findDefinition(
    language: string,
    uri: string,
    line: number,
    character: number
  ): Promise<Location | Location[]> {
    const client = await this._ensureClient(language);
    return client.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position: { line, character }
    });
  }

  /**
   * 查找引用
   */
  async findReferences(
    language: string,
    uri: string,
    line: number,
    character: number
  ): Promise<Location[]> {
    const client = await this._ensureClient(language);
    return client.sendRequest('textDocument/references', {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration: true }
    });
  }

  /**
   * 获取文档符号
   */
  async getDocumentSymbols(language: string, uri: string): Promise<any[]> {
    const client = await this._ensureClient(language);
    return client.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri }
    });
  }

  /**
   * 获取代码操作
   */
  async getCodeActions(
    language: string,
    uri: string,
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number
  ): Promise<any[]> {
    const client = await this._ensureClient(language);
    return client.sendRequest('textDocument/codeAction', {
      textDocument: { uri },
      range: {
        start: { line: startLine, character: startCharacter },
        end: { line: endLine, character: endCharacter }
      },
      context: { diagnostics: [] }
    });
  }

  /**
   * 格式化文档
   */
  async formatDocument(
    language: string,
    uri: string,
    options?: any
  ): Promise<any[]> {
    const client = await this._ensureClient(language);
    return client.sendRequest('textDocument/formatting', {
      textDocument: { uri },
      options: options || {
        tabSize: 2,
        insertSpaces: true
      }
    });
  }

  /**
   * 确保LSP客户端已启动
   */
  private async _ensureClient(language: string): Promise<LspClient> {
    if (!this.clients.has(language)) {
      await this.startClient(language);
    }
    const client = this.clients.get(language);
    if (!client) {
      throw new Error(`Failed to start LSP client for language: ${language}`);
    }
    return client;
  }

  /**
   * 获取支持的语言列表
   */
  getSupportedLanguages(): string[] {
    return Object.keys(this.config.languageServers);
  }

  /**
   * 检查语言是否支持
   */
  isLanguageSupported(language: string): boolean {
    return this.config.languageServers[language] !== undefined;
  }
}