import * as fs from 'fs';
import * as path from 'path';
import type { Message } from '../types/index.js';

/**
 * 会话数据结构
 *
 * 表示一个保存的对话会话
 */
export interface SessionData {
  /** 会话唯一 ID */
  id: string;
  /** 会话名称（用于显示） */
  name: string;
  /** 创建时间（ISO 格式） */
  createdAt: string;
  /** 最后更新时间（ISO 格式） */
  updatedAt: string;
  /** 对话消息历史 */
  messages: Message[];
  /** 元数据信息 */
  metadata: {
    /** AI 提供商名称 */
    provider?: string;
    /** 使用的模型 */
    model?: string;
    /** 消息数量 */
    messageCount: number;
  };
}

/**
 * 会话管理器
 *
 * 核心功能：管理对话会话的持久化
 *
 * 功能：
 * - 保存会话到文件
 * - 加载已有会话
 * - 列出所有会话
 * - 导出/导入会话
 */
export class SessionManager {
  /** 会话存储目录 */
  private sessionsDir: string;

  /**
   * 构造函数
   *
   * @param sessionsDir - 会话存储目录路径，默认 .sessions
   */
  constructor(sessionsDir?: string) {
    this.sessionsDir = sessionsDir || path.join(process.cwd(), '.sessions');

    // 确保目录存在
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * 保存会话到文件
   *
   * @param session - 会话数据
   * @returns 会话 ID
   */
  async save(session: SessionData): Promise<string> {
    const filePath = this.getSessionPath(session.id);
    const data: SessionData = {
      ...session,
      updatedAt: new Date().toISOString(),
      metadata: {
        ...session.metadata,
        messageCount: session.messages.length,
      },
    };

    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return session.id;
  }

  /**
   * 从文件加载会话
   *
   * @param sessionId - 会话 ID
   * @returns 会话数据，如果不存在则返回 null
   */
  async load(sessionId: string): Promise<SessionData | null> {
    const filePath = this.getSessionPath(sessionId);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(content) as SessionData;
  }

  /**
   * 列出所有会话
   *
   * 按最后更新时间倒序排列
   *
   * @returns 会话数据数组
   */
  async list(): Promise<SessionData[]> {
    const files = await fs.promises.readdir(this.sessionsDir);
    const sessions: SessionData[] = [];

    for (const file of files) {
      // 只处理 JSON 文件
      if (!file.endsWith('.json')) continue;

      try {
        const content = await fs.promises.readFile(
          path.join(this.sessionsDir, file),
          'utf-8'
        );
        const data = JSON.parse(content) as SessionData;
        sessions.push(data);
      } catch {
        // 忽略无效文件
      }
    }

    // 按更新时间倒序
    return sessions.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * 删除会话
   *
   * @param sessionId - 会话 ID
   * @returns 是否删除成功
   */
  async delete(sessionId: string): Promise<boolean> {
    const filePath = this.getSessionPath(sessionId);

    if (!fs.existsSync(filePath)) {
      return false;
    }

    await fs.promises.unlink(filePath);
    return true;
  }

  /**
   * 导出会话为 JSON 字符串
   *
   * @param sessionId - 会话 ID
   * @returns JSON 字符串，如果不存在则返回 null
   */
  async exportSession(sessionId: string): Promise<string | null> {
    const session = await this.load(sessionId);
    if (!session) return null;
    return JSON.stringify(session, null, 2);
  }

  /**
   * 从 JSON 字符串导入会话
   *
   * @param jsonContent - JSON 字符串
   * @returns 导入后的会话数据
   */
  async importSession(jsonContent: string): Promise<SessionData> {
    const session = JSON.parse(jsonContent) as SessionData;

    // 验证格式
    if (!session.id || !session.messages) {
      throw new Error('Invalid session format');
    }

    // 修改 ID 以避免冲突
    session.id = `${session.id}-imported-${Date.now()}`;
    session.createdAt = new Date().toISOString();
    session.updatedAt = new Date().toISOString();

    await this.save(session);
    return session;
  }

  /**
   * 创建新会话
   *
   * @param options - 会话选项
   * @returns 新会话数据
   */
  createSession(options: {
    name?: string;
    provider?: string;
    model?: string;
    messages?: Message[];
  }): SessionData {
    const id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    return {
      id,
      name: options.name || `Session ${new Date().toLocaleDateString()}`,
      createdAt: now,
      updatedAt: now,
      messages: options.messages || [],
      metadata: {
        provider: options.provider,
        model: options.model,
        messageCount: 0,
      },
    };
  }

  /** 获取会话文件路径 */
  private getSessionPath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }
}

/**
 * 默认会话管理器实例
 */
export const sessionManager = new SessionManager();
