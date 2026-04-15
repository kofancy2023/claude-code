import { VectorStore, VectorStoreItem, SearchResult } from './VectorStore';

/**
 * 记忆类型枚举
 */
export enum MemoryType {
  SHORT_TERM = 'short_term',
  LONG_TERM = 'long_term',
  WORKING = 'working'
}

/**
 * 记忆项接口
 */
export interface MemoryItem {
  id: string;
  content: string;
  type: MemoryType;
  metadata: Record<string, any>;
  timestamp: number;
  importance: number;
}

/**
 * 记忆管理类
 * 负责管理不同类型的记忆，提供记忆检索和管理功能
 */
export class MemoryManager {
  private vectorStore: VectorStore;
  private workingMemory: Map<string, MemoryItem> = new Map();
  private shortTermMemoryExpiry: number = 24 * 60 * 60 * 1000; // 24小时

  /**
   * 构造函数
   */
  constructor() {
    this.vectorStore = new VectorStore();
  }

  /**
   * 添加记忆
   * @param content 记忆内容
   * @param type 记忆类型
   * @param metadata 元数据
   * @param importance 重要性（0-1）
   * @returns 记忆ID
   */
  addMemory(
    content: string,
    type: MemoryType,
    metadata: Record<string, any> = {},
    importance: number = 0.5
  ): string {
    // 为工作记忆创建特殊处理
    if (type === MemoryType.WORKING) {
      const id = `working-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const memoryItem: MemoryItem = {
        id,
        content,
        type,
        metadata,
        timestamp: Date.now(),
        importance
      };
      
      this.workingMemory.set(id, memoryItem);
      
      // 限制工作记忆大小
      if (this.workingMemory.size > 100) {
        const oldestKey = Array.from(this.workingMemory.keys())[0];
        this.workingMemory.delete(oldestKey);
      }
      
      return id;
    }

    // 其他类型的记忆存储到向量存储
    const id = this.vectorStore.addItem({
      content,
      metadata: {
        ...metadata,
        memoryType: type
      },
      embedding: [], // 实际应用中应该生成真实的向量嵌入
      importance
    });

    return id;
  }

  /**
   * 检索相关记忆
   * @param query 查询内容
   * @param limit 结果数量限制
   * @param types 记忆类型过滤
   * @returns 搜索结果数组
   */
  retrieveMemory(
    query: string,
    limit: number = 5,
    types: MemoryType[] = [MemoryType.SHORT_TERM, MemoryType.LONG_TERM, MemoryType.WORKING]
  ): SearchResult[] {
    const results: SearchResult[] = [];

    // 1. 检索工作记忆
    if (types.includes(MemoryType.WORKING)) {
      for (const item of this.workingMemory.values()) {
        const score = this.calculateSimilarity(query, item.content);
        if (score > 0.3) {
          results.push({
            item: {
              id: item.id,
              content: item.content,
              metadata: item.metadata,
              embedding: [],
              timestamp: item.timestamp,
              importance: item.importance
            },
            score
          });
        }
      }
    }

    // 2. 检索向量存储中的记忆
    if (types.includes(MemoryType.SHORT_TERM) || types.includes(MemoryType.LONG_TERM)) {
      const memoryTypes = [];
      if (types.includes(MemoryType.SHORT_TERM)) memoryTypes.push(MemoryType.SHORT_TERM);
      if (types.includes(MemoryType.LONG_TERM)) memoryTypes.push(MemoryType.LONG_TERM);

      const vectorResults = this.vectorStore.search(query, {
        limit: limit - results.length,
        threshold: 0.3,
        metadataFilter: memoryTypes.length > 0 ? { memoryType: { $in: memoryTypes } } : undefined
      });

      results.push(...vectorResults);
    }

    // 按相似度和重要性排序
    return results
      .sort((a, b) => {
        // 综合考虑相似度和重要性
        const scoreA = a.score * 0.7 + a.item.importance * 0.3;
        const scoreB = b.score * 0.7 + b.item.importance * 0.3;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  /**
   * 删除记忆
   * @param id 记忆ID
   * @returns 是否删除成功
   */
  deleteMemory(id: string): boolean {
    // 先检查工作记忆
    if (this.workingMemory.has(id)) {
      this.workingMemory.delete(id);
      return true;
    }

    // 再检查向量存储
    return this.vectorStore.deleteItem(id);
  }

  /**
   * 清理过期的短期记忆
   * @returns 清理的记忆数量
   */
  cleanShortTermMemory(): number {
    const now = Date.now();
    let cleanedCount = 0;

    // 清理向量存储中的短期记忆
    // 注意：这里简化处理，实际应该遍历所有短期记忆并检查过期时间
    // 由于VectorStore没有提供按条件删除的方法，这里暂时不实现

    return cleanedCount;
  }

  /**
   * 提升记忆重要性
   * @param id 记忆ID
   * @param boost 提升幅度（0-1）
   * @returns 是否提升成功
   */
  boostMemoryImportance(id: string, boost: number): boolean {
    // 检查工作记忆
    if (this.workingMemory.has(id)) {
      const item = this.workingMemory.get(id)!;
      item.importance = Math.min(1, item.importance + boost);
      item.timestamp = Date.now();
      return true;
    }

    // 检查向量存储
    const item = this.vectorStore.getItem(id);
    if (item) {
      this.vectorStore.updateItem(id, {
        importance: Math.min(1, item.importance + boost)
      });
      return true;
    }

    return false;
  }

  /**
   * 获取记忆统计信息
   * @returns 记忆统计
   */
  getStats(): {
    shortTerm: number;
    longTerm: number;
    working: number;
    total: number;
  } {
    const workingCount = this.workingMemory.size;
    const totalCount = this.vectorStore.size();
    
    // 这里简化处理，实际应该分别统计短期和长期记忆
    const shortTerm = Math.floor(totalCount * 0.7);
    const longTerm = totalCount - shortTerm;

    return {
      shortTerm,
      longTerm,
      working: workingCount,
      total: totalCount + workingCount
    };
  }

  /**
   * 清空所有记忆
   */
  clearAll(): void {
    this.workingMemory.clear();
    this.vectorStore.clear();
  }

  /**
   * 计算字符串相似度（简单实现）
   * @param query 查询字符串
   * @param content 内容字符串
   * @returns 相似度分数（0-1）
   */
  private calculateSimilarity(query: string, content: string): number {
    // 简单的字符串相似度计算
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const contentWords = new Set(content.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...queryWords].filter(word => contentWords.has(word)));
    const union = new Set([...queryWords, ...contentWords]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }
}
