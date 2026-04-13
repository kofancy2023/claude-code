/**
 * 自主执行引擎
 *
 * 负责执行生成的计划，管理工作流
 */

import type {
  AutoExecuteConfig,
  ExecutionEvent,
  ExecutionListener,
  ExecutionPlan,
  ExecutionResult,
  SubTask,
} from './types.js';
import { DEFAULT_AUTO_EXECUTE_CONFIG, TaskStatus as TS } from './types.js';
import { ExecutionPlanner } from './planner.js';

/**
 * 任务执行上下文
 */
interface TaskContext {
  task: SubTask;
  startTime: number;
  resolve: (result: string) => void;
  reject: (error: Error) => void;
}

/**
 * 自主执行引擎
 *
 * 核心职责：
 * - 按计划执行子任务
 * - 管理并发执行
 * - 处理超时和重试
 * - 发出执行事件
 */
export class AutoExecuteEngine {
  private config: AutoExecuteConfig;
  private planner: ExecutionPlanner;
  private listeners: Set<ExecutionListener>;
  private currentPlan: ExecutionPlan | null = null;
  private isRunning: boolean;
  private shouldCancel: boolean;

  constructor(config: Partial<AutoExecuteConfig> = {}) {
    this.config = { ...DEFAULT_AUTO_EXECUTE_CONFIG, ...config };
    this.planner = new ExecutionPlanner();
    this.listeners = new Set();
    this.isRunning = false;
    this.shouldCancel = false;
  }

  /**
   * 执行计划
   */
  async execute(
    plan: ExecutionPlan,
    executeTaskFn: (task: SubTask) => Promise<string>
  ): Promise<ExecutionResult> {
    if (this.isRunning) {
      throw new Error('Engine is already running');
    }

    this.isRunning = true;
    this.shouldCancel = false;
    this.currentPlan = plan;
    plan.status = 'executing';

    const startTime = Date.now();

    this.emit({
      type: 'plan_started',
      planId: plan.id,
      timestamp: Date.now(),
    });

    try {
      await this.executePlan(plan, executeTaskFn);
    } catch (error) {
      this.emit({
        type: 'plan_failed',
        planId: plan.id,
        data: { error: error instanceof Error ? error.message : String(error) },
        timestamp: Date.now(),
      });
    }

    plan.status = this.getPlanStatus(plan);
    this.isRunning = false;

    const totalDuration = Date.now() - startTime;

    const result: ExecutionResult = {
      success: plan.status === 'completed',
      planId: plan.id,
      completedTasks: plan.tasks.filter((t) => t.status === TS.Completed).length,
      failedTasks: plan.tasks.filter((t) => t.status === TS.Failed).length,
      totalDuration,
      summary: this.planner.getPlanSummary(plan),
      results: plan.tasks.map((t) => ({
        taskId: t.id,
        description: t.description,
        status: t.status,
        result: t.result,
        error: t.error,
        duration: (t.endTime || 0) - (t.startTime || 0),
      })),
    };

    this.emit({
      type: result.success ? 'plan_completed' : 'plan_failed',
      planId: plan.id,
      data: result,
      timestamp: Date.now(),
    });

    return result;
  }

  /**
   * 内部执行循环
   */
  private async executePlan(
    plan: ExecutionPlan,
    executeTaskFn: (task: SubTask) => Promise<string>
  ): Promise<void> {
    const maxEndTime = Date.now() + this.config.maxTotalTimeout;

    while (!this.planner.isPlanComplete(plan) && !this.shouldCancel) {
      if (Date.now() > maxEndTime) {
        console.warn('[AutoExecuteEngine] Max total timeout reached');
        break;
      }

      const nextTasks = this.planner.getNextExecutableTasks(plan);

      if (nextTasks.length === 0) {
        await this.delay(100);
        continue;
      }

      const tasksToRun = nextTasks.slice(0, this.config.maxConcurrentTasks);

      const promises = tasksToRun.map((task) =>
        this.executeTaskWithRetry(plan, task, executeTaskFn)
      );

      await Promise.all(promises);

      this.emitProgress(plan);

      if (this.config.autoCancelStale) {
        await this.cancelStaleTasks(plan);
      }
    }
  }

  /**
   * 执行单个任务 (带重试)
   */
  private async executeTaskWithRetry(
    plan: ExecutionPlan,
    task: SubTask,
    executeTaskFn: (task: SubTask) => Promise<string>
  ): Promise<void> {
    while (task.retryCount <= this.config.maxRetries) {
      try {
        await this.executeSingleTask(plan, task, executeTaskFn);
        return;
      } catch (error) {
        task.retryCount++;

        if (task.retryCount > this.config.maxRetries) {
          this.planner.updateTaskStatus(
            plan,
            task.id,
            TS.Failed,
            undefined,
            error instanceof Error ? error.message : String(error)
          );

          this.emit({
            type: 'task_failed',
            planId: plan.id,
            taskId: task.id,
            data: { error: error instanceof Error ? error.message : String(error) },
            timestamp: Date.now(),
          });
        } else {
          console.log(`[AutoExecuteEngine] Retrying task ${task.id} (${task.retryCount}/${this.config.maxRetries})`);
          await this.delay(1000 * task.retryCount);
        }
      }
    }
  }

  /**
   * 执行单个任务
   */
  private async executeSingleTask(
    plan: ExecutionPlan,
    task: SubTask,
    executeTaskFn: (task: SubTask) => Promise<string>
  ): Promise<void> {
    this.planner.updateTaskStatus(plan, task.id, TS.Running);

    this.emit({
      type: 'task_started',
      planId: plan.id,
      taskId: task.id,
      data: { description: task.description },
      timestamp: Date.now(),
    });

    const timeoutPromise = this.timeout(this.config.taskTimeout);

    try {
      const result = await Promise.race([
        executeTaskFn(task),
        timeoutPromise,
      ]);

      this.planner.updateTaskStatus(plan, task.id, TS.Completed, result);

      this.emit({
        type: 'task_completed',
        planId: plan.id,
        taskId: task.id,
        data: { result },
        timestamp: Date.now(),
      });
    } catch (error) {
      this.planner.updateTaskStatus(
        plan,
        task.id,
        TS.Failed,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /**
   * 取消超时任务
   */
  private async cancelStaleTasks(plan: ExecutionPlan): Promise<void> {
    const staleThreshold = Date.now() - this.config.staleTimeout;

    for (const task of plan.tasks) {
      if (task.status === TS.Running && task.startTime && task.startTime < staleThreshold) {
        console.warn(`[AutoExecuteEngine] Cancelling stale task: ${task.id}`);

        this.planner.updateTaskStatus(
          plan,
          task.id,
          TS.Cancelled,
          undefined,
          'Task timed out'
        );

        this.emit({
          type: 'task_cancelled',
          planId: plan.id,
          taskId: task.id,
          data: { reason: 'stale_timeout' },
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * 获取计划最终状态
   */
  private getPlanStatus(plan: ExecutionPlan): ExecutionPlan['status'] {
    if (this.shouldCancel) {
      return 'cancelled';
    }

    if (this.planner.isPlanFailed(plan)) {
      return 'failed';
    }

    if (this.planner.isPlanComplete(plan)) {
      return 'completed';
    }

    return 'executing';
  }

  /**
   * 发出进度事件
   */
  private emitProgress(plan: ExecutionPlan): void {
    const progress = this.planner.getProgress(plan);

    this.emit({
      type: 'progress_update',
      planId: plan.id,
      data: progress,
      timestamp: Date.now(),
    });
  }

  /**
   * 注册事件监听器
   */
  addListener(listener: ExecutionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 发出事件
   */
  private emit(event: ExecutionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[AutoExecuteEngine] Listener error:', error);
      }
    }
  }

  /**
   * 取消执行
   */
  cancel(): void {
    if (!this.isRunning) {
      return;
    }

    this.shouldCancel = true;

    if (this.currentPlan) {
      this.planner.cancelPlan(this.currentPlan);
    }
  }

  /**
   * 是否正在运行
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 获取当前计划
   */
  getCurrentPlan(): ExecutionPlan | null {
    return this.currentPlan;
  }

  /**
   * 超时 Promise
   */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${ms}ms`));
      }, ms);
    });
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
