import { Message } from '../../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * 会话类
 * 管理单个会话的消息、状态和元数据
 */
export class Session {
  /** 会话ID */
  id: string;
  /** 会话名称 */
  name: string;
  /** 会话创建时间 */
  createdAt: Date;
  /** 会话最后活动时间 */
  lastActivityAt: Date;
  /** 会话消息列表 */
  messages: Message[];
  /** 会话元数据 */
  metadata: Record<string, any>;

  /**
   * 构造函数
   * @param name 会话名称
   * @param messages 初始消息列表
   * @param metadata 会话元数据
   */
  constructor(name: string, messages: Message[] = [], metadata: Record<string, any> = {}) {
    this.id = uuidv4();
    this.name = name;
    this.createdAt = new Date();
    this.lastActivityAt = new Date();
    this.messages = messages;
    this.metadata = metadata;
  }

  /**
   * 添加消息到会话
   * @param message 消息对象
   */
  addMessage(message: Message): void {
    this.messages.push(message);
    this.lastActivityAt = new Date();
  }

  /**
   * 批量添加消息到会话
   * @param messages 消息对象数组
   */
  addMessages(messages: Message[]): void {
    this.messages.push(...messages);
    this.lastActivityAt = new Date();
  }

  /**
   * 清空会话消息
   */
  clearMessages(): void {
    this.messages = [];
    this.lastActivityAt = new Date();
  }

  /**
   * 更新会话名称
   * @param name 新的会话名称
   */
  updateName(name: string): void {
    this.name = name;
    this.lastActivityAt = new Date();
  }

  /**
   * 更新会话元数据
   * @param metadata 新的元数据
   */
  updateMetadata(metadata: Record<string, any>): void {
    this.metadata = { ...this.metadata, ...metadata };
    this.lastActivityAt = new Date();
  }

  /**
   * 获取会话信息
   * @returns 会话信息对象
   */
  getInfo(): {
    id: string;
    name: string;
    createdAt: Date;
    lastActivityAt: Date;
    messageCount: number;
    metadata: Record<string, any>;
  } {
    return {
      id: this.id,
      name: this.name,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      messageCount: this.messages.length,
      metadata: this.metadata
    };
  }

  /**
   * 序列化会话
   * @returns 序列化后的会话对象
   */
  serialize(): any {
    return {
      id: this.id,
      name: this.name,
      createdAt: this.createdAt.toISOString(),
      lastActivityAt: this.lastActivityAt.toISOString(),
      messages: this.messages,
      metadata: this.metadata
    };
  }

  /**
   * 从序列化数据创建会话
   * @param data 序列化的会话数据
   * @returns 会话实例
   */
  static deserialize(data: any): Session {
    const session = new Session(data.name, data.messages, data.metadata);
    session.id = data.id;
    session.createdAt = new Date(data.createdAt);
    session.lastActivityAt = new Date(data.lastActivityAt);
    return session;
  }
}
