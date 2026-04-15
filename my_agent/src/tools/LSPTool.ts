import type { Tool, ToolInput, ToolOutput } from '../types';
import { LspService, LspServiceConfig } from '../services/lsp';
import { terminal } from '../ui/terminal';

/**
 * LSP工具配置
 */
interface LSPToolConfig {
  lspConfig: LspServiceConfig;
  rootPath: string;
}

/**
 * LSP工具
 * 提供代码补全、定义查找、引用查找等功能
 */
export class LSPTool implements Tool {
  name = 'LSPTool';
  description = 'Language Server Protocol tool for code intelligence';
  inputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'The LSP action to perform'
      },
      language: {
        type: 'string',
        description: 'The programming language'
      },
      uri: {
        type: 'string',
        description: 'The file URI'
      },
      line: {
        type: 'number',
        description: 'The line number'
      },
      character: {
        type: 'number',
        description: 'The character position'
      },
      startLine: {
        type: 'number',
        description: 'The start line for code actions'
      },
      startCharacter: {
        type: 'number',
        description: 'The start character for code actions'
      },
      endLine: {
        type: 'number',
        description: 'The end line for code actions'
      },
      endCharacter: {
        type: 'number',
        description: 'The end character for code actions'
      },
      options: {
        type: 'object',
        description: 'Additional options'
      }
    },
    required: ['action']
  };
  private lspService: LspService;

  constructor(config: LSPToolConfig) {
    this.lspService = new LspService(config.lspConfig, config.rootPath);
  }

  /**
   * 执行工具
   */
  async execute(input: ToolInput): Promise<ToolOutput> {
    const { action, language, uri, line, character, options } = input;

    try {
      switch (action) {
        case 'completion':
          return await this.getCompletions(language, uri, line, character);
        case 'definition':
          return await this.findDefinition(language, uri, line, character);
        case 'references':
          return await this.findReferences(language, uri, line, character);
        case 'signatureHelp':
          return await this.getSignatureHelp(language, uri, line, character);
        case 'documentSymbols':
          return await this.getDocumentSymbols(language, uri);
        case 'codeActions':
          return await this.getCodeActions(language, uri, input.startLine, input.startCharacter, input.endLine, input.endCharacter);
        case 'format':
          return await this.formatDocument(language, uri, options);
        case 'supportedLanguages':
          return this.getSupportedLanguages();
        default:
          return `Error: Unknown action: ${action}`;
      }
    } catch (error) {
      console.error(`LSPTool error: ${error instanceof Error ? error.message : String(error)}`);
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 获取代码补全
   */
  private async getCompletions(language: string, uri: string, line: number, character: number): Promise<string> {
    const completions = await this.lspService.getCompletions(language, uri, line, character);
    
    if (!completions || !completions.items) {
      return 'No completions found';
    }

    const formattedCompletions = completions.items.map((item: any) => {
      return {
        label: item.label,
        kind: this._getCompletionKindName(item.kind),
        detail: item.detail || '',
        documentation: item.documentation || ''
      };
    });

    return JSON.stringify(formattedCompletions, null, 2);
  }

  /**
   * 查找定义
   */
  private async findDefinition(language: string, uri: string, line: number, character: number): Promise<string> {
    const definition = await this.lspService.findDefinition(language, uri, line, character);
    
    if (!definition) {
      return 'No definition found';
    }

    return JSON.stringify(definition, null, 2);
  }

  /**
   * 查找引用
   */
  private async findReferences(language: string, uri: string, line: number, character: number): Promise<string> {
    const references = await this.lspService.findReferences(language, uri, line, character);
    
    if (!references || references.length === 0) {
      return 'No references found';
    }

    return JSON.stringify(references, null, 2);
  }

  /**
   * 获取签名帮助
   */
  private async getSignatureHelp(language: string, uri: string, line: number, character: number): Promise<string> {
    const signatureHelp = await this.lspService.getSignatureHelp(language, uri, line, character);
    
    if (!signatureHelp || !signatureHelp.signatures || signatureHelp.signatures.length === 0) {
      return 'No signature help available';
    }

    return JSON.stringify(signatureHelp, null, 2);
  }

  /**
   * 获取文档符号
   */
  private async getDocumentSymbols(language: string, uri: string): Promise<string> {
    const symbols = await this.lspService.getDocumentSymbols(language, uri);
    
    if (!symbols || symbols.length === 0) {
      return 'No document symbols found';
    }

    return JSON.stringify(symbols, null, 2);
  }

  /**
   * 获取代码操作
   */
  private async getCodeActions(
    language: string, 
    uri: string, 
    startLine: number, 
    startCharacter: number, 
    endLine: number, 
    endCharacter: number
  ): Promise<string> {
    const actions = await this.lspService.getCodeActions(
      language, uri, startLine, startCharacter, endLine, endCharacter
    );
    
    if (!actions || actions.length === 0) {
      return 'No code actions available';
    }

    return JSON.stringify(actions, null, 2);
  }

  /**
   * 格式化文档
   */
  private async formatDocument(language: string, uri: string, options?: any): Promise<string> {
    const edits = await this.lspService.formatDocument(language, uri, options);
    
    if (!edits || edits.length === 0) {
      return 'No formatting changes needed';
    }

    return JSON.stringify(edits, null, 2);
  }

  /**
   * 获取支持的语言列表
   */
  private getSupportedLanguages(): string {
    const languages = this.lspService.getSupportedLanguages();
    return JSON.stringify({ languages }, null, 2);
  }

  /**
   * 获取补全类型名称
   */
  private _getCompletionKindName(kind: number): string {
    const kindNames = {
      1: 'Text',
      2: 'Method',
      3: 'Function',
      4: 'Constructor',
      5: 'Field',
      6: 'Variable',
      7: 'Class',
      8: 'Interface',
      9: 'Module',
      10: 'Property',
      11: 'Unit',
      12: 'Value',
      13: 'Enum',
      14: 'Keyword',
      15: 'Snippet',
      16: 'Color',
      17: 'File',
      18: 'Reference',
      19: 'Folder',
      20: 'EnumMember',
      21: 'Constant',
      22: 'Struct',
      23: 'Event',
      24: 'Operator',
      25: 'TypeParameter'
    };
    return kindNames[kind as keyof typeof kindNames] || 'Unknown';
  }

  /**
   * 停止LSP服务
   */
  stop(): void {
    this.lspService.stopAllClients();
  }
}