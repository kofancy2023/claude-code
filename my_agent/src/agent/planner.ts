/**
 * 执行计划器
 *
 * 负责根据任务依赖关系生成最优执行顺序
 */

import type { DecompositionResult, ExecutionPlan, SubTask } from './types.js';
import { TaskStatus } from './types.js';

/**
 * 执行计划器
 *
 * 将任务分解结果转换为可执行的计划
 */
export class ExecutionPlanner {
  /**
   * 根据分解结果生成执行计划
   */
  generatePlan(decomposition: DecompositionResult, query: string): ExecutionPlan {
    const planId = this.generateId();

    const tasks: SubTask[] = decomposition.tasks.map((task, index) => ({
      ...task,
      id: `task-${index + 1}`,
      status: TaskStatus.Pending,
      result: undefined,
      error: undefined,
      startTime: undefined,
      endTime: undefined,
      retryCount: 0,
    }));

    const sortedTasks = this.topologicalSort(tasks);

    return {
      id: planId,
      originalQuery: query,
      tasks: sortedTasks,
      createdAt: Date.now(),
      status: 'planning',
      estimatedDuration: this.estimateDuration(sortedTasks),
    };
  }

  /**
   * 拓扑排序 - 按依赖关系排序任务
   */
  private topologicalSort(tasks: SubTask[]): SubTask[] {
    const taskMap = new Map<string, SubTask>();
    const inDegree = new Map<string, number>();
    const result: SubTask[] = [];

    for (const task of tasks) {
      taskMap.set(task.id, task);
      inDegree.set(task.id, task.dependencies.length);
    }

    const queue: SubTask[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        const task = taskMap.get(id)!;
        queue.push(task);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      for (const task of tasks) {
        if (task.dependencies.includes(current.id)) {
          const newDegree = (inDegree.get(task.id) || 0) - 1;
          inDegree.set(task.id, newDegree);

          if (newDegree === 0) {
            queue.push(task);
          }
        }
      }
    }

    if (result.length !== tasks.length) {
      console.warn('[ExecutionPlanner] Circular dependency detected, using original order');
      return tasks;
    }

    return result;
  }

  /**
   * 获取下一个可执行的任务
   */
  getNextExecutableTasks(plan: ExecutionPlan): SubTask[] {
    const completedIds = new Set(
      plan.tasks
        .filter((t) => t.status === TaskStatus.Completed)
        .map((t) => t.id)
    );

    return plan.tasks.filter((task) => {
      if (task.status !== TaskStatus.Pending && task.status !== TaskStatus.WaitingForDeps) {
        return false;
      }

      return task.dependencies.every((depId) => completedIds.has(depId));
    });
  }

  /**
   * 检查计划是否完成
   */
  isPlanComplete(plan: ExecutionPlan): boolean {
    return plan.tasks.every(
      (task) => task.status === TaskStatus.Completed || task.status === TaskStatus.Failed
    );
  }

  /**
   * 检查计划是否失败
   */
  isPlanFailed(plan: ExecutionPlan): boolean {
    const hasFailed = plan.tasks.some((task) => task.status === TaskStatus.Failed);
    const allDone = plan.tasks.every(
      (task) =>
        task.status === TaskStatus.Completed ||
        task.status === TaskStatus.Failed ||
        task.status === TaskStatus.Cancelled
    );

    return hasFailed && allDone;
  }

  /**
   * 更新任务状态
   */
  updateTaskStatus(
    plan: ExecutionPlan,
    taskId: string,
    status: TaskStatus,
    result?: string,
    error?: string
  ): void {
    const task = plan.tasks.find((t) => t.id === taskId);

    if (!task) {
      console.warn(`[ExecutionPlanner] Task not found: ${taskId}`);
      return;
    }

    task.status = status;

    if (status === TaskStatus.Running) {
      task.startTime = Date.now();
    }

    if (status === TaskStatus.Completed || status === TaskStatus.Failed) {
      task.endTime = Date.now();
    }

    if (result) {
      task.result = result;
    }

    if (error) {
      task.error = error;
    }
  }

  /**
   * 获取计划进度
   */
  getProgress(plan: ExecutionPlan): { completed: number; total: number; percentage: number } {
    const completed = plan.tasks.filter(
      (t) => t.status === TaskStatus.Completed || t.status === TaskStatus.Failed
    ).length;

    return {
      completed,
      total: plan.tasks.length,
      percentage: Math.round((completed / plan.tasks.length) * 100),
    };
  }

  /**
   * 预估执行时间
   */
  private estimateDuration(tasks: SubTask[]): number {
    const avgTaskDuration = 30000;
    return tasks.length * avgTaskDuration;
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 验证计划
   */
  validatePlan(plan: ExecutionPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (plan.tasks.length === 0) {
      errors.push('Plan has no tasks');
    }

    const taskIds = new Set(plan.tasks.map((t) => t.id));

    for (const task of plan.tasks) {
      for (const depId of task.dependencies) {
        if (!taskIds.has(depId) && depId !== 'none') {
          errors.push(`Task ${task.id} has invalid dependency: ${depId}`);
        }
      }

      if (task.dependencies.includes(task.id)) {
        errors.push(`Task ${task.id} depends on itself`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 取消计划
   */
  cancelPlan(plan: ExecutionPlan): void {
    plan.status = 'cancelled';

    for (const task of plan.tasks) {
      if (task.status === TaskStatus.Pending || task.status === TaskStatus.WaitingForDeps) {
        task.status = TaskStatus.Cancelled;
      }
    }
  }

  /**
   * 获取计划摘要
   */
  getPlanSummary(plan: ExecutionPlan): string {
    const progress = this.getProgress(plan);
    const completed = plan.tasks.filter((t) => t.status === TaskStatus.Completed).length;
    const failed = plan.tasks.filter((t) => t.status === TaskStatus.Failed).length;

    return `Plan ${plan.id}: ${progress.percentage}% complete (${completed} done, ${failed} failed, ${progress.total - completed - failed} pending)`;
  }
}
