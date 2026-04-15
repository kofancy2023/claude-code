import { describe, it, expect, beforeEach } from 'vitest';
import { BashTool } from '../../tools/BashTool';
import { FileWriteTool } from '../../tools/FileWriteTool';
import { FileReadTool } from '../../tools/FileReadTool';
import * as fs from 'fs';
import * as path from 'path';

describe('Tool Performance', () => {
  let testFile: string;

  beforeEach(() => {
    testFile = path.join(__dirname, 'test_performance.txt');
  });

  it('should execute BashTool efficiently', async () => {
    const startTime = Date.now();
    
    // 执行多次简单的 bash 命令
    for (let i = 0; i < 10; i++) {
      await BashTool.execute({ command: 'echo test' });
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Executed 10 bash commands in ${duration}ms`);
    
    // 期望 10 次 bash 命令执行的时间不超过 2 秒
    expect(duration).toBeLessThan(2000);
  });

  it('should execute FileWriteTool efficiently', async () => {
    const testContent = 'This is a test file for performance testing';
    
    const startTime = Date.now();
    
    // 执行多次文件写入
    for (let i = 0; i < 20; i++) {
      await FileWriteTool.execute({
        path: testFile,
        content: `${testContent} ${i}`
      });
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Wrote to file 20 times in ${duration}ms`);
    
    // 期望 20 次文件写入的时间不超过 1 秒
    expect(duration).toBeLessThan(1000);
    
    // 清理测试文件
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });

  it('should execute FileReadTool efficiently', async () => {
    // 先创建一个测试文件
    const testContent = 'This is a test file for performance testing';
    await FileWriteTool.execute({
      path: testFile,
      content: testContent
    });
    
    const startTime = Date.now();
    
    // 执行多次文件读取
    for (let i = 0; i < 50; i++) {
      await FileReadTool.execute({ path: testFile });
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Read from file 50 times in ${duration}ms`);
    
    // 期望 50 次文件读取的时间不超过 500ms
    expect(duration).toBeLessThan(500);
    
    // 清理测试文件
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });

  it('should handle tool chain efficiently', async () => {
    // 测试工具链执行性能
    const startTime = Date.now();
    
    // 执行一系列工具操作
    for (let i = 0; i < 5; i++) {
      // 写入文件
      await FileWriteTool.execute({
        path: testFile,
        content: `Test ${i}`
      });
      
      // 读取文件
      await FileReadTool.execute({ path: testFile });
      
      // 执行 bash 命令
      await BashTool.execute({ command: 'echo tool chain test' });
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Executed 5 tool chains in ${duration}ms`);
    
    // 期望 5 次工具链执行的时间不超过 3 秒
    expect(duration).toBeLessThan(3000);
    
    // 清理测试文件
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });
});