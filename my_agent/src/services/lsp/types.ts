// LSP 协议类型定义

// 位置信息
export interface Position {
  line: number;
  character: number;
}

// 范围信息
export interface Range {
  start: Position;
  end: Position;
}

// 文本文档标识符
export interface TextDocumentIdentifier {
  uri: string;
}

// 文本文档位置参数
export interface TextDocumentPositionParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
}

// 完成项
export interface CompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: number;
}

// 完成列表
export interface CompletionList {
  isIncomplete: boolean;
  items: CompletionItem[];
}

// 签名信息
export interface SignatureInformation {
  label: string;
  documentation?: string;
  parameters?: ParameterInformation[];
}

// 参数信息
export interface ParameterInformation {
  label: string;
  documentation?: string;
}

// 签名帮助
export interface SignatureHelp {
  signatures: SignatureInformation[];
  activeSignature?: number;
  activeParameter?: number;
}

// 定义信息
export interface Location {
  uri: string;
  range: Range;
}

// 诊断信息
export interface Diagnostic {
  range: Range;
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
}

// LSP 客户端配置
export interface LspClientConfig {
  command: string;
  args?: string[];
  rootPath?: string;
  capabilities?: any;
}

// LSP 服务配置
export interface LspServiceConfig {
  languageServers: {
    [language: string]: LspClientConfig;
  };
}

// LSP 消息类型
export enum MessageType {
  REQUEST = 0,
  RESPONSE = 1,
  NOTIFICATION = 2
}

// LSP 请求消息
export interface RequestMessage {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: any;
}

// LSP 响应消息
export interface ResponseMessage {
  jsonrpc: string;
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// LSP 通知消息
export interface NotificationMessage {
  jsonrpc: string;
  method: string;
  params?: any;
}