import { SessionManager } from '../services/session';
import { terminal } from '../ui/terminal';

/**
 * 会话管理命令
 * 提供会话的创建、列出、切换、重命名和删除等操作
 */
export class SessionCommands {
  private sessionManager: SessionManager;

  /**
   * 构造函数
   * @param sessionManager 会话管理器实例
   */
  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * 创建新会话
   * @param name 会话名称
   */
  createSession(name: string): void {
    const session = this.sessionManager.createSession(name);
    terminal.success(`Created session: ${name} (ID: ${session.id})`);
  }

  /**
   * 列出所有会话
   */
  listSessions(): void {
    const sessions = this.sessionManager.getSessionList();
    if (sessions.length === 0) {
      terminal.info('No sessions found');
      return;
    }

    const activeSessionId = this.sessionManager.getActiveSession()?.id;

    terminal.info('Sessions:');
    sessions.forEach(session => {
      const activeIndicator = session.id === activeSessionId ? ' [Active]' : '';
      terminal.info(`- ${session.name} (ID: ${session.id})${activeIndicator}`);
      terminal.info(`  Created: ${session.createdAt.toLocaleString()}`);
      terminal.info(`  Last Activity: ${session.lastActivityAt.toLocaleString()}`);
      terminal.info(`  Messages: ${session.messageCount}`);
      terminal.info('');
    });
  }

  /**
   * 切换会话
   * @param sessionId 会话ID
   */
  switchSession(sessionId: string): void {
    const session = this.sessionManager.setActiveSession(sessionId);
    if (session) {
      terminal.success(`Switched to session: ${session.name}`);
    } else {
      terminal.error(`Session not found: ${sessionId}`);
    }
  }

  /**
   * 重命名会话
   * @param sessionId 会话ID
   * @param newName 新的会话名称
   */
  renameSession(sessionId: string, newName: string): void {
    const session = this.sessionManager.updateSession(sessionId, { name: newName });
    if (session) {
      terminal.success(`Renamed session to: ${newName}`);
    } else {
      terminal.error(`Session not found: ${sessionId}`);
    }
  }

  /**
   * 删除会话
   * @param sessionId 会话ID
   */
  deleteSession(sessionId: string): void {
    const success = this.sessionManager.deleteSession(sessionId);
    if (success) {
      terminal.success(`Deleted session: ${sessionId}`);
    } else {
      terminal.error(`Session not found: ${sessionId}`);
    }
  }

  /**
   * 显示当前会话信息
   */
  showCurrentSession(): void {
    const session = this.sessionManager.getActiveSession();
    if (session) {
      terminal.info('Current Session:');
      terminal.info(`Name: ${session.name}`);
      terminal.info(`ID: ${session.id}`);
      terminal.info(`Created: ${session.createdAt.toLocaleString()}`);
      terminal.info(`Last Activity: ${session.lastActivityAt.toLocaleString()}`);
      terminal.info(`Messages: ${session.messages.length}`);
      if (Object.keys(session.metadata).length > 0) {
        terminal.info('Metadata:');
        Object.entries(session.metadata).forEach(([key, value]) => {
          terminal.info(`  ${key}: ${value}`);
        });
      }
    } else {
      terminal.info('No active session');
    }
  }

  /**
   * 清空当前会话消息
   */
  clearSession(): void {
    const session = this.sessionManager.getActiveSession();
    if (session) {
      session.clearMessages();
      terminal.success('Cleared session messages');
    } else {
      terminal.error('No active session');
    }
  }
}
