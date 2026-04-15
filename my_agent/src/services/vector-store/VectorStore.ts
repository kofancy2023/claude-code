import { v4 as uuidv4 } from 'uuid';

/**
 * 向量存储项接口
 */
export interface VectorStoreItem {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embedding: number[];
  timestamp: number;
  importance: number;
}

/**
 * 搜索结果接口
 */
export interface SearchResult {
  item: VectorStoreItem;
  score: number;
}

/**
 * 搜索选项接口
 */
export interface SearchOptions {
  limit?: number;
  threshold?: number;
  metadataFilter?: Record<string, any>;
}

/**
 * 向量存储类
 * 负责管理向量存储项，提供相似度搜索等功能
 */
export class VectorStore {
  private items: Map<string, VectorStoreItem> = new Map();
  private metadataIndex: Map<string, Map<string, Set<string>>> = new Map();

  /**
   * 添加向量存储项
   * @param item 存储项数据
   * @returns 存储项ID
   */
  addItem(item: Omit<VectorStoreItem, 'id' | 'timestamp'>): string {
    const id = uuidv4();
    const newItem: VectorStoreItem = {
      ...item,
      id,
      timestamp: Date.now()
    };

    this.items.set(id, newItem);
    this.updateMetadataIndex(id, newItem.metadata);

    return id;
  }

  /**
   * 批量添加向量存储项
   * @param items 存储项数组
   * @returns 存储项ID数组
   */
  addItems(items: Array<Omit<VectorStoreItem, 'id' | 'timestamp'>>): string[] {
    return items.map(item => this.addItem(item));
  }

  /**
   * 搜索相关向量存储项
   * @param query 搜索查询
   * @param options 搜索选项
   * @returns 搜索结果数组
   */
  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const {
      limit = 10,
      threshold = 0.5,
      metadataFilter
    } = options;

    // 这里使用简单的字符串相似度作为示例
    // 实际应用中应该使用真正的向量嵌入和余弦相似度计算
    const results: SearchResult[] = [];

    for (const item of this.items.values()) {
      // 应用元数据过滤
      if (metadataFilter && !this.matchesMetadata(item, metadataFilter)) {
        continue;
      }

      // 计算相似度（简单的字符串相似度）
      const score = this.calculateSimilarity(query, item.content);

      if (score >= threshold) {
        results.push({
          item,
          score
        });
      }
    }

    // 按相似度排序并限制结果数量
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 获取向量存储项
   * @param id 存储项ID
   * @returns 存储项或undefined
   */
  getItem(id: string): VectorStoreItem | undefined {
    return this.items.get(id);
  }

  /**
   * 删除向量存储项
   * @param id 存储项ID
   * @returns 是否删除成功
   */
  deleteItem(id: string): boolean {
    const item = this.items.get(id);
    if (!item) {
      return false;
    }

    this.items.delete(id);
    this.removeFromMetadataIndex(id, item.metadata);
    return true;
  }

  /**
   * 更新向量存储项
   * @param id 存储项ID
   * @param updates 更新数据
   * @returns 更新后的存储项或undefined
   */
  updateItem(id: string, updates: Partial<VectorStoreItem>): VectorStoreItem | undefined {
    const item = this.items.get(id);
    if (!item) {
      return undefined;
    }

    const updatedItem = {
      ...item,
      ...updates,
      timestamp: Date.now()
    };

    this.items.set(id, updatedItem);

    // 如果元数据有更新，更新索引
    if (updates.metadata) {
      this.removeFromMetadataIndex(id, item.metadata);
      this.updateMetadataIndex(id, updatedItem.metadata);
    }

    return updatedItem;
  }

  /**
   * 清空所有向量存储项
   */
  clear(): void {
    this.items.clear();
    this.metadataIndex.clear();
  }

  /**
   * 获取存储项数量
   * @returns 存储项数量
   */
  size(): number {
    return this.items.size;
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

  /**
   * 检查存储项是否匹配元数据过滤条件
   * @param item 存储项
   * @param filter 元数据过滤条件
   * @returns 是否匹配
   */
  private matchesMetadata(item: VectorStoreItem, filter: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (item.metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * 更新元数据索引
   * @param id 存储项ID
   * @param metadata 元数据
   */
  private updateMetadataIndex(id: string, metadata: Record<string, any>): void {
    for (const [key, value] of Object.entries(metadata)) {
      if (!this.metadataIndex.has(key)) {
        this.metadataIndex.set(key, new Map());
      }
      
      const keyMap = this.metadataIndex.get(key)!;
      if (!keyMap.has(String(value))) {
        keyMap.set(String(value), new Set());
      }
      
      keyMap.get(String(value))!.add(id);
    }
  }

  /**
   * 从元数据索引中移除
   * @param id 存储项ID
   * @param metadata 元数据
   */
  private removeFromMetadataIndex(id: string, metadata: Record<string, any>): void {
    for (const [key, value] of Object.entries(metadata)) {
      const keyMap = this.metadataIndex.get(key);
      if (keyMap) {
        const valueSet = keyMap.get(String(value));
        if (valueSet) {
          valueSet.delete(id);
          if (valueSet.size === 0) {
            keyMap.delete(String(value));
          }
        }
        if (keyMap.size === 0) {
          this.metadataIndex.delete(key);
        }
      }
    }
  }
}
