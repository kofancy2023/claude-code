import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../services/session';
import * as fs from 'fs';
import * as path from 'path';

describe('SessionManager Performance', () => {
  let sessionManager: SessionManager;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(__dirname, '.test_sessions');
    sessionManager = new SessionManager(testDir);
  });

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should create and save sessions efficiently', async () => {
    const startTime = Date.now();
    
    // 创建并保存多个会话
    for (let i = 0; i < 10; i++) {
      const session = sessionManager.createSession({
        name: `Test Session ${i}`,
        provider: 'glm',
        model: 'glm-4',
        messages: [
          {
            role: 'user',
            content: `Hello ${i}`
          },
          {
            role: 'assistant',
            content: `Hi ${i}`
          }
        ]
      });
      await sessionManager.save(session);
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Created and saved 10 sessions in ${duration}ms`);
    
    // 期望创建和保存 10 个会话的时间不超过 2 秒
    expect(duration).toBeLessThan(2000);
  });

  it('should load sessions efficiently', async () => {
    // 先创建一些测试会话
    const sessionIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const session = sessionManager.createSession({
        name: `Test Session ${i}`,
        messages: [
          {
            role: 'user',
            content: `Hello ${i}`
          }
        ]
      });
      await sessionManager.save(session);
      sessionIds.push(session.id);
    }
    
    const startTime = Date.now();
    
    // 加载所有会话
    for (const sessionId of sessionIds) {
      await sessionManager.load(sessionId);
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Loaded 10 sessions in ${duration}ms`);
    
    // 期望加载 10 个会话的时间不超过 1 秒
    expect(duration).toBeLessThan(1000);
  });

  it('should list sessions efficiently', async () => {
    // 先创建一些测试会话
    for (let i = 0; i < 20; i++) {
      const session = sessionManager.createSession({
        name: `Test Session ${i}`,
        messages: [
          {
            role: 'user',
            content: `Hello ${i}`
          }
        ]
      });
      await sessionManager.save(session);
    }
    
    const startTime = Date.now();
    
    // 列出会话
    const sessions = await sessionManager.list();
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Listed ${sessions.length} sessions in ${duration}ms`);
    
    // 期望列出 20 个会话的时间不超过 1 秒
    expect(duration).toBeLessThan(1000);
    expect(sessions.length).toBe(20);
  });

  it('should export and import sessions efficiently', async () => {
    // 先创建一个测试会话
    const session = sessionManager.createSession({
      name: 'Test Session',
      messages: [
        {
          role: 'user',
          content: 'Hello'
        },
        {
          role: 'assistant',
          content: 'Hi'
        }
      ]
    });
    await sessionManager.save(session);
    
    const startTime = Date.now();
    
    // 导出会话
    const exportedContent = await sessionManager.exportSession(session.id);
    expect(exportedContent).not.toBeNull();
    
    // 导入会话
    const importedSession = await sessionManager.importSession(exportedContent!);
    expect(importedSession).toBeDefined();
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Exported and imported session in ${duration}ms`);
    
    // 期望导出和导入会话的时间不超过 500ms
    expect(duration).toBeLessThan(500);
  });

  it('should handle large sessions efficiently', async () => {
    // 创建一个包含大量消息的会话
    const messages = [];
    for (let i = 0; i < 100; i++) {
      messages.push(
        {
          role: 'user' as const,
          content: `Message ${i} from user`
        },
        {
          role: 'assistant' as const,
          content: `Message ${i} from assistant`
        }
      );
    }
    
    const session = sessionManager.createSession({
      name: 'Large Session',
      messages
    });
    
    const startTime = Date.now();
    
    // 保存大会话
    await sessionManager.save(session);
    
    // 加载大会话
    const loadedSession = await sessionManager.load(session.id);
    expect(loadedSession).not.toBeNull();
    expect(loadedSession!.messages.length).toBe(messages.length);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Handled large session (${messages.length} messages) in ${duration}ms`);
    
    // 期望处理包含 200 条消息的会话的时间不超过 2 秒
    expect(duration).toBeLessThan(2000);
  });
});