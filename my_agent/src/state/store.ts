import type { Message, Tool, AppState } from '../types/index.js';

/**
 * 创建状态存储
 *
 * 这是一个简单的响应式状态管理实现：
 * - 支持获取和设置状态
 * - 支持订阅状态变化
 *
 * 用于管理 REPL 运行时的全局状态
 *
 * @param initialState - 初始状态
 */
export function createStore(initialState: Partial<AppState> = {}) {
  // 内部状态
  let state: AppState = {
    messages: [],  // 对话消息历史
    tools: [],     // 已注册的工具列表
    ...initialState,
  };

  // 状态变化监听器集合
  const listeners = new Set<() => void>();

  return {
    /**
     * 获取当前完整状态
     */
    getState(): AppState {
      return state;
    },

    /**
     * 获取对话消息历史
     */
    getMessages(): Message[] {
      return state.messages;
    },

    /**
     * 获取已注册的工具列表
     */
    getTools(): Tool[] {
      return state.tools;
    },

    /**
     * 添加一条消息到历史
     *
     * @param message - 要添加的消息
     */
    addMessage(message: Message): void {
      state = {
        ...state,
        messages: [...state.messages, message],
      };
      // 通知所有监听器
      listeners.forEach((l) => l());
    },

    /**
     * 设置工具列表
     *
     * @param tools - 工具列表
     */
    setTools(tools: Tool[]): void {
      state = {
        ...state,
        tools,
      };
      // 通知所有监听器
      listeners.forEach((l) => l());
    },

    /**
     * 订阅状态变化
     *
     * @param listener - 状态变化时的回调函数
     * @returns 取消订阅的函数
     */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      // 返回取消订阅函数
      return () => listeners.delete(listener);
    },
  };
}

/**
 * 状态存储类型
 * 由 createStore 返回
 */
export type Store = ReturnType<typeof createStore>;
