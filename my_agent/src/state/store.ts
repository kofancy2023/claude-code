import type { Message, Tool, AppState } from '../types/index.js';

export function createStore(initialState: Partial<AppState> = {}) {
  let state: AppState = {
    messages: [],
    tools: [],
    ...initialState,
  };

  const listeners = new Set<() => void>();

  return {
    getState(): AppState {
      return state;
    },

    getMessages(): Message[] {
      return state.messages;
    },

    getTools(): Tool[] {
      return state.tools;
    },

    addMessage(message: Message): void {
      state = {
        ...state,
        messages: [...state.messages, message],
      };
      listeners.forEach((l) => l());
    },

    setTools(tools: Tool[]): void {
      state = {
        ...state,
        tools,
      };
      listeners.forEach((l) => l());
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type Store = ReturnType<typeof createStore>;
