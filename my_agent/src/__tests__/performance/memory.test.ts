import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryManager, MemoryType } from '../../services/vector-store/MemoryManager';

describe('MemoryManager Performance', () => {
  let memoryManager: MemoryManager;

  beforeEach(() => {
    memoryManager = new MemoryManager();
  });

  afterEach(async () => {
    // 清理测试数据
    // 注意：MemoryManager 目前没有 clear 方法，后续可以添加
  });

  it('should handle adding 1000 memories efficiently', async () => {
    const startTime = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      await memoryManager.addMemory(
        `Test memory ${i}: This is a test memory to measure performance`,
        MemoryType.SHORT_TERM,
        { category: 'test', index: i },
        1.0
      );
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Added 1000 memories in ${duration}ms`);
    
    // 期望添加 1000 个记忆的时间不超过 2 秒
    expect(duration).toBeLessThan(2000);
  });

  it('should retrieve memories efficiently', async () => {
    // 先添加一些测试数据
    for (let i = 0; i < 500; i++) {
      await memoryManager.addMemory(
        `Memory ${i}: This is about ${i % 10 === 0 ? 'performance' : 'other topic'}`,
        MemoryType.SHORT_TERM,
        { category: i % 10 === 0 ? 'performance' : 'other' },
        1.0
      );
    }
    
    const startTime = Date.now();
    
    // 执行多次检索
    for (let i = 0; i < 100; i++) {
      await memoryManager.retrieveMemory('performance test', {
        limit: 5,
        recencyWeight: 0.4,
        importanceWeight: 0.3,
        relevanceWeight: 0.3
      });
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Retrieved 100 times in ${duration}ms`);
    
    // 期望 100 次检索的时间不超过 1 秒
    expect(duration).toBeLessThan(1000);
  });

  it('should clean short term memory efficiently', async () => {
    // 先添加一些测试数据
    for (let i = 0; i < 100; i++) {
      await memoryManager.addMemory(
        `Memory ${i}: This is a test memory`,
        MemoryType.SHORT_TERM,
        { category: 'test' },
        1.0
      );
    }
    
    const startTime = Date.now();
    
    // 清理短期记忆
    await memoryManager.cleanShortTermMemory(1); // 1ms 阈值，应该清理所有记忆
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Cleaned short term memory in ${duration}ms`);
    
    // 期望清理操作的时间不超过 500ms
    expect(duration).toBeLessThan(500);
  });

  it('should handle memory retrieval with different weights', async () => {
    // 先添加一些测试数据
    for (let i = 0; i < 200; i++) {
      await memoryManager.addMemory(
        `Memory ${i}: This is memory number ${i}`,
        i % 2 === 0 ? MemoryType.SHORT_TERM : MemoryType.LONG_TERM,
        { category: `cat${i % 5}` },
        i % 10 === 0 ? 2.0 : 1.0 // 每10个记忆设置更高的重要性
      );
    }
    
    const startTime = Date.now();
    
    // 使用不同的权重配置进行检索
    const weights = [
      { recency: 0.6, importance: 0.2, relevance: 0.2 },
      { recency: 0.2, importance: 0.6, relevance: 0.2 },
      { recency: 0.2, importance: 0.2, relevance: 0.6 }
    ];
    
    for (const weight of weights) {
      await memoryManager.retrieveMemory('memory number', {
        limit: 5,
        recencyWeight: weight.recency,
        importanceWeight: weight.importance,
        relevanceWeight: weight.relevance
      });
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Retrieved with different weights in ${duration}ms`);
    
    // 期望不同权重配置的检索时间不超过 500ms
    expect(duration).toBeLessThan(500);
  });
});