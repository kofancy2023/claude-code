export type Role = 'system' | 'user' | 'assistant';

/**
 * 消息接口
 *
 * 表示对话中的一条消息
 */
export interface Message {
  /** 消息角色：system（系统）、user（用户）、assistant（助手） */
  role: Role;
  /** 消息内容，可以是字符串或复杂内容块数组 */
  content: string | ContentBlock[];
}

/**
 * 内容块类型
 *
 * 用于表示消息中的复杂内容：
 * - text: 文本内容
 * - tool_use: 工具调用请求
 * - tool_result: 工具执行结果
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

/**
 * 工具接口
 *
 * 定义一个可执行工具的规格
 */
export interface Tool {
  /** 工具名称（必须是唯一标识符） */
  name: string;
  /** 工具描述（供 AI 理解何时应该调用此工具） */
  description: string;
  /** 输入参数规格（JSON Schema 格式） */
  inputSchema: ToolInputSchema;
  /** 执行函数 */
  execute: (input: Record<string, unknown>) => Promise<string>;
}

/**
 * 工具输入参数规格
 *
 * 使用 JSON Schema 格式定义工具参数
 */
export interface ToolInputSchema {
  /** 类型固定为 'object' */
  type: 'object';
  /** 参数属性定义 */
  properties: Record<string, ToolProperty>;
  /** 必填参数列表 */
  required?: string[];
}

/**
 * 工具属性定义
 */
export interface ToolProperty {
  /** 参数类型 */
  type: string;
  /** 参数描述 */
  description: string;
  /** 数组元素定义 */
  items?: ToolProperty;
  /** 枚举值列表 */
  enum?: string[];
  /** 默认值 */
  default?: unknown;
  /** 对象属性（用于嵌套对象） */
  properties?: Record<string, ToolProperty>;
  /** 必填属性 */
  required?: string[];
}

/**
 * 应用状态接口
 *
 * 包含 REPL 运行时的所有状态数据
 */
export interface AppState {
  /** 对话历史消息列表 */
  messages: Message[];
  /** 已注册的工具列表 */
  tools: Tool[];
}
