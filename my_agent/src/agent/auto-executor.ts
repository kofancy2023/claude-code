/**
 * 自主执行器
 *
 * 整合任务分解器、执行计划器和执行引擎
 * 提供简洁的自动执行接口
 */

import type { AIProvider } from '../services/api/types.js';
import type { Tool } from '../types/index.js';
import { toolRegistry } from '../tools/registry.js';
import type {
  AutoExecuteConfig,
  DecompositionResult,
  ExecutionListener,
  ExecutionPlan,
  ExecutionResult,
} from './types.js';
import { DEFAULT_AUTO_EXECUTE_CONFIG } from './types.js';
import { TaskDecomposer } from './decomposer.js';
import { ExecutionPlanner } from './planner.js';
import { AutoExecuteEngine } from './engine.js';

/**
 * 自主执行器配置
 */
export interface AutoExecutorOptions {
  /** AI 提供者 */
  aiProvider: AIProvider;

  /** 执行配置 */
  config?: Partial<AutoExecuteConfig>;

  /** 工具选择器函数 */
  getAvailableTools?: () => Tool[];
}

/**
 * 计划确认回调
 */
export type PlanApprovalCallback = (plan: ExecutionPlan) => Promise<boolean>;

/**
 * 自主执行器
 *
 * 对外提供自动执行复杂任务的接口
 *
 * @example
 * ```typescript
 * const executor = new AutoExecutor({ aiProvider });
 *
 * // 添加进度监听
 * executor.onProgress((event) => {
 *   console.log(`Progress: ${event.data.percentage}%`);
 * });
 *
 * // 执行任务
 * const result = await executor.execute(
 *   '帮我把所有 TODO 找出来并生成报告'
 * );
 *
 * console.log(result.summary);
 * ```
 */
export class AutoExecutor {
  private aiProvider: AIProvider;
  private config: AutoExecuteConfig;
  private planner: ExecutionPlanner;
  private engine: AutoExecuteEngine;
  private decomposer: TaskDecomposer | null = null;
  private listeners: Set<ExecutionListener>;
  private approvalCallback: PlanApprovalCallback | null = null;

  constructor(options: AutoExecutorOptions) {
    this.aiProvider = options.aiProvider;
    this.config = { ...DEFAULT_AUTO_EXECUTE_CONFIG, ...options.config };
    this.planner = new ExecutionPlanner();
    this.engine = new AutoExecuteEngine(this.config);
    this.listeners = new Set();

    this.setupEngineListeners();
  }

  /**
   * 设置引擎事件监听
   */
  private setupEngineListeners(): void {
    this.engine.addListener((event) => {
      for (const listener of this.listeners) {
        listener(event);
      }
    });
  }

  /**
   * 初始化分解器
   */
  private initDecomposer(): void {
    if (!this.decomposer) {
      this.decomposer = new TaskDecomposer({
        aiProvider: this.aiProvider,
        availableTools: toolRegistry.getAll(),
      });
    }
  }

  /**
   * 执行任务
   *
   * @param query - 用户查询
   * @returns 执行结果
   */
  async execute(query: string): Promise<ExecutionResult> {
    this.initDecomposer();

    const decomposition = await this.decomposer!.decompose(query);

    if (!decomposition.success) {
      return {
        success: false,
        planId: 'failed',
        completedTasks: 0,
        failedTasks: 0,
        totalDuration: 0,
        summary: `任务分解失败: ${decomposition.error}`,
        results: [],
      };
    }

    const plan = this.planner.generatePlan(decomposition, query);

    const validation = this.planner.validatePlan(plan);
    if (!validation.valid) {
      return {
        success: false,
        planId: plan.id,
        completedTasks: 0,
        failedTasks: 0,
        totalDuration: 0,
        summary: `计划验证失败: ${validation.errors.join(', ')}`,
        results: [],
      };
    }

    if (this.config.requirePlanApproval && this.approvalCallback) {
      const approved = await this.approvalCallback(plan);
      if (!approved) {
        return {
          success: false,
          planId: plan.id,
          completedTasks: 0,
          failedTasks: 0,
          totalDuration: 0,
          summary: '用户取消执行',
          results: [],
        };
      }
    }

    const result = await this.engine.execute(plan, async (task) => {
      return task.tool.execute(task.input);
    });

    return result;
  }

  /**
   * 分解任务 (不执行)
   */
  async decompose(query: string): Promise<DecompositionResult> {
    this.initDecomposer();
    return this.decomposer!.decompose(query);
  }

  /**
   * 生成执行计划 (不执行)
   */
  async plan(query: string): Promise<ExecutionPlan | null> {
    this.initDecomposer();

    const decomposition = await this.decomposer!.decompose(query);

    if (!decomposition.success) {
      return null;
    }

    return this.planner.generatePlan(decomposition, query);
  }

  /**
   * 执行已有计划
   */
  async executePlan(plan: ExecutionPlan): Promise<ExecutionResult> {
    return this.engine.execute(plan, async (task) => {
      return task.tool.execute(task.input);
    });
  }

  /**
   * 添加事件监听器
   */
  on(listener: ExecutionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 添加进度监听器
   */
  onProgress(callback: (progress: { completed: number; total: number; percentage: number }) => void): () => void {
    return this.on((event) => {
      if (event.type === 'progress_update' && event.data) {
        callback(event.data as { completed: number; total: number; percentage: number });
      }
    });
  }

  /**
   * 设置计划确认回调
   */
  setApprovalCallback(callback: PlanApprovalCallback | null): void {
    this.approvalCallback = callback;
  }

  /**
   * 取消执行
   */
  cancel(): void {
    this.engine.cancel();
  }

  /**
   * 是否正在执行
   */
  isRunning(): boolean {
    return this.engine.getIsRunning();
  }

  /**
   * 获取当前计划
   */
  getCurrentPlan(): ExecutionPlan | null {
    return this.engine.getCurrentPlan();
  }

  /**
   * 获取配置
   */
  getConfig(): AutoExecuteConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AutoExecuteConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * 创建自主执行器
 */
export function createAutoExecutor(options: AutoExecutorOptions): AutoExecutor {
  return new AutoExecutor(options);
}
