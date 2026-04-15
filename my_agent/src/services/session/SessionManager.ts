import { Session } from './Session';
import { Message } from '../../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 会话管理器
 * 管理多个会话的创建、保存、加载和删除等操作
 */
export class SessionManager {
  /** 会话存储目录 */
  private sessionDir: string;
  /** 当前活动会话 */
  private activeSession: Session | null = null;
  /** 会话列表 */
  private sessions: Map<string, Session> = new Map();

  /**
   * 构造函数
   * @param sessionDir 会话存储目录
   */
  constructor(sessionDir: string = path.join(process.cwd(), '.my_agent', 'sessions')) {
    this.sessionDir = sessionDir;
    this._ensureSessionDir();
    this._loadSessions();
  }

  /**
   * 确保会话目录存在
   */
  private _ensureSessionDir(): void {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  /**
   * 加载所有会话
   */
  private _loadSessions(): void {
    try {
      const files = fs.readdirSync(this.sessionDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.sessionDir, file);
          const data = fs.readFileSync(filePath, 'utf8');
          const session = Session.deserialize(JSON.parse(data));
          this.sessions.set(session.id, session);
        }
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  }

  /**
   * 保存会话到文件
   * @param session 会话对象
   */
  private _saveSession(session: Session): void {
    try {
      const filePath = path.join(this.sessionDir, `${session.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(session.serialize(), null, 2));
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }

  /**
   * 删除会话文件
   * @param sessionId 会话ID
   */
  private _deleteSessionFile(sessionId: string): void {
    try {
      const filePath = path.join(this.sessionDir, `${sessionId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error('Error deleting session file:', error);
    }
  }

  /**
   * 创建新会话
   * @param name 会话名称
   * @param initialMessages 初始消息列表
   * @param metadata 会话元数据
   * @returns 新创建的会话
   */
  createSession(name: string, initialMessages: Message[] = [], metadata: Record<string, any> = {}): Session {
    const session = new Session(name, initialMessages, metadata);
    this.sessions.set(session.id, session);
    this._saveSession(session);
    this.activeSession = session;
    return session;
  }

  /**
   * 获取会话
   * @param sessionId 会话ID
   * @returns 会话对象，如果不存在则返回undefined
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 获取所有会话
   * @returns 会话对象数组
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 获取会话列表信息
   * @returns 会话信息对象数组
   */
  getSessionList(): Array<{
    id: string;
    name: string;
    createdAt: Date;
    lastActivityAt: Date;
    messageCount: number;
    metadata: Record<string, any>;
  }> {
    return Array.from(this.sessions.values()).map(session => session.getInfo());
  }

  /**
   * 设置活动会话
   * @param sessionId 会话ID
   * @returns 活动会话对象，如果不存在则返回null
   */
  setActiveSession(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.activeSession = session;
    }
    return this.activeSession;
  }

  /**
   * 获取活动会话
   * @returns 活动会话对象，如果没有活动会话则返回null
   */
  getActiveSession(): Session | null {
    return this.activeSession;
  }

  /**
   * 更新会话
   * @param sessionId 会话ID
   * @param updates 更新内容
   * @returns 更新后的会话对象，如果不存在则返回undefined
   */
  updateSession(sessionId: string, updates: { name?: string; metadata?: Record<string, any> }): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (updates.name !== undefined) {
        session.updateName(updates.name);
      }
      if (updates.metadata !== undefined) {
        session.updateMetadata(updates.metadata);
      }
      this._saveSession(session);
    }
    return session;
  }

  /**
   * 删除会话
   * @param sessionId 会话ID
   * @returns 是否删除成功
   */
  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      this._deleteSessionFile(sessionId);
      if (this.activeSession?.id === sessionId) {
        this.activeSession = null;
      }
      return true;
    }
    return false;
  }

  /**
   * 保存所有会话
   */
  saveAllSessions(): void {
    for (const session of this.sessions.values()) {
      this._saveSession(session);
    }
  }

  /**
   * 关闭会话管理器
   */
  close(): void {
    this.saveAllSessions();
  }
}
